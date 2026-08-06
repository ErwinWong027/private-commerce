import {
  HandoffTicketRecord,
  OrderIntakeRecord,
  PendingHumanRequestRecord,
  PresalesDashboardState,
  PresalesDecision,
  PresalesSession,
} from "@/types";
import { presalesKnowledgeBase, quickQuestions } from "@/lib/presalesKnowledge";

const DEMO_SESSION_ID = "S-001";

let session = createInitialSession();
let handoffTickets: HandoffTicketRecord[] = [];
let pendingHumanRequests: PendingHumanRequestRecord[] = [];
let orderIntakes: OrderIntakeRecord[] = [];
let totalMessages = 0;
let autoServedMessages = 0;
let wrongPriceCount = 0;

export function recordDecision(
  message: string,
  decision: PresalesDecision,
  history: Array<{ role: string; content: string }> = [],
  sourceChannel = "抖音投流加粉",
): void {
  totalMessages += 1;
  if (!decision.needHuman) {
    autoServedMessages += 1;
  }

  const conversationContext = buildConversationContext(history, message, decision.reply, decision.silentIntercept);

  session = {
    ...session,
    status: decision.needHuman ? "handoff" : "ai_serving",
    sourceChannel,
    firstResponseAt: session.firstResponseAt ?? new Date().toISOString(),
    lastIntent: decision.intent,
    messageCount: session.messageCount + 1,
    riskSignals: mergeRiskSignals(session.riskSignals, decision),
    updatedAt: new Date().toISOString(),
  };

  if (!decision.needHuman || !decision.handoffTriggerType) {
    return;
  }

  const now = new Date().toISOString();
  const pendingRequest: PendingHumanRequestRecord = {
    id: `N-${pendingHumanRequests.length + 1}`.padEnd(6, "0"),
    triggerType: decision.handoffTriggerType,
    status: decision.notificationStatus ?? "pending",
    summary: decision.handoffSummary,
    customerMessage: message,
    conversationContext,
    riskContextSummary: decision.riskContextSummary ?? undefined,
    createdAt: now,
  };
  pendingHumanRequests = [pendingRequest, ...pendingHumanRequests].slice(0, 8);

  const ticket: HandoffTicketRecord = {
    id: `H-${handoffTickets.length + 1}`.padEnd(6, "0"),
    triggerType: decision.handoffTriggerType,
    status: "pending",
    summary: decision.handoffSummary,
    customerMessage: message,
    conversationContext,
    riskContextSummary: decision.riskContextSummary ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
  handoffTickets = [ticket, ...handoffTickets].slice(0, 8);

  if (decision.handoffTriggerType === "付款承接" || decision.handoffTriggerType === "承接超时") {
    upsertOrderIntake(decision.handoffTriggerType);
  }
}

export function getPresalesDashboardState(): PresalesDashboardState {
  const total = Math.max(totalMessages, 1);
  const handoffRate = Number(((handoffTickets.length / total) * 100).toFixed(1));
  const autoServeRate = Number(((autoServedMessages / total) * 100).toFixed(1));
  const verifiedCount = orderIntakes.filter((item) => item.status === "manual_verified").length;
  const conversionRate = Number(((verifiedCount / total) * 100).toFixed(1));

  return {
    session,
    handoffTickets,
    pendingHumanRequests,
    orderIntakes,
    quickQuestions,
    productCards: presalesKnowledgeBase.productVersions,
    activePromos: presalesKnowledgeBase.promoRules.filter((item) => item.validity === "active"),
    pilotMetrics: {
      autoServeRate,
      handoffRate,
      wrongPriceCount,
      conversionRate,
      totalMessages,
    },
  };
}

export function updateHandoffStatus(id: string, status: "taken_over" | "resolved"): HandoffTicketRecord | null {
  const target = handoffTickets.find((item) => item.id === id);
  if (!target) {
    return null;
  }

  target.status = status;
  target.updatedAt = new Date().toISOString();
  if (status === "resolved") {
    session = { ...session, status: "ai_serving", updatedAt: new Date().toISOString() };
  }

  if (orderIntakes.length > 0 && (target.triggerType === "付款承接" || target.triggerType === "承接超时")) {
    orderIntakes[0] = {
      ...orderIntakes[0],
      status: status === "resolved" ? "manual_verified" : "screenshot_received",
      addressConfirmed: status === "resolved",
      updatedAt: new Date().toISOString(),
    };
  }

  return target;
}

export function resetPresalesStore(): void {
  session = createInitialSession();
  handoffTickets = [];
  pendingHumanRequests = [];
  orderIntakes = [];
  totalMessages = 0;
  autoServedMessages = 0;
  wrongPriceCount = 0;
}

function createInitialSession(): PresalesSession {
  const now = new Date().toISOString();
  return {
    id: DEMO_SESSION_ID,
    status: "incoming",
    firstResponseAt: null,
    sourceChannel: "抖音投流加粉",
    riskSignals: [],
    lastIntent: null,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeRiskSignals(currentSignals: string[], decision: PresalesDecision): string[] {
  const nextSignals = [...currentSignals];
  if (decision.intent === "risk" && !nextSignals.includes("敏感功效词")) {
    nextSignals.push("敏感功效词");
  }
  if (decision.intent === "handoff" && !nextSignals.includes("点名人工")) {
    nextSignals.push("点名人工");
  }
  if (decision.needHuman && decision.handoffTriggerType === "付款承接" && !nextSignals.includes("付款承接")) {
    nextSignals.push("付款承接");
  }
  return nextSignals.slice(-5);
}

function upsertOrderIntake(triggerType: "付款承接" | "承接超时"): void {
  const now = new Date().toISOString();
  if (orderIntakes.length === 0) {
    const status = triggerType === "承接超时" ? "intake_stalled" : "screenshot_received";
    const record: OrderIntakeRecord = {
      id: "O-001",
      status,
      paymentScreenshot: true,
      addressConfirmed: false,
      createdAt: now,
      updatedAt: now,
    };
    orderIntakes = [record];
    return;
  }

  orderIntakes[0] = {
    ...orderIntakes[0],
    status: triggerType === "承接超时" ? "intake_stalled" : "screenshot_received",
    paymentScreenshot: true,
    updatedAt: now,
  };
}

function buildConversationContext(
  history: Array<{ role: string; content: string }>,
  latestMessage: string,
  reply: string,
  silentIntercept: boolean,
): string {
  const transcript = history
    .map((item) => `${item.role === "user" ? "客户" : item.role === "assistant" ? "客服" : "系统"}：${item.content}`)
    .concat(`客户：${latestMessage}`);

  if (!silentIntercept && reply.trim()) {
    transcript.push(`客服：${reply}`);
  }

  return transcript.join("\n");
}

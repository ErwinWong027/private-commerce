import { AgentIntentHints, AgentState, Ticket } from "../types";
import { evaluateRebookPolicy, evaluateRefundPolicy } from "./policyService";
import { calculateHoursUntilDeparture, createTicketTimeContext } from "./timeContext";

/**
 * State Machine Router (similar to LangGraph).
 * Processes message + context in a loop through states: CLASSIFY -> EXTRACT -> VALIDATE -> END.
 */
export async function runAgentGraph(
  message: string,
  historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
  entities: Ticket[] = [],
  intentHints: AgentIntentHints | null = null
): Promise<{
  reply: string;
  action: "REFUND" | "REBOOK" | "NONE";
  actionStatus: "PENDING" | "BLOCKED" | "READY";
  ticketId: string | null;
  params: AgentState["params"];
  matchingTickets?: Ticket[];
}> {
  // 1. Initialize State
  let state: AgentState = {
    message: message.trim(),
    history: historyMessages,
    tickets: entities,
    ticketId: null,
    params: {
      price: null,
      hours: null,
      ticketType: null,
      from: null,
      to: null,
      rebookCount: 0
    },
    action: "NONE",
    actionStatus: "PENDING",
    suggestedReply: "",
    nextNode: "CLASSIFY",
    hints: intentHints
  };

  // 2. Run State Machine Loop
  let loopCount = 0;
  while (state.nextNode !== "END" && loopCount < 10) {
    loopCount++;
    const node = state.nextNode;

    switch (node) {
      case "CLASSIFY":
        state = await classifierNode(state);
        break;
      case "EXTRACT":
        state = await extractorNode(state);
        break;
      case "VALIDATE":
        state = await validatorNode(state);
        break;
      case "ESCALATE":
        state = await escalateNode(state);
        break;
      case "SKILL":
        state = await skillNode(state);
        break;
      default:
        state.nextNode = "END";
    }
  }

  // 3. Return final computed state
  return {
    reply: state.suggestedReply,
    action: state.actionStatus === "READY" ? state.action : "NONE",
    actionStatus: state.actionStatus,
    ticketId: state.ticketId,
    params: state.params,
    matchingTickets: state.matchingTickets
  };
}

/**
 * 1. Classifier Node
 * Filters out prompt injections, detects out-of-scope requests, and routes to appropriate handling nodes.
 */
async function classifierNode(state: AgentState): Promise<AgentState> {
  const msg = state.message.toLowerCase();

  // A. Guardrail classification
  if (state.hints?.guardrailCategory !== "NONE" && state.hints?.guardrailReply) {
    state.suggestedReply = state.hints.guardrailReply;
    state.actionStatus = "BLOCKED";
    state.nextNode = "END";
    return state;
  }

  // B. Hard Security Redlines
  if (msg.includes("忽略") || msg.includes("扮演") || msg.includes("系统指令") || msg.includes("黑客")) {
    state.suggestedReply = "【安全拦截】我是官方客服代表。我无法忽略系统指令或协助进行非合规操作。";
    state.actionStatus = "BLOCKED";
    state.nextNode = "END";
    return state;
  }

  // C. Escalation trigger (e.g., force majeure or out of scope)
  if (msg.includes("停运") || msg.includes("地震") || msg.includes("台风") || msg.includes("索赔") || msg.includes("赔偿")) {
    state.nextNode = "ESCALATE";
    return state;
  }

  // D. Count or list assets query (routes to specific custom skill)
  if (isAssetListQuery(state.message)) {
    state.nextNode = "SKILL";
    return state;
  }

  state.nextNode = "EXTRACT";
  return state;
}

/**
 * 2. Extractor Node
 * Identifies the target record or entity being referenced.
 */
async function extractorNode(state: AgentState): Promise<AgentState> {
  const msg = state.message.toLowerCase();
  const matching = findMatchingEntities(state.tickets, state.message, state.hints);

  if (matching.length === 1) {
    const found = matching[0];
    state.ticketId = found.id;
    state.params.price = found.price;
    state.params.ticketType = found.ticketType;
    state.params.from = found.from;
    state.params.to = found.to;
    state.params.rebookCount = found.rebookCount;
    state.params.hours = calculateHoursUntilDeparture(found.departureTime, createTicketTimeContext());
  } else if (matching.length > 1) {
    state.matchingTickets = matching;
  } else {
    // Fallback: match by ID/name mentioned in raw text
    const foundFallback = state.tickets.find(t => msg.includes(t.trainNo.toLowerCase()) || msg.includes(t.id.toLowerCase()));
    if (foundFallback) {
      state.ticketId = foundFallback.id;
      state.params.price = foundFallback.price;
      state.params.ticketType = foundFallback.ticketType;
      state.params.from = foundFallback.from;
      state.params.to = foundFallback.to;
      state.params.rebookCount = foundFallback.rebookCount;
      state.params.hours = calculateHoursUntilDeparture(foundFallback.departureTime, createTicketTimeContext());
    }
  }

  state.nextNode = "VALIDATE";
  return state;
}

/**
 * 3. Validator Node
 * Runs rule evaluations and policy checks.
 */
async function validatorNode(state: AgentState): Promise<AgentState> {
  const msg = state.message;

  if (state.matchingTickets && state.matchingTickets.length > 1) {
    state.actionStatus = "PENDING";
    state.suggestedReply = "为您找到了多条记录，请在下方选择具体的一项以继续办理：";
    state.nextNode = "END";
    return state;
  }

  const hintedAction = state.hints?.action || "NONE";
  const isRefund = hintedAction === "REFUND" || msg.includes("退票") || msg.includes("退款");
  const isRebook = hintedAction === "REBOOK" || msg.includes("改签") || msg.includes("换车");

  if (!state.ticketId) {
    // User hasn't locked onto a specific ticket. Provide general policy answers.
    if (state.hints?.assistantReply) {
      state.suggestedReply = state.hints.assistantReply;
      state.nextNode = "END";
      return state;
    }

    if (isRefund || isRebook) {
      if (state.hints?.needsClarification && state.hints.clarificationQuestion) {
        state.suggestedReply = state.hints.clarificationQuestion;
      } else {
        state.suggestedReply = "您好！我能为您办理业务，请问您想处理下面哪张车票？(如：输入 “退票 G101”)";
      }
    } else {
      state.suggestedReply = "您好！我是智能助理。我可以帮您核对规则并执行交易。请告诉我您的需求。";
    }
    state.nextNode = "END";
    return state;
  }

  const entity = state.tickets.find((tk) => tk.id === state.ticketId);
  if (!entity) {
    state.nextNode = "END";
    return state;
  }

  // Evaluate business policies using policyService.ts
  if (isRefund) {
    state.action = "REFUND";
    const refundPolicy = evaluateRefundPolicy(entity, createTicketTimeContext(), {
      exceptionReason: msg.includes("停运") ? "RAILWAY_RESPONSIBILITY" : "NONE",
    });
    state.actionStatus = refundPolicy.status;
    state.suggestedReply = refundPolicy.message;
  } else if (isRebook) {
    state.action = "REBOOK";
    const rebookPolicy = evaluateRebookPolicy(entity, createTicketTimeContext(), {
      targetTo: msg.includes("变更到站") ? `${entity.to}外站点` : undefined,
    });
    state.actionStatus = rebookPolicy.status;
    state.suggestedReply = rebookPolicy.message;
  } else {
    state.suggestedReply = `已为您识别记录 ${entity.trainNo}，状态为【${entity.status}】。请问您需要退票还是改签？`;
  }

  state.nextNode = "END";
  return state;
}

/**
 * 4. Escalate Node
 * Handles edge cases,晚点/灾害 exceptions, human fallbacks.
 */
async function escalateNode(state: AgentState): Promise<AgentState> {
  const msg = state.message.toLowerCase();

  if (msg.includes("地震") || msg.includes("暴雪") || msg.includes("台风") || msg.includes("灾害")) {
    state.suggestedReply = "【停运/灾害特批通道】受特殊天气或灾害影响，可能会启动临时免收手续费预案。请关注官方停运公告或直接前往人工服务台办理。";
  } else if (msg.includes("赔偿") || msg.includes("索赔")) {
    state.suggestedReply = "【线下窗口引导】列车晚点赔偿或特殊特批申请，请携带购票证明前往售票大厅值班长窗口，由车站管理人员人工处理。";
  } else {
    state.suggestedReply = "【转人工服务】抱歉，该请求超出了自助服务边界，正在为您呼叫人工客服，请稍等...";
  }

  state.actionStatus = "BLOCKED";
  state.nextNode = "END";
  return state;
}

/**
 * 5. Custom Skill Node
 * Computes list counts or runs custom verification skills.
 */
async function skillNode(state: AgentState): Promise<AgentState> {
  const activeEntities = state.tickets.filter(t => t.status !== "已退票" && t.status !== "过期");
  state.suggestedReply = `根据您的账户资产，您当前共有 ${activeEntities.length}张有效票。以下是明细：\n` +
    state.tickets.map((t, i) => `${i + 1}. 车票 ${t.id} (${t.trainNo}), 状态: ${t.status}`).join("\n");

  state.actionStatus = "PENDING";
  state.nextNode = "END";
  return state;
}

// Helpers for semantic matching & list filters
function isAssetListQuery(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("几张") || msg.includes("几个") || msg.includes("列表") || msg.includes("有哪些车票");
}

function findMatchingEntities(tickets: Ticket[], message: string, hints: AgentIntentHints | null): Ticket[] {
  if (hints?.matchingTicketIds && hints.matchingTicketIds.length > 0) {
    return hints.matchingTicketIds
      .map(id => tickets.find(t => t.id === id))
      .filter((t): t is Ticket => t !== undefined);
  }
  
  if (hints?.ticketId) {
    const t = tickets.find(tk => tk.id.toLowerCase() === hints.ticketId!.toLowerCase());
    if (t) return [t];
  }

  return [];
}

export type PortalRole = "customer" | "agent";
export type ChatActor = "customer" | "ai" | "agent" | "system";
export type MessageContentType = "text" | "image" | "voice";
export type SessionStatus = "ai_serving" | "human_serving" | "closed";
export type TicketStatus = "pending" | "in_progress" | "resolved";
export type HumanNotificationStatus = "pending" | "suppressed" | "not_applicable";
export type MediaAssetKind = "voice" | "image";
export type HandoffTriggerType =
  | "敏感功效"
  | "低置信度"
  | "客户点名人工"
  | "付款承接"
  | "口径冲突"
  | "承接超时"
  | "监管凭据诱导"
  | "知识盲区";

export interface UserRecord { id: string; role: PortalRole; name: string; avatar: string; organization: string | null }
export interface MessageRecord { id: string; sessionId: string; sequence: number; actor: ChatActor; senderId: string | null; content: string; contentType: MessageContentType; mediaPath: string | null; imageDescription: string | null; mediaAssetId?: string | null; createdAt: string }
export interface MediaAsset {
  id: string;
  messageId: string | null;
  kind: MediaAssetKind;
  localPath: string;
  transcript: string | null;
  extracted: string | null;
  confidence: number | null;
  needsManualConfirm: boolean;
  createdAt: string;
}
export interface DecisionRecord {
  id: string; sessionId: string; messageId: string; intent: string; confidence: number; needHuman: boolean;
  silentIntercept: boolean; boundaryDecision: string; matchedEvidence: string[]; toolName: string | null;
  toolArgs: string[]; toolResult: Record<string, unknown> | null; handoffSummary: string; createdAt: string;
}
export interface HandoffTicketRecord { id: string; sessionId: string; status: TicketStatus; triggerType: string; summary: string; assignedAgentId: string | null; createdAt: string; updatedAt: string }
export interface ConversationSummary {
  id: string; customerId: string; customerName: string; status: SessionStatus; assignedAgentId: string | null;
  lastMessage: string; lastMessageAt: string; unreadCount: number; messageCount: number;
}
export interface ConversationDetail extends ConversationSummary {
  customer: UserRecord; messages: MessageRecord[]; decisions: DecisionRecord[]; tickets: HandoffTicketRecord[]; dealState: DealState;
}

// 轻量成交进度（仅供 Demo 演示，非真实订单/物流系统）
export type DealStage =
  | "consulting"        // 咨询中
  | "awaiting_payment"  // 待付款
  | "awaiting_review"   // 待核对
  | "awaiting_shipment" // 待出单
  | "awaiting_pickup"   // 待揽收
  | "picked_up"         // 已揽收
  | "in_transit";       // 运输中
export type DealAdvanceAction = "confirm_review" | "generate_tracking" | "simulate_pickup" | "simulate_transit";
export interface DealState { stage: DealStage; trackingNo: string | null }
export const DEAL_STAGE_ORDER: DealStage[] = [
  "consulting", "awaiting_payment", "awaiting_review", "awaiting_shipment", "awaiting_pickup", "picked_up", "in_transit",
];
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  consulting: "咨询中", awaiting_payment: "待付款", awaiting_review: "待核对", awaiting_shipment: "待出单",
  awaiting_pickup: "待揽收", picked_up: "已揽收", in_transit: "运输中",
};
export const DEAL_ACTIONS: Array<{ action: DealAdvanceAction; label: string; from: DealStage; to: DealStage }> = [
  { action: "confirm_review", label: "确认核对", from: "awaiting_review", to: "awaiting_shipment" },
  { action: "generate_tracking", label: "生成模拟单号", from: "awaiting_shipment", to: "awaiting_pickup" },
  { action: "simulate_pickup", label: "模拟揽收", from: "awaiting_pickup", to: "picked_up" },
  { action: "simulate_transit", label: "模拟运输", from: "picked_up", to: "in_transit" },
];
export interface DashboardState { conversations: ConversationSummary[]; activeConversation: ConversationDetail | null; metrics: Record<string, number> }

export type PresalesIntent = "greeting" | "identity" | "handoff" | "risk" | "fulfillment_payment" | "pricing" | "authenticity" | "version" | "unknown";
export interface PresalesTraceStep {
  id: string;
  title: string;
  stage: "llm" | "tool" | "output";
  content: string;
}
export interface PresalesDecision {
  intent: PresalesIntent; confidence: number; reply: string[]; needHuman: boolean; silentIntercept: boolean;
  interceptReason?: string; notificationStatus?: HumanNotificationStatus;
  handoffTriggerType: HandoffTriggerType | null; boundaryDecision: string; matchedEvidence: string[]; handoffSummary: string;
  toolName: string | null; toolArgs?: string[]; toolResult?: Record<string, unknown> | null;
  subIntent?: string; styleVariant?: string | null; riskContextSummary?: string | null;
  trace: PresalesTraceStep[];
}

// 41 条自动化回归用例的结构（供售前客服文档中心的验收矩阵使用）
export interface PresalesAutomationCase {
  id: string;
  scenario: string;
  type: "Golden Path" | "Hard Case" | "Edge Case";
  input: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  expectedReplyIncludes: string[];
  expectedReplyExcludes?: string[];
  expectedIntent: PresalesIntent;
  expectedNeedHuman?: boolean;
  expectedSilentIntercept?: boolean;
  expectedBoundaryIncludes?: string[];
}
export interface PresalesTestCaseResult {
  id: string; scenario: string; type: string; passed: boolean;
  intent: PresalesIntent; expectedIntent: PresalesIntent; needHuman: boolean; reply: string[]; failures: string[];
}
export interface PresalesTestSummary { total: number; passed: number; failed: number; passRate: number }

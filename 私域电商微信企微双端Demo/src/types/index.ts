export type PortalRole = "customer" | "agent";
export type ChatActor = "customer" | "ai" | "agent" | "system";
export type SessionStatus = "ai_serving" | "human_serving" | "closed";
export type TicketStatus = "pending" | "in_progress" | "resolved";
export type HumanNotificationStatus = "pending" | "suppressed" | "not_applicable";
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
export interface MessageRecord { id: string; sessionId: string; sequence: number; actor: ChatActor; senderId: string | null; content: string; createdAt: string }
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
  customer: UserRecord; messages: MessageRecord[]; decisions: DecisionRecord[]; tickets: HandoffTicketRecord[];
}
export interface DashboardState { conversations: ConversationSummary[]; activeConversation: ConversationDetail | null; metrics: Record<string, number> }

export type PresalesIntent = "greeting" | "identity" | "handoff" | "risk" | "fulfillment_payment" | "pricing" | "authenticity" | "version" | "unknown";
export interface PresalesTraceStep {
  id: string;
  title: string;
  stage: "llm" | "tool" | "output";
  content: string;
}
export interface PresalesDecision {
  intent: PresalesIntent; confidence: number; reply: string; needHuman: boolean; silentIntercept: boolean;
  interceptReason?: string; notificationStatus?: HumanNotificationStatus;
  handoffTriggerType: HandoffTriggerType | null; boundaryDecision: string; matchedEvidence: string[]; handoffSummary: string;
  toolName: string | null; toolArgs?: string[]; toolResult?: Record<string, unknown> | null;
  subIntent?: string; styleVariant?: string | null; riskContextSummary?: string | null;
  trace: PresalesTraceStep[];
}

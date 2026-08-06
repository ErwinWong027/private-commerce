// Global Type Definitions for the Agentic AI Application
// (Modify these types to match your business domain entities)

export type TicketType = "普通票" | "积分兑换票" | "广深港跨境票" | "中老铁路跨境票" | "计次定期票" | "团体票";
export type TicketStatus = "未使用" | "已改签" | "已退票" | "已乘车" | "过期";
export type PaymentMethod = "电子支付" | "积分支付" | "现金" | "混合支付";
export type InvoiceStatus = "未领取" | "已领取" | "已交回";

// Allowed actions detected by the agent state machine
export type AgentAction = "REFUND" | "REBOOK" | "NONE";

export type RebookingTargetDateDelta = "earlier_or_same" | "same_day" | "later";
export type RebookScenario = "same_or_earlier" | "later" | "within_8_days_to_20_days_later";
export type SpecialRebookScenario = "NONE" | "WITHIN_8_DAYS_TO_20_DAYS_LATER";
export type RefundExceptionReason = "NONE" | "RAILWAY_RESPONSIBILITY" | "FORCE_MAJEURE" | "MISTAKEN_PURCHASE";

export type GuardrailCategory =
  | "NONE"
  | "PROMPT_INJECTION"
  | "PII"
  | "FRAUD"
  | "THREAT"
  | "FORCE_MAJEURE"
  | "OUT_OF_SCOPE";

/**
 * Placeholder Entity - Ticket
 * Rename/change this interface to represent your domain model (e.g. Order, Asset, Task, Reservation)
 */
export interface Ticket {
  id: string;
  trainNo: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime?: string;
  price: number;
  pointsPrice?: number;
  ticketType: TicketType;
  status: TicketStatus;
  paymentMethod: PaymentMethod;
  invoiceStatus: InvoiceStatus;
  rebookCount: number;
  passengerName?: string;
  passengerIdMasked?: string;
  exchangeAccountId?: string;
  carriageNo?: string;
  seatLabel?: string;
  orderChannel?: string;
  ticketSerial?: string;
  specialRebookScenario?: SpecialRebookScenario;
  purchaseTime?: string;
}

export interface RebookingParams {
  price: number | null;
  hours: number | null;
  ticketType: TicketType | null;
  from: string | null;
  to: string | null;
  rebookCount: number;
}

// Intent extracted by foundation model
export interface AgentIntentHints {
  action: AgentAction;
  matchingTicketIds: string[] | null;
  ticketId: string | null;
  trainNo: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  rebookTargetDate: string | null;
  rebookTargetTrainNo: string | null;
  rebookTargetSeatType: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  assistantReply: string | null;
  guardrailCategory: GuardrailCategory;
  guardrailReply: string | null;
}

// State machine context state
export interface AgentState {
  message: string;
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  tickets: Ticket[];
  ticketId: string | null;
  params: RebookingParams;
  action: AgentAction;
  actionStatus: "PENDING" | "BLOCKED" | "READY";
  suggestedReply: string;
  nextNode: "CLASSIFY" | "EXTRACT" | "VALIDATE" | "ESCALATE" | "SKILL" | "END";
  hints: AgentIntentHints | null;
  matchingTickets?: Ticket[];
}

// Result models for validations and previews
export interface RefundDetail {
  originalPrice: number;
  feeRate: number;
  refundFee: number;
  refundAmount: number;
  refundPointsAmount?: number;
  invoiceStatus: InvoiceStatus;
  message: string;
}

export interface RefundPreview {
  originalPrice: number;
  feeRate: number;
  refundFee: number;
  refundAmount: number;
  refundPointsAmount?: number;
  invoiceStatus: InvoiceStatus;
  hoursUntilDeparture: number;
  ruleTitle: string;
  feeRule: string;
  rateExplanation: string;
  deadlineRule: string;
  settlementRule: string;
  invoiceNotice?: string;
}

export interface RebookDetail {
  rebookFee: number;
  priceDifference: number;
  diffRefundFee: number;
  refundDiffAmount: number;
  totalToPay: number;
  message: string;
}

export interface RebookPreview {
  targetPrice: number;
  targetDateDelta: RebookingTargetDateDelta;
  targetDepartureTime?: string;
  hoursUntilDeparture: number;
  rebookFee: number;
  feeRate: number;
  priceDifference: number;
  diffRefundFee: number;
  refundDiffAmount: number;
  totalToPay: number;
  ruleTitle: string;
  rateExplanation: string;
  priceDiffRule: string;
  targetSummary: string;
  settlementRule: string;
}

export type PresalesIntent =
  | "greeting"
  | "identity"
  | "handoff"
  | "risk"
  | "fulfillment_payment"
  | "pricing"
  | "authenticity"
  | "version"
  | "unknown";

export type PresalesSessionStatus = "incoming" | "ai_serving" | "handoff" | "closed";
export type HandoffStatus = "pending" | "taken_over" | "resolved";
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
export type OrderIntakeStatus =
  | "price_confirmed"
  | "awaiting_payment"
  | "screenshot_received"
  | "manual_verified"
  | "intake_stalled";

export interface ProductVersion {
  id: string;
  name: string;
  aliases: string[];
  packageDesc: string;
  productForm: string;
  usageDesc: string;
  storageDesc: string;
  compareNote: string;
  integralOnly: boolean;
  doses: string[];
}

export interface SkuPrice {
  version: string;
  dose: string;
  listPrice: number | null;
  sessionPrice: number | null;
  conflict: boolean;
  stock: "in_stock" | "out_of_stock";
  unit: string;
}

export interface PromoRule {
  id: string;
  name: string;
  version: string;
  scope: "per_unit" | "per_order";
  discount: number;
  validity: "active" | "expired" | "manual_only";
}

export interface ComplianceRule {
  intent: string;
  triggerWords: string[];
  responseMode: "safe_reply" | "transfer";
  reply: string;
}

export interface AuthenticityProofs {
  verifySteps: string[];
  packaging: string[];
  refundPromise: string;
  forbidden: string[];
}

export interface FulfillmentPaymentInfo {
  paymentMethods: string[];
  paymentUnavailable: string;
  shippingOrigin: string;
  shipTime: string;
  deliveryTime: string;
  freight: string;
  screenshotHandoff: string;
}

export interface UsageStorageInfo {
  usage: string;
  storageUnopened: string;
  storageOpened: string;
  sideEffects: string;
}

export interface NotInScopeItem {
  item: string;
  aliases: string[];
  reply: string;
}

export interface KnowledgeBaseMeta {
  title: string;
  productName: string;
  generatedBy: string;
}

export interface PresalesKnowledgeBase {
  meta: KnowledgeBaseMeta;
  welcomeTemplate: string;
  identityReply: string;
  synonymsNote: string;
  routing: {
    confidenceThreshold: number;
    intentKeywords: Record<string, string[]>;
  };
  productVersions: ProductVersion[];
  skuPrices: SkuPrice[];
  promoRules: PromoRule[];
  manualOnlyPromos: string[];
  authenticityProofs: AuthenticityProofs;
  complianceWhitelist: ComplianceRule[];
  contraindications: {
    groups: string[];
    reply: string;
  };
  fulfillmentPayment: FulfillmentPaymentInfo;
  usageStorage: UsageStorageInfo;
  notInScope: NotInScopeItem[];
}

export interface PresalesSession {
  id: string;
  status: PresalesSessionStatus;
  firstResponseAt: string | null;
  sourceChannel: string;
  riskSignals: string[];
  lastIntent: PresalesIntent | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HandoffTicketRecord {
  id: string;
  triggerType: HandoffTriggerType;
  status: HandoffStatus;
  summary: string;
  customerMessage: string;
  conversationContext?: string;
  riskContextSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderIntakeRecord {
  id: string;
  status: OrderIntakeStatus;
  paymentScreenshot: boolean;
  addressConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PendingHumanRequestRecord {
  id: string;
  triggerType: HandoffTriggerType;
  status: HumanNotificationStatus;
  summary: string;
  customerMessage: string;
  conversationContext?: string;
  riskContextSummary?: string;
  createdAt: string;
}

export interface PresalesTraceStep {
  id: string;
  title: string;
  stage: "llm" | "tool" | "output";
  content: string;
}

export interface PresalesDecision {
  intent: PresalesIntent;
  confidence: number;
  reply: string;
  needHuman: boolean;
  silentIntercept: boolean;
  interceptReason?: string;
  notificationStatus?: HumanNotificationStatus;
  handoffTriggerType: HandoffTriggerType | null;
  boundaryDecision: string;
  matchedEvidence: string[];
  handoffSummary: string;
  toolName: string | null;
  toolArgs?: string[];
  toolResult?: Record<string, unknown> | null;
  subIntent?: string;
  styleVariant?: string | null;
  riskContextSummary?: string | null;
  trace: PresalesTraceStep[];
}

export interface PresalesDashboardState {
  session: PresalesSession;
  handoffTickets: HandoffTicketRecord[];
  pendingHumanRequests: PendingHumanRequestRecord[];
  orderIntakes: OrderIntakeRecord[];
  quickQuestions: Array<{ label: string; text: string }>;
  productCards: ProductVersion[];
  activePromos: PromoRule[];
  pilotMetrics: {
    autoServeRate: number;
    handoffRate: number;
    wrongPriceCount: number;
    conversionRate: number;
    totalMessages: number;
  };
}

export interface PresalesAutomationCase {
  id: string;
  scenario: string;
  type: "Golden Path" | "Hard Case" | "Edge Case";
  input: string;
  expectedReplyIncludes: string[];
  expectedReplyExcludes?: string[];
  expectedIntent: PresalesIntent;
  expectedNeedHuman?: boolean;
  expectedSilentIntercept?: boolean;
  expectedBoundaryIncludes?: string[];
}

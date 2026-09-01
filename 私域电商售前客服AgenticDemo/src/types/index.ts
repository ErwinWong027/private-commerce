// 私域电商售前客服 Demo 的全局类型定义。

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
  expectedBoundaryIncludes: string[];
}

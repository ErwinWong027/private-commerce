import { DealStage, DEAL_STAGE_LABELS } from "@/types";

// ===================== 事实层：封闭、可枚举；LLM 只能引用，不能发明 =====================
// 订单事实（本单是否已发生某事）——闭集。
// 刻意不建 STOCK / ORDER_VOLUME 等事实 → 从结构上杜绝「编造库存/订单量原因」。
export const ORDER_FACTS = {
  PAYMENT_SUBMITTED: "客户已提交付款信息",
  PAYMENT_CONFIRMED: "付款已核对/到账",
  ORDER_CREATED: "订单已创建/已出单",
  TRACKING_ISSUED: "运单号已生成",
  PICKED_UP: "快递已揽收",
  IN_TRANSIT: "包裹运输中",
  DELIVERED: "已签收",
} as const;
export type OrderFactId = keyof typeof ORDER_FACTS;

// 业务口径（Policy）：客服拿来回答客户的「业务规则/SLA」。是业务知识，不是话术。
// 从 buildStageAwareShippingReply 的硬编码里提出，进 State Context 供 planner 引用。
export interface PolicyFact {
  id: string;
  kind: "SLA" | "RULE"; // SLA=量化窗口；RULE=一般业务规则
  statement: string;
  window?: string;
  note?: string;
}
export const POLICY_FACTS: Record<string, PolicyFact> = {
  SHIP_AFTER_PAYMENT: { id: "SHIP_AFTER_PAYMENT", kind: "SLA", statement: "付款后 48 小时内安排发出", window: "48小时", note: "具体是否当天发出取决于付款后的订单排号" },
  NOT_IMMEDIATE_AFTER_PAY: { id: "NOT_IMMEDIATE_AFTER_PAY", kind: "RULE", statement: "付款后不会立即发货，需先核对付款、安排出单" },
  ETA_AFTER_PICKUP: { id: "ETA_AFTER_PICKUP", kind: "SLA", statement: "快递揽收后一般 1-3 天送达", window: "1-3天" },
  SHIP_FLOW: { id: "SHIP_FLOW", kind: "RULE", statement: "正常流程：核对付款 → 安排出单 → 快递揽收 → 送达" },
};
export type PolicyFactId = keyof typeof POLICY_FACTS;

// 阶段 → 已确认订单事实（累积；与 REDLINES.allowedFrom 对齐）。
const CONFIRMED_BY_STAGE: Record<DealStage, OrderFactId[]> = {
  consulting: [],
  awaiting_payment: [],
  awaiting_review: ["PAYMENT_SUBMITTED"],
  awaiting_shipment: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED"],
  awaiting_pickup: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "ORDER_CREATED", "TRACKING_ISSUED"],
  picked_up: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "ORDER_CREATED", "TRACKING_ISSUED", "PICKED_UP"],
  in_transit: ["PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "ORDER_CREATED", "TRACKING_ISSUED", "PICKED_UP", "IN_TRANSIT"],
};

// 最大合理精度：能答多具体，由「证据」决定，不由 LLM 自报。
export type AnswerPrecision = "EXACT" | "BOUNDED" | "CONDITIONAL" | "NON_COMMITTAL";
export type AskedDimension = "ship_time" | "arrival_time" | "shipped_status" | "flow";

export interface StateContext {
  stage: DealStage;
  stageLabel: string;
  trackingNo: string | null;
  confirmed: OrderFactId[];
  unknown: OrderFactId[];
  policy: PolicyFactId[];
  factsMeaning: Record<string, string>;
}

const ALL_ORDER_FACTS = Object.keys(ORDER_FACTS) as OrderFactId[];
const SLA_POLICY_IDS = (Object.keys(POLICY_FACTS) as PolicyFactId[]).filter((id) => POLICY_FACTS[id].kind === "SLA");
const RULE_POLICY_IDS = (Object.keys(POLICY_FACTS) as PolicyFactId[]).filter((id) => POLICY_FACTS[id].kind === "RULE");

export function buildStateContext(stage: DealStage, trackingNo: string | null): StateContext {
  const confirmed = CONFIRMED_BY_STAGE[stage] ?? [];
  const unknown = ALL_ORDER_FACTS.filter((id) => !confirmed.includes(id));
  const factsMeaning: Record<string, string> = {};
  for (const [id, meaning] of Object.entries(ORDER_FACTS)) factsMeaning[id] = `ORDER: ${meaning}`;
  for (const [id, policy] of Object.entries(POLICY_FACTS)) factsMeaning[id] = `POLICY(${policy.kind}${policy.window ? "," + policy.window : ""}): ${policy.statement}${policy.note ? "；" + policy.note : ""}`;
  return { stage, stageLabel: DEAL_STAGE_LABELS[stage], trackingNo, confirmed, unknown, policy: Object.keys(POLICY_FACTS) as PolicyFactId[], factsMeaning };
}

// ===================== Response Plan：客户问的维度 + 选用的证据 =====================
export interface OrderReplyPlan {
  asked_dimension: AskedDimension;
  basis: string[]; // 引用的事实 id（闭集成员）
  answer_mode: AnswerPrecision; // LLM 提议；derivePrecision 会重算并往下钳
  commitments: string[]; // 只能 [] 或 ["will_update"]
  action: string;
  // 客户断言、但系统没有事实可佐证的归因（stock/order_volume/other）；无则 null。
  // 用 LLM 的语义判断结构化捕获，而不是靠 render 阶段的短语黑名单。
  disputed_premise: string | null;
}

// 各维度下「能直接定论本单」的确认事实（这些成立时，不再拿一般规则回答）。
// - shipped_status / ship_time：已揽收及之后 → 直接陈述现状，而非未来时间。
// - arrival_time：已揽收/运输中/签收 → 用 ETA 给范围。
// 注意：付款类事实（PAYMENT_*）对「何时发」不构成 EXACT——付款不是发货的充分条件。
const DECISIVE_BY_DIMENSION: Record<AskedDimension, OrderFactId[]> = {
  shipped_status: ["TRACKING_ISSUED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"],
  ship_time: ["PICKED_UP", "IN_TRANSIT", "DELIVERED"],
  arrival_time: ["PICKED_UP", "IN_TRANSIT", "DELIVERED"],
  flow: [],
};

// 按证据推导「最多能答到什么精度」。LLM 自报更高会被 clampPrecision 钳回。
export function derivePrecision(basis: string[], ctx: StateContext, askedDimension: AskedDimension): AnswerPrecision {
  const confirmedId = (id: string) => ctx.confirmed.includes(id as OrderFactId);
  const decisive = DECISIVE_BY_DIMENSION[askedDimension].filter((id) => basis.includes(id) && confirmedId(id));
  if (decisive.length > 0) {
    // 到达时间：只有「已签收」能给出确定结论；已揽收/运输中只能用 ETA 窗口给范围（给不出确定送达日期）。
    if (askedDimension === "arrival_time") return decisive.includes("DELIVERED") ? "EXACT" : "BOUNDED";
    return "EXACT";
  }
  if (basis.some((id) => (SLA_POLICY_IDS as string[]).includes(id))) return "BOUNDED";
  if (basis.some((id) => (RULE_POLICY_IDS as string[]).includes(id))) return "CONDITIONAL";
  return "NON_COMMITTAL";
}

const PRECISION_RANK: Record<AnswerPrecision, number> = { NON_COMMITTAL: 0, CONDITIONAL: 1, BOUNDED: 2, EXACT: 3 };
export function clampPrecision(requested: AnswerPrecision, justified: AnswerPrecision): AnswerPrecision {
  return PRECISION_RANK[requested] > PRECISION_RANK[justified] ? justified : requested;
}

// ===================== 确定性校验（引用-only 闭集 + 精度钳制） =====================
export interface PlanValidation {
  ok: boolean;
  basis: string[]; // 校验后可引用的事实 id
  answer_mode: AnswerPrecision;
  violations: string[];
  disputed_premise: string | null;
}

//  - basis 必须是已知 id（业务口径 或 订单事实），否则丢弃（引用-only 闭集）；
//  - 订单事实若 ∉ confirmed（未确认）→ 记录违规并丢弃，不断言未发生的事实；
//  - answer_mode 重算：LLM 自报超过证据支持 → 钳回并记录。
export function validateOrderPlan(plan: OrderReplyPlan, ctx: StateContext): PlanValidation {
  const violations: string[] = [];
  const kept: string[] = [];
  for (const id of plan.basis ?? []) {
    if ((ctx.policy as string[]).includes(id)) { kept.push(id); continue; } // 业务口径：恒可用
    if (!(ALL_ORDER_FACTS as string[]).includes(id)) { violations.push(`unknown_fact:${id}`); continue; }
    if (ctx.confirmed.includes(id as OrderFactId)) { kept.push(id); continue; } // 已确认订单事实
    violations.push(`unconfirmed_order_fact:${id}`); // 未确认 → 丢弃
  }
  const justified = derivePrecision(kept, ctx, plan.asked_dimension);
  const answer_mode = clampPrecision(plan.answer_mode, justified);
  if (PRECISION_RANK[plan.answer_mode] > PRECISION_RANK[justified]) violations.push(`precision_clamped:${plan.answer_mode}->${justified}`);
  return { ok: violations.length === 0, basis: kept, answer_mode, violations, disputed_premise: plan.disputed_premise ?? null };
}

import {
  DEAL_ACTIONS,
  DEAL_STAGE_LABELS,
  DEAL_STAGE_ORDER,
  DealAdvanceAction,
  DealStage,
  DealState,
} from "@/types";

// 纯逻辑：轻量成交进度状态机 + 话术红线 + T02 防跳步校验。
// 大模型只负责理解与表达，成交阶段、付款/出单/揽收事实一律由这里的固定规则控制。

export const INITIAL_DEAL_STATE: DealState = { stage: "consulting", trackingNo: null };

function stageIndex(stage: DealStage): number {
  return DEAL_STAGE_ORDER.indexOf(stage);
}

// 决策中与阶段推进相关的最小字段。
export interface StageDecisionInput {
  toolName: string | null;
  subIntent?: string;
  needHuman: boolean;
  reply: string;
}

// 客户消息驱动的确定性自动推进：只允许前进，且最多推进到「待核对」，其余靠企微按钮手动推进。
export function nextStageFromCustomer(stage: DealStage, decision: StageDecisionInput): DealStage {
  if (decision.toolName !== "fulfillment") {
    return stage;
  }
  let target = stage;
  if (decision.subIntent === "payment_methods" && stageIndex(stage) < stageIndex("awaiting_payment")) {
    target = "awaiting_payment";
  }
  if (decision.subIntent === "payment_completed" && stageIndex(stage) < stageIndex("awaiting_review")) {
    target = "awaiting_review";
  }
  return stageIndex(target) > stageIndex(stage) ? target : stage;
}

export interface ManualAdvanceResult {
  ok: boolean;
  state: DealState;
  error?: string;
  note?: string;
}

// 企微侧按钮推进：必须严格按当前阶段顺序，跨阶段一律拒绝。
export function applyManualAdvance(state: DealState, action: DealAdvanceAction): ManualAdvanceResult {
  const rule = DEAL_ACTIONS.find((item) => item.action === action);
  if (!rule) {
    return { ok: false, state, error: "未知的推进操作" };
  }
  if (state.stage !== rule.from) {
    return {
      ok: false,
      state,
      error: `当前进度为「${DEAL_STAGE_LABELS[state.stage]}」，需先完成前序步骤才能「${rule.label}」`,
    };
  }
  const trackingNo = action === "generate_tracking" ? buildTrackingNo() : state.trackingNo;
  return {
    ok: true,
    state: { stage: rule.to, trackingNo },
    note: `已推进至「${DEAL_STAGE_LABELS[rule.to]}」`,
  };
}

function buildTrackingNo(): string {
  const suffix = String(Math.floor(Math.random() * 1_0000_0000)).padStart(8, "0");
  return `SF${Date.now().toString().slice(-6)}${suffix}`;
}

// 话术红线：阶段未到时禁止出现的既成事实类措辞。
const REDLINES: Array<{ code: string; phrases: string[]; allowedFrom: DealStage }> = [
  { code: "payment_confirmed", phrases: ["收款成功", "已收款", "付款成功", "款已到账", "已到账"], allowedFrom: "awaiting_shipment" },
  { code: "shipment_declared", phrases: ["单号已出", "已出单", "已发货", "已经发货", "运单已生成", "单号已生成"], allowedFrom: "awaiting_pickup" },
  { code: "pickup_declared", phrases: ["已揽收", "已经揽收", "已取件", "快递已取", "已经取件"], allowedFrom: "picked_up" },
];

export function detectRedlineViolation(reply: string, stage: DealStage): string | null {
  for (const line of REDLINES) {
    if (line.phrases.some((phrase) => reply.includes(phrase)) && stageIndex(stage) < stageIndex(line.allowedFrom)) {
      return line.code;
    }
  }
  return null;
}

export function isShippingQuestion(decision: StageDecisionInput): boolean {
  // 仅「发货时效/物流状态」需要按成交阶段做 plan→render 校验；
  // 发货地（shipping_origin）是阶段无关的确定性事实，走普通红线校验即可，不纳入阶段话术层。
  return decision.toolName === "fulfillment" && decision.subIntent === "delivery_time";
}

// 发货/时效问题按当前真实阶段作答，杜绝跳步到「已揽收/已发货」（T02 核心校验）。
export function buildStageAwareShippingReply(state: DealState): string {
  const trackingHint = state.trackingNo ? `，运单号 ${state.trackingNo}` : "";
  switch (state.stage) {
    case "consulting":
    case "awaiting_payment":
      return "还没到发货环节哦～正常是核对付款、安排出单后才会揽收，快递揽收后一般 1-3 天送达。等这边进度到了我第一时间同步您～";
    case "awaiting_review":
      return "您的订单目前在【待核对】，我们正在核对付款信息，还没安排出单和揽收哦。出单、快递揽收后一般 1-3 天到，进度我会实时同步您～";
    case "awaiting_shipment":
      return "付款已核对，订单目前在【待出单】，还没生成运单和揽收哦。出单后 48 小时内发出，快递揽收后一般 1-3 天到～";
    case "awaiting_pickup":
      return `运单已生成${trackingHint}，目前在【待揽收】，正在等快递上门取件；揽收后一般 1-3 天送达～`;
    case "picked_up":
      return `快递已揽收${trackingHint}，正在中转，通常揽收后 1-3 天送达，可凭单号查询物流～`;
    case "in_transit":
      return `包裹运输中${trackingHint}，通常揽收后 1-3 天送达，可凭单号跟踪最新物流～`;
    default:
      return "发货进度我这边帮您确认下，稍等哦～";
  }
}

// 阶段兜底承接：命中红线但不是发货问题时使用，只承接不宣布任何未发生的事实。
function buildStageSafeFallback(state: DealState): string {
  return `这块我先帮您确认一下～您的订单目前在【${DEAL_STAGE_LABELS[state.stage]}】阶段，等有进展我第一时间同步您。`;
}

export interface DisciplineResult {
  reply: string;
  corrected: boolean;
  violation: string | null;
}

// 回复硬校验：先按阶段改写发货类话术，再扫描红线，命中即用阶段安全话术覆盖。
export function enforceReplyDiscipline(reply: string, state: DealState, decision: StageDecisionInput): DisciplineResult {
  if (isShippingQuestion(decision)) {
    const stageReply = buildStageAwareShippingReply(state);
    if (stageReply !== reply) {
      return { reply: stageReply, corrected: true, violation: "stage_shipping_rewrite" };
    }
    return { reply, corrected: false, violation: null };
  }

  const violation = detectRedlineViolation(reply, state.stage);
  if (violation) {
    return { reply: buildStageSafeFallback(state), corrected: true, violation };
  }
  return { reply, corrected: false, violation: null };
}

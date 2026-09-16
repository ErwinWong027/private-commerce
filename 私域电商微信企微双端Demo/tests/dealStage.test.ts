import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyManualAdvance,
  buildStageAwareShippingReply,
  detectRedlineViolation,
  enforceReplyDiscipline,
  isShippingQuestion,
  INITIAL_DEAL_STATE,
  nextStageFromCustomer,
  type StageDecisionInput,
} from "../src/server/dealStage";
import type { DealState } from "../src/types";

function shippingDecision(subIntent: "delivery_time" | "shipping_origin", reply: string): StageDecisionInput {
  return { toolName: "fulfillment", subIntent, needHuman: false, reply };
}

describe("dealStage T02 防跳步", () => {
  it("客户咨询/刚发地址阶段问物流，回复不得跳到已揽收或既定时效", () => {
    const state: DealState = { ...INITIAL_DEAL_STATE };
    const reply = buildStageAwareShippingReply(state);
    assert.ok(!reply.includes("已揽收"));
    assert.ok(reply.includes("还没到发货环节"));
  });

  it("客户消息最多把进度自动推进到待核对，绝不跳到已揽收/运输中", () => {
    assert.equal(
      nextStageFromCustomer("consulting", { toolName: "fulfillment", subIntent: "payment_methods", needHuman: false, reply: "" }),
      "awaiting_payment",
    );
    assert.equal(
      nextStageFromCustomer("awaiting_payment", { toolName: "fulfillment", subIntent: "payment_completed", needHuman: false, reply: "" }),
      "awaiting_review",
    );
    // 仅问物流时效不应推进进度
    assert.equal(nextStageFromCustomer("consulting", shippingDecision("delivery_time", "")), "consulting");
  });

  it("已付款进入人工核对（needHuman=true）时，进度仍推进到待核对，不与人工路由耦合", () => {
    // 回归：此前人工分支冻结进度，导致客服接管后无法「确认核对」。进度推进只看客户消息，与是否转人工无关。
    assert.equal(
      nextStageFromCustomer("awaiting_payment", { toolName: "fulfillment", subIntent: "payment_completed", needHuman: true, reply: "" }),
      "awaiting_review",
    );
    // 咨询中直接说已付款也应推进到待核对（跳过待付款）
    assert.equal(
      nextStageFromCustomer("consulting", { toolName: "fulfillment", subIntent: "payment_completed", needHuman: true, reply: "" }),
      "awaiting_review",
    );
  });

  it("enforceReplyDiscipline 会把跳步的物流话术改写为当前阶段安全话术", () => {
    const state: DealState = { stage: "consulting", trackingNo: null };
    const decision = shippingDecision("delivery_time", "您的包裹已揽收，1-3 天送达");
    const result = enforceReplyDiscipline(decision.reply, state, decision);
    assert.equal(result.corrected, true);
    assert.ok(!result.reply.includes("已揽收"));
  });

  it("发货地（shipping_origin）不纳入阶段话术层：确定性话术走普通红线校验，不被改写也不 hedge", () => {
    // 回归：此前 shipping_origin 被并入阶段 plan→render 路径（State Context 无「发货地」事实），
    // 触发"不好直接确认"式 hedge。现改为阶段无关的确定性 FAQ，直接放行。
    const state: DealState = { stage: "consulting", trackingNo: null };
    const decision = shippingDecision("shipping_origin", "一般深圳发货，出单号后 48 小时内发出");
    assert.equal(isShippingQuestion(decision), false);
    const result = enforceReplyDiscipline(decision.reply, state, decision);
    assert.equal(result.corrected, false);
    assert.ok(result.reply.includes("深圳发货"));
  });
});

describe("dealStage 话术红线", () => {
  it("未核款不得出现收款成功类措辞", () => {
    assert.equal(detectRedlineViolation("您的款项已收款成功", "consulting"), "payment_confirmed");
    assert.equal(detectRedlineViolation("收款成功", "awaiting_review"), "payment_confirmed");
    // 到了待出单及以后允许确认收款
    assert.equal(detectRedlineViolation("收款成功", "awaiting_shipment"), null);
  });

  it("未揽收不得宣称已揽收/已发货", () => {
    assert.equal(detectRedlineViolation("快递已揽收", "awaiting_pickup"), "pickup_declared");
    assert.equal(detectRedlineViolation("已发货", "awaiting_shipment"), "shipment_declared");
    // 已揽收阶段允许说已揽收
    assert.equal(detectRedlineViolation("已揽收", "picked_up"), null);
  });

  it("命中红线的非物流回复会被阶段安全话术覆盖", () => {
    const state: DealState = { stage: "consulting", trackingNo: null };
    const decision: StageDecisionInput = { toolName: "pricing", subIntent: "quote", needHuman: false, reply: "已经揽收啦马上到" };
    const result = enforceReplyDiscipline(decision.reply, state, decision);
    assert.equal(result.corrected, true);
    assert.equal(result.violation, "pickup_declared");
    assert.ok(!result.reply.includes("揽收"));
  });
});

describe("dealStage 按钮顺序", () => {
  it("必须严格按阶段顺序推进，跨阶段一律拒绝", () => {
    let state: DealState = { stage: "awaiting_review", trackingNo: null };
    // 跨阶段：待核对直接模拟揽收应拒绝
    const skip = applyManualAdvance(state, "simulate_pickup");
    assert.equal(skip.ok, false);

    const confirm = applyManualAdvance(state, "confirm_review");
    assert.equal(confirm.ok, true);
    assert.equal(confirm.state.stage, "awaiting_shipment");
    state = confirm.state;

    const tracking = applyManualAdvance(state, "generate_tracking");
    assert.equal(tracking.ok, true);
    assert.equal(tracking.state.stage, "awaiting_pickup");
    assert.ok(tracking.state.trackingNo && tracking.state.trackingNo.startsWith("SF"));
    state = tracking.state;

    const pickup = applyManualAdvance(state, "simulate_pickup");
    assert.equal(pickup.ok, true);
    assert.equal(pickup.state.stage, "picked_up");
    state = pickup.state;

    const transit = applyManualAdvance(state, "simulate_transit");
    assert.equal(transit.ok, true);
    assert.equal(transit.state.stage, "in_transit");
    // 运单号在推进过程中保持不变
    assert.equal(transit.state.trackingNo, tracking.state.trackingNo);
  });
});

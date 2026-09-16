import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStateContext,
  derivePrecision,
  clampPrecision,
  ORDER_FACTS,
  OrderFactId,
  OrderReplyPlan,
  validateOrderPlan,
} from "../src/server/stateContext";

describe("stateContext：阶段 → 封闭事实集 + 业务口径", () => {
  it("consulting：无已确认订单事实，业务口径恒可用", () => {
    const ctx = buildStateContext("consulting", null);
    assert.deepEqual(ctx.confirmed, []);
    assert.equal(ctx.unknown.length, Object.keys(ORDER_FACTS).length);
    for (const id of ["SHIP_AFTER_PAYMENT", "ETA_AFTER_PICKUP", "NOT_IMMEDIATE_AFTER_PAY", "SHIP_FLOW"]) {
      assert.ok(ctx.policy.includes(id as never), `口径应可用 ${id}`);
    }
  });

  it("awaiting_review：仅 PAYMENT_SUBMITTED 已确认", () => {
    const ctx = buildStateContext("awaiting_review", null);
    assert.deepEqual(ctx.confirmed, ["PAYMENT_SUBMITTED"]);
    assert.ok(ctx.unknown.includes("PICKED_UP"));
    assert.ok(ctx.unknown.includes("PAYMENT_CONFIRMED"));
  });

  it("awaiting_pickup：出单相关事实已确认（对齐 REDLINES.allowedFrom）", () => {
    const ctx = buildStateContext("awaiting_pickup", "SF123");
    for (const id of ["PAYMENT_CONFIRMED", "ORDER_CREATED", "TRACKING_ISSUED"] as OrderFactId[]) {
      assert.ok(ctx.confirmed.includes(id), `应确认 ${id}`);
    }
    assert.ok(ctx.unknown.includes("PICKED_UP"));
  });
});

describe("derivePrecision：最大合理精度（按证据推导）", () => {
  const atReview = buildStateContext("awaiting_review", null);
  const atPickup = buildStateContext("awaiting_pickup", "SF1");
  const atPicked = buildStateContext("picked_up", "SF1");
  const atTransit = buildStateContext("in_transit", "SF1");

  // 场景 1/2/5/6/7：只有 48h SLA → BOUNDED
  it("ship_time @待核对 + 仅 SLA → BOUNDED（场景1/2/5/7）", () => {
    assert.equal(derivePrecision(["SHIP_AFTER_PAYMENT"], atReview, "ship_time"), "BOUNDED");
    assert.equal(derivePrecision(["NOT_IMMEDIATE_AFTER_PAY", "SHIP_AFTER_PAYMENT"], atReview, "ship_time"), "BOUNDED");
  });

  // 核心原则：付款不是发货的充分条件——只有付款事实时，「何时发」推不出 EXACT
  it("ship_time @待核对 + 仅付款事实 → NON_COMMITTAL（付款≠能发）", () => {
    assert.equal(derivePrecision(["PAYMENT_SUBMITTED"], atReview, "ship_time"), "NON_COMMITTAL");
  });

  // 场景 8：已揽收问「什么时候发/发了吗」→ EXACT（陈述现状，不用一般规则）
  it("ship_time @已揽收 + PICKED_UP → EXACT（场景8）", () => {
    assert.equal(derivePrecision(["PICKED_UP"], atPicked, "ship_time"), "EXACT");
  });
  it("shipped_status @待揽收 + TRACKING_ISSUED → EXACT", () => {
    assert.equal(derivePrecision(["TRACKING_ISSUED"], atPickup, "shipped_status"), "EXACT");
  });

  // 到达时间：已揽收/运输中只能给 ETA 范围（BOUNDED）；已签收才 EXACT
  it("arrival_time @已揽收 → BOUNDED（ETA 范围，非确定日期）", () => {
    assert.equal(derivePrecision(["PICKED_UP", "ETA_AFTER_PICKUP"], atPicked, "arrival_time"), "BOUNDED");
  });
  it("arrival_time @运输中 → BOUNDED", () => {
    assert.equal(derivePrecision(["IN_TRANSIT", "ETA_AFTER_PICKUP"], atTransit, "arrival_time"), "BOUNDED");
  });

  // 场景 9/10：客户问「没货?/单多?」——系统无库存/订单量事实 → 空 basis → NON_COMMITTAL
  it("ship_time + 空 basis（无库存/订单量事实）→ NON_COMMITTAL（场景9/10）", () => {
    assert.equal(derivePrecision([], atReview, "ship_time"), "NON_COMMITTAL");
  });

  // 流程问题：只有流程 RULE → CONDITIONAL
  it("flow + 仅 SHIP_FLOW RULE → CONDITIONAL（场景9流程可答）", () => {
    assert.equal(derivePrecision(["SHIP_FLOW"], atReview, "flow"), "CONDITIONAL");
  });
});

describe("clampPrecision：LLM 自报更高 → 钳回证据支持的精度", () => {
  it("EXACT 自报但证据只支持 BOUNDED → BOUNDED", () => {
    assert.equal(clampPrecision("EXACT", "BOUNDED"), "BOUNDED");
  });
  it("BOUNDED 自报但证据只支持 NON_COMMITTAL → NON_COMMITTAL", () => {
    assert.equal(clampPrecision("BOUNDED", "NON_COMMITTAL"), "NON_COMMITTAL");
  });
  it("自报不高于证据 → 保持不变", () => {
    assert.equal(clampPrecision("CONDITIONAL", "BOUNDED"), "CONDITIONAL");
  });
});

describe("validateOrderPlan：引用-only 闭集 + 未确认丢弃 + 精度钳制", () => {
  const atReview = buildStateContext("awaiting_review", null);

  it("未确认订单事实被引用 → 丢弃并记违规；SHIP_AFTER_PAYMENT 恒可引用", () => {
    const plan: OrderReplyPlan = {
      asked_dimension: "ship_time",
      basis: ["PICKED_UP", "SHIP_AFTER_PAYMENT"],
      answer_mode: "EXACT", // 自报过高
      commitments: [],
      action: "answer",
      disputed_premise: null,
    };
    const v = validateOrderPlan(plan, atReview);
    assert.equal(v.ok, false);
    assert.ok(v.violations.includes("unconfirmed_order_fact:PICKED_UP"));
    assert.deepEqual(v.basis, ["SHIP_AFTER_PAYMENT"]);
    // 只剩 SLA → 证据支持 BOUNDED；LLM 自报 EXACT → 钳回
    assert.equal(v.answer_mode, "BOUNDED");
    assert.ok(v.violations.includes("precision_clamped:EXACT->BOUNDED"));
  });

  it("不存在的 id → 丢弃并记违规（引用-only 闭集）", () => {
    const plan: OrderReplyPlan = {
      asked_dimension: "ship_time",
      basis: ["TELEPORTED", "STOCK_OUT"],
      answer_mode: "NON_COMMITTAL",
      commitments: [],
      action: "answer",
      disputed_premise: null,
    };
    const v = validateOrderPlan(plan, atReview);
    assert.equal(v.ok, false);
    assert.ok(v.violations.includes("unknown_fact:TELEPORTED"));
    assert.ok(v.violations.includes("unknown_fact:STOCK_OUT"));
    assert.equal(v.basis.length, 0);
    assert.equal(v.answer_mode, "NON_COMMITTAL");
  });

  it("已确认订单事实 + 无过度自报 → 放行", () => {
    const plan: OrderReplyPlan = {
      asked_dimension: "shipped_status",
      basis: ["PAYMENT_SUBMITTED"],
      answer_mode: "CONDITIONAL",
      commitments: ["will_update"],
      action: "answer",
      disputed_premise: null,
    };
    const v = validateOrderPlan(plan, atReview);
    assert.ok(v.basis.includes("PAYMENT_SUBMITTED"));
    // PAYMENT_SUBMITTED 对 shipped_status 不构成 decisive，且无 SLA/RULE → NON_COMMITTAL
    assert.equal(v.answer_mode, "NON_COMMITTAL");
  });

  it("已揽收 + shipped_status → EXACT 放行（不降级）", () => {
    const atPicked = buildStateContext("picked_up", "SF1");
    const plan: OrderReplyPlan = {
      asked_dimension: "shipped_status",
      basis: ["PICKED_UP"],
      answer_mode: "EXACT",
      commitments: [],
      action: "answer",
      disputed_premise: null,
    };
    const v = validateOrderPlan(plan, atPicked);
    assert.equal(v.ok, true);
    assert.equal(v.answer_mode, "EXACT");
    assert.deepEqual(v.violations, []);
  });
});

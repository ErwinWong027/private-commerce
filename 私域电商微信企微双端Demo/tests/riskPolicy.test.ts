import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeRiskReply, runRiskPolicy, type RiskSemanticTags } from "../src/server/riskPolicy";

const KB_FACTS = {
  sideEffects: "饱腹感、恶心、嗜睡、口渴、便秘、呕吐，部分人发热",
  effectPromise: "每个人的情况不一样，没办法承诺具体能瘦多少或多久见效，效果因人而异，具体以产品说明和个人使用情况为准哦。",
};

function tags(overrides: Partial<RiskSemanticTags> = {}): RiskSemanticTags {
  return {
    asks_personal_suitability: false,
    asks_side_effects: false,
    asks_treatment_claim: false,
    asks_effect_promise: false,
    is_negative_feedback: false,
    has_personal_health_context: false,
    personal_health_context: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe("riskPolicy：效果承诺 vs 效果负面反馈", () => {
  it("咨询效果承诺（无负反馈）→ KB 口径直答，不转人工", () => {
    const result = runRiskPolicy(tags({ asks_effect_promise: true }), KB_FACTS);
    assert.equal(result.needsHandoff, false);
    const effectPolicy = result.policies.find((p) => p.aspect === "effect_promise");
    assert.equal(effectPolicy?.action, "answer_from_kb");
    assert.match(composeRiskReply(result), /每个人的情况不一样/);
  });

  it("效果负面反馈（用了/买了没效果）→ effect_feedback 转人工，不甩效果因人而异口径", () => {
    const result = runRiskPolicy(tags({ asks_effect_promise: true, is_negative_feedback: true }), KB_FACTS);
    assert.equal(result.needsHandoff, true);
    const feedbackPolicy = result.policies.find((p) => p.aspect === "effect_feedback");
    assert.equal(feedbackPolicy?.action, "handoff");
    // 负反馈时不再输出效果承诺的 KB 免责话术
    assert.ok(!result.policies.some((p) => p.aspect === "effect_promise" && p.action === "answer_from_kb"));
    const reply = composeRiskReply(result);
    assert.ok(!reply.includes("每个人的情况不一样"), `回复不应包含免责口径: ${reply}`);
    assert.match(reply, /很抱歉给您带来了不好的体验/);
    assert.match(reply, /稍等哦～$/);
  });

  it("只有负面反馈标签（未同时标效果承诺）→ 仍触发转人工", () => {
    const result = runRiskPolicy(tags({ is_negative_feedback: true }), KB_FACTS);
    assert.equal(result.needsHandoff, true);
    assert.equal(result.policies.length, 1);
    assert.equal(result.policies[0].aspect, "effect_feedback");
    assert.match(composeRiskReply(result), /很抱歉给您带来了不好的体验/);
    assert.match(composeRiskReply(result), /稍等哦～$/);
  });

  it("负反馈与副作用咨询并存 → 副作用照答，负反馈转人工，收尾追加安抚", () => {
    const result = runRiskPolicy(tags({ asks_side_effects: true, is_negative_feedback: true }), KB_FACTS);
    assert.equal(result.needsHandoff, true);
    const reply = composeRiskReply(result);
    assert.match(reply, /恶心/);
    assert.match(reply, /稍等哦～$/);
  });

  it("语义置信度不足 → 保守转人工，不输出任何维度策略", () => {
    const result = runRiskPolicy(tags({ asks_effect_promise: true, is_negative_feedback: true, confidence: 0.5 }), KB_FACTS);
    assert.equal(result.needsHandoff, true);
    assert.deepEqual(result.policies, []);
    assert.match(composeRiskReply(result), /帮您确认一下，稍等/);
  });
});

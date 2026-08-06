import assert from "node:assert/strict";
import test from "node:test";
import { runPresalesEngine } from "@/lib/presalesEngine";
import { presalesAutomationCases } from "@/lib/presalesTestCases";

for (const testCase of presalesAutomationCases) {
  test(`${testCase.id} ${testCase.scenario}`, () => {
    const decision = runPresalesEngine({ message: testCase.input });

    assert.equal(decision.intent, testCase.expectedIntent);
    if (testCase.expectedNeedHuman !== undefined) {
      assert.equal(decision.needHuman, testCase.expectedNeedHuman);
    }

    testCase.expectedReplyIncludes.forEach((snippet) => {
      assert.equal(decision.reply.includes(snippet), true, `回复缺少片段: ${snippet}`);
    });

    (testCase.expectedReplyExcludes ?? []).forEach((snippet) => {
      assert.equal(decision.reply.includes(snippet), false, `回复包含不应出现片段: ${snippet}`);
    });

    (testCase.expectedBoundaryIncludes ?? []).forEach((snippet) => {
      assert.equal(decision.boundaryDecision.includes(snippet), true, `边界判定缺少片段: ${snippet}`);
    });
  });
}


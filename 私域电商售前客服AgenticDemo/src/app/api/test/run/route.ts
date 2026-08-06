import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { invalidateDocCache } from "@/lib/docRegistry";
import { presalesAutomationCases } from "@/lib/presalesTestCases";
import { runPresalesSkillOrchestrator } from "@/lib/presalesSkillOrchestrator";

export async function POST() {
  try {
    const results = [];
    for (const testCase of presalesAutomationCases) {
      const decision = await runPresalesSkillOrchestrator({ message: testCase.input });
      const includesPassed = testCase.expectedReplyIncludes.every((item) => decision.reply.includes(item));
      const excludesPassed = (testCase.expectedReplyExcludes ?? []).every((item) => !decision.reply.includes(item));
      const intentPassed = decision.intent === testCase.expectedIntent;
      const humanPassed =
        testCase.expectedNeedHuman === undefined ? true : decision.needHuman === testCase.expectedNeedHuman;
      const silentPassed =
        testCase.expectedSilentIntercept === undefined
          ? true
          : decision.silentIntercept === testCase.expectedSilentIntercept;
      const boundaryPassed = (testCase.expectedBoundaryIncludes ?? []).every((item) =>
        decision.boundaryDecision.includes(item),
      );

      results.push({
        id: testCase.id,
        scenario: testCase.scenario,
        passed: includesPassed && excludesPassed && intentPassed && humanPassed && silentPassed && boundaryPassed,
        intent: decision.intent,
        needHuman: decision.needHuman,
        silentIntercept: decision.silentIntercept,
        reply: decision.reply,
      });
    }

    const passedCount = results.filter((item) => item.passed).length;
    const report = buildMarkdownReport(results, passedCount);
    await persistReport(report);

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
        passRate: Number(((passedCount / results.length) * 100).toFixed(1)),
      },
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "测试执行失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

async function persistReport(content: string): Promise<void> {
  const reportDir = path.join(process.cwd(), "tests", "reports");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "presales-demo-report.md");
  await writeFile(reportPath, content, "utf8");
  invalidateDocCache();
}

function buildMarkdownReport(
  results: Array<{ id: string; scenario: string; passed: boolean; intent: string; needHuman: boolean; silentIntercept: boolean; reply: string }>,
  passedCount: number,
): string {
  const rows = results
    .map((item) => `| ${item.id} | ${item.scenario} | ${item.passed ? "通过" : "失败"} | ${item.intent} | ${item.needHuman ? "是" : "否"} | ${item.silentIntercept ? "是" : "否"} |`)
    .join("\n");

  return `---
title: 私域售前 Demo 自动化测试报告
description: 基于 31 条售前测试用例自动生成的回归结果。
category: 测试评估
doc_type: 测试评估
---

# 私域售前 Demo 自动化测试报告

- 总用例数：${results.length}
- 通过数：${passedCount}
- 失败数：${results.length - passedCount}
- 通过率：${((passedCount / results.length) * 100).toFixed(1)}%

| 用例 ID | 场景 | 结果 | 意图 | 是否转人工 | 是否静默拦截 |
| --- | --- | --- | --- | --- | --- |
${rows}

## 失败详情

${results
  .filter((item) => !item.passed)
  .map((item) => `### ${item.id} ${item.scenario}\n\n- 实际意图：${item.intent}\n- 是否转人工：${item.needHuman ? "是" : "否"}\n- 是否静默拦截：${item.silentIntercept ? "是" : "否"}\n- 实际回复：${item.reply || "(空)"}\n`)
  .join("\n") || "全部通过。"}
`;
}

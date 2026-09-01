import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { invalidateDocCache } from "@/server/docRegistry";
import { presalesAutomationCases } from "@/server/presalesTestCases";
import { runPresalesGraph } from "@/server/presalesGraph";
import { ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import type { PresalesTestCaseResult } from "@/types";

interface RunResult extends PresalesTestCaseResult {
  silentIntercept: boolean;
}

export async function POST(request: Request) {
  try {
    requireIdentity(request, { role: "agent" });
    const results: RunResult[] = [];
    for (const testCase of presalesAutomationCases) {
      // 双端走 LangGraph 入口，dealState 用「咨询中」初值，保证用例之间互不串阶段。
      const { decision } = await runPresalesGraph({
        message: testCase.input,
        history: testCase.history ?? [],
        dealState: { stage: "consulting", trackingNo: null },
      });
      const replyText = decision.reply.join("。");
      const includesPassed = testCase.expectedReplyIncludes.every((item) => replyText.includes(item));
      const excludesPassed = (testCase.expectedReplyExcludes ?? []).every((item) => !replyText.includes(item));
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
        type: testCase.type,
        passed: includesPassed && excludesPassed && intentPassed && humanPassed && silentPassed && boundaryPassed,
        intent: decision.intent,
        expectedIntent: testCase.expectedIntent,
        needHuman: decision.needHuman,
        silentIntercept: decision.silentIntercept,
        reply: decision.reply,
        failures: [
          includesPassed ? null : "回复缺少必含要点",
          excludesPassed ? null : "回复出现禁用表述",
          intentPassed ? null : "意图不匹配",
          humanPassed ? null : "转人工判定不匹配",
          silentPassed ? null : "静默拦截判定不匹配",
          boundaryPassed ? null : "行动边界缺少必含要点",
        ].filter((item): item is string => item !== null),
      });
    }

    const passedCount = results.filter((item) => item.passed).length;
    await persistReport(buildMarkdownReport(results, passedCount));

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
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    const message = error instanceof Error ? error.message : "测试执行失败";
    const status = message.includes("FOUNDATION_MODEL_API_KEY") ? 503 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

async function persistReport(content: string): Promise<void> {
  const reportDir = path.join(process.cwd(), "tests", "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "presales-demo-report.md"), content, "utf8");
  invalidateDocCache();
}

function buildMarkdownReport(results: RunResult[], passedCount: number): string {
  const rows = results
    .map(
      (item) =>
        `| ${item.id} | ${item.scenario} | ${item.passed ? "通过" : "失败"} | ${item.intent} | ${item.needHuman ? "是" : "否"} | ${item.silentIntercept ? "是" : "否"} |`,
    )
    .join("\n");

  const failures =
    results
      .filter((item) => !item.passed)
      .map(
        (item) =>
          `### ${item.id} ${item.scenario}\n\n- 实际意图：${item.intent}\n- 是否转人工：${item.needHuman ? "是" : "否"}\n- 是否静默拦截：${item.silentIntercept ? "是" : "否"}\n- 实际回复：${item.reply || "(空)"}\n`,
      )
      .join("\n") || "全部通过。";

  return `---
title: 私域售前 Demo 自动化测试报告
description: 基于 41 条售前测试用例自动生成的回归结果。
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

${failures}
`;
}

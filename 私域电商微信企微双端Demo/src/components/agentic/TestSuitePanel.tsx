"use client";

import type { PresalesTestCaseResult, PresalesTestSummary } from "@/types";
import styles from "./agentic.module.css";

interface TestSuitePanelProps {
  summary: PresalesTestSummary | null;
  results: PresalesTestCaseResult[];
  running: boolean;
  onRun: () => void;
}

export function TestSuitePanel({ summary, results, running, onRun }: TestSuitePanelProps) {
  return (
    <section className={styles.panelCard} id="test-suite">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>自动化验证</p>
          <h2>41 条测试用例逐条回归</h2>
          <p className={styles.helperCopy}>每条用例都走真实 LangGraph 链路，配置的回复、意图、转人工、静默拦截与行动边界判定全中才记通过。</p>
        </div>
        <button className={styles.primaryButton} onClick={onRun} type="button" disabled={running}>
          {running ? "执行中..." : "一键回归 41 条用例"}
        </button>
      </div>

      {!summary ? (
        <div className={styles.emptyState}>
          <p>点击“一键回归 41 条用例”后，这里会展示整体通过率和失败用例摘要。</p>
        </div>
      ) : (
        <div className={styles.testStack}>
          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <span>总用例</span>
              <strong>{summary.total}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>通过</span>
              <strong>{summary.passed}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>失败</span>
              <strong>{summary.failed}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>通过率</span>
              <strong>{summary.passRate}%</strong>
            </article>
          </div>

          <div className={styles.resultList}>
            {results.map((item) => (
              <article
                key={item.id}
                className={`${styles.resultRow} ${item.passed ? styles.resultRowPass : styles.resultRowFail}`}
              >
                <div>
                  <strong>
                    {item.id} {item.scenario}
                  </strong>
                  <p>
                    意图：{item.intent}（期望 {item.expectedIntent}） / 转人工：{item.needHuman ? "是" : "否"}
                  </p>
                  {item.failures.length > 0 ? <p>失败原因：{item.failures.join("；")}</p> : null}
                </div>
                <span>{item.passed ? "通过" : "失败"}</span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

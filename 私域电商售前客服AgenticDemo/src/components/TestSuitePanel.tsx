"use client";

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

interface TestResult {
  id: string;
  scenario: string;
  passed: boolean;
  intent: string;
  needHuman: boolean;
}

interface TestSuitePanelProps {
  summary: TestSummary | null;
  results: TestResult[];
  running: boolean;
  onRun: () => void;
}

export function TestSuitePanel({ summary, results, running, onRun }: TestSuitePanelProps) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">自动化验证</p>
          <h2>31 条测试用例逐条回归</h2>
        </div>
        <button className="primary-button" onClick={onRun} type="button" disabled={running}>
          {running ? "执行中..." : "运行测试"}
        </button>
      </div>

      {!summary ? (
        <div className="empty-state">
          <p>点击“运行测试”后，这里会展示整体通过率和失败用例摘要。</p>
        </div>
      ) : (
        <div className="test-stack">
          <div className="metric-grid">
            <article className="metric-card">
              <span>总用例</span>
              <strong>{summary.total}</strong>
            </article>
            <article className="metric-card">
              <span>通过</span>
              <strong>{summary.passed}</strong>
            </article>
            <article className="metric-card">
              <span>失败</span>
              <strong>{summary.failed}</strong>
            </article>
            <article className="metric-card">
              <span>通过率</span>
              <strong>{summary.passRate}%</strong>
            </article>
          </div>

          <div className="result-list">
            {results.slice(0, 10).map((item) => (
              <article key={item.id} className={`result-row ${item.passed ? "result-row--pass" : "result-row--fail"}`}>
                <div>
                  <strong>
                    {item.id} {item.scenario}
                  </strong>
                  <p>
                    意图：{item.intent} / 转人工：{item.needHuman ? "是" : "否"}
                  </p>
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


"use client";

import { PresalesDecision } from "@/types";

interface DecisionPanelProps {
  decision: PresalesDecision | null;
}

export function DecisionPanel({ decision }: DecisionPanelProps) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">决策透明面板</p>
          <h2>意图、规则、转人工全链路</h2>
        </div>
      </div>

      {!decision ? (
        <div className="empty-state">
          <p>发送一条客户消息后，这里会展开展示本轮的意图识别、工具调用、工具返回、行动边界和最终回复。</p>
        </div>
      ) : (
        <div className="trace-stack">
          <div className="decision-summary">
            <span className="metric-chip">意图：{decision.intent}</span>
            <span className="metric-chip">置信度：{Math.round(decision.confidence * 100)}%</span>
            {decision.subIntent ? <span className="metric-chip">子意图：{decision.subIntent}</span> : null}
            {decision.styleVariant ? <span className="metric-chip">话术风格：{decision.styleVariant}</span> : null}
            <span className={`metric-chip ${decision.needHuman ? "metric-chip--warn" : "metric-chip--ok"}`}>
              {decision.needHuman ? "需要转人工" : "AI 可直接完成"}
            </span>
            {decision.silentIntercept ? <span className="metric-chip metric-chip--warn">已静默拦截</span> : null}
          </div>

          <div className="trace-card">
            <h3>行动边界</h3>
            <p>{decision.boundaryDecision}</p>
          </div>

          {decision.silentIntercept ? (
            <div className="trace-card trace-card--warn">
              <h3>静默拦截</h3>
              <p>{decision.interceptReason ?? "本轮已进入人工接管队列，不向客户发送 AI 自动回复。"}</p>
              <p>通知状态：{decision.notificationStatus ?? "pending"}</p>
            </div>
          ) : null}

          <div className="trace-card">
            <h3>命中证据</h3>
            <ul>
              {decision.matchedEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {decision.toolName ? (
            <div className="trace-card">
              <h3>工具调用</h3>
              <pre>{`tool=${decision.toolName}\nargs=${(decision.toolArgs ?? []).join(" ") || "(none)"}`}</pre>
            </div>
          ) : null}

          {decision.toolResult ? (
            <div className="trace-card">
              <h3>工具返回</h3>
              <pre>{JSON.stringify(decision.toolResult, null, 2)}</pre>
            </div>
          ) : null}

          {decision.handoffSummary ? (
            <div className="trace-card trace-card--warn">
              <h3>转人工摘要</h3>
              <pre>{decision.handoffSummary}</pre>
            </div>
          ) : null}

          <div className="trace-grid">
            {decision.trace.map((item) => (
              <article key={item.id} className={`trace-step trace-step--${item.stage}`}>
                <span className="trace-step__tag">{item.stage.toUpperCase()}</span>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

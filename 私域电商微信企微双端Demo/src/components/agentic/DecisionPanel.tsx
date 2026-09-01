"use client";

import type { PresalesDecision } from "@/types";
import styles from "./agentic.module.css";

const traceStepStyle: Record<PresalesDecision["trace"][number]["stage"], string> = {
  llm: styles.traceStepLlm,
  tool: styles.traceStepTool,
  output: styles.traceStepOutput,
};

interface DecisionPanelProps {
  decision: PresalesDecision | null;
}

export function DecisionPanel({ decision }: DecisionPanelProps) {
  return (
    <section className={styles.panelCard}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>决策透明面板</p>
          <h2>意图、规则、转人工全链路</h2>
        </div>
      </div>

      {!decision ? (
        <div className={styles.emptyState}>
          <p>发送一条客户消息后，这里会展开展示本轮的意图识别、工具调用、工具返回、行动边界和最终回复。</p>
        </div>
      ) : (
        <div className={styles.traceStack}>
          <div className={styles.decisionSummary}>
            <span className={styles.metricChip}>意图：{decision.intent}</span>
            <span className={styles.metricChip}>置信度：{Math.round(decision.confidence * 100)}%</span>
            {decision.subIntent ? <span className={styles.metricChip}>子意图：{decision.subIntent}</span> : null}
            {decision.styleVariant ? <span className={styles.metricChip}>话术风格：{decision.styleVariant}</span> : null}
            <span
              className={`${styles.metricChip} ${decision.needHuman ? styles.metricChipWarn : styles.metricChipOk}`}
            >
              {decision.needHuman ? "需要转人工" : "AI 可直接完成"}
            </span>
            {decision.silentIntercept ? (
              <span className={`${styles.metricChip} ${styles.metricChipWarn}`}>已静默拦截</span>
            ) : null}
            {decision.handoffTriggerType ? (
              <span className={styles.metricChip}>触发类型：{decision.handoffTriggerType}</span>
            ) : null}
          </div>

          <div className={styles.traceCard}>
            <h3>行动边界</h3>
            <p>{decision.boundaryDecision}</p>
          </div>

          {decision.silentIntercept ? (
            <div className={`${styles.traceCard} ${styles.traceCardWarn}`}>
              <h3>静默拦截</h3>
              <p>{decision.interceptReason ?? "本轮已进入人工接管队列，不向客户发送 AI 自动回复。"}</p>
              <p>通知状态：{decision.notificationStatus ?? "pending"}</p>
            </div>
          ) : null}

          <div className={styles.traceCard}>
            <h3>命中证据</h3>
            <ul>
              {decision.matchedEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {decision.toolName ? (
            <div className={styles.traceCard}>
              <h3>工具调用</h3>
              <pre>{`tool=${decision.toolName}\nargs=${(decision.toolArgs ?? []).join(" ") || "(none)"}`}</pre>
            </div>
          ) : null}

          {decision.toolResult ? (
            <div className={styles.traceCard}>
              <h3>工具返回</h3>
              <pre>{JSON.stringify(decision.toolResult, null, 2)}</pre>
            </div>
          ) : null}

          {decision.handoffSummary ? (
            <div className={`${styles.traceCard} ${styles.traceCardWarn}`}>
              <h3>转人工摘要</h3>
              <pre>{decision.handoffSummary}</pre>
            </div>
          ) : null}

          <div className={styles.traceGrid}>
            {decision.trace.map((item) => (
              <article key={item.id} className={`${styles.traceStep} ${traceStepStyle[item.stage]}`}>
                <span className={styles.traceStepTag}>{item.stage.toUpperCase()}</span>
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

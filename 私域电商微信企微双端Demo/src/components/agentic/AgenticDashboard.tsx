"use client";

import { DEAL_STAGE_LABELS, type DealState, type HandoffTicketRecord } from "@/types";
import styles from "./agentic.module.css";

// 指标口径说明：这里只展示双端 metrics 表真实累加的 3 个 key，
// 不做任何推算，也不补充没有数据源的演示指标。
const METRIC_LABELS: Array<{ key: string; label: string }> = [
  { key: "total_messages", label: "消息总数" },
  { key: "ai_replies", label: "AI 回复数" },
  { key: "handoffs", label: "转人工次数" },
];

const TICKET_STATUS_LABELS: Record<string, string> = {
  pending: "待接管",
  in_progress: "人工处理中",
  resolved: "已处理",
};

interface AgenticDashboardProps {
  metrics: Record<string, number> | null;
  dealState: DealState | null;
  tickets: HandoffTicketRecord[];
  onTicketAction: (ticketId: string, action: "take_over" | "resolve") => void;
  ticketPending: boolean;
}

export function AgenticDashboard({
  metrics,
  dealState,
  tickets,
  onTicketAction,
  ticketPending,
}: AgenticDashboardProps) {
  return (
    <section className={styles.panelCard}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>演示看板</p>
          <h2>运行指标与人工承接</h2>
          <p className={styles.helperCopy}>指标直接取自演示库 metrics 表，仅统计本次演示会话的真实调用。</p>
        </div>
      </div>

      {!metrics ? (
        <div className={styles.emptyState}>
          <p>正在读取演示状态...</p>
        </div>
      ) : (
        <>
          <div className={styles.dashboardGrid}>
            {METRIC_LABELS.map((item) => (
              <article key={item.key} className={styles.metricCard}>
                <span>{item.label}</span>
                <strong>{metrics[item.key] ?? 0}</strong>
              </article>
            ))}
          </div>

          <div className={styles.dealRow}>
            <p className={styles.sectionTitle}>成交进度</p>
            <span className={styles.metricChip}>
              {dealState ? DEAL_STAGE_LABELS[dealState.stage] : "未开始"}
            </span>
            {dealState?.trackingNo ? (
              <span className={styles.metricChip}>模拟单号：{dealState.trackingNo}</span>
            ) : null}
          </div>

          <p className={styles.sectionTitle}>人工工单</p>
          {tickets.length === 0 ? (
            <div className={styles.emptyState}>
              <p>暂无转人工工单。触发敏感功效、点名人工等场景后，这里会出现待接管工单。</p>
            </div>
          ) : (
            <div className={styles.ticketList}>
              {tickets.map((ticket) => (
                <article key={ticket.id} className={styles.ticketRow}>
                  <strong>{ticket.triggerType}</strong>
                  <p>{ticket.summary}</p>
                  <div className={styles.ticketMeta}>
                    <span>{TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}</span>
                    <span>{ticket.id}</span>
                  </div>
                  {ticket.status !== "resolved" ? (
                    <div className={styles.headerActions}>
                      {ticket.status === "pending" ? (
                        <button
                          className={styles.ghostButton}
                          type="button"
                          disabled={ticketPending}
                          onClick={() => onTicketAction(ticket.id, "take_over")}
                        >
                          接管
                        </button>
                      ) : null}
                      <button
                        className={styles.ghostButton}
                        type="button"
                        disabled={ticketPending}
                        onClick={() => onTicketAction(ticket.id, "resolve")}
                      >
                        标记已处理
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

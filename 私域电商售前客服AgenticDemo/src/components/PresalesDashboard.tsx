"use client";

import { HandoffTicketRecord, OrderIntakeRecord, PresalesDashboardState } from "@/types";

interface PresalesDashboardProps {
  dashboard: PresalesDashboardState | null;
  onTakeover: (ticket: HandoffTicketRecord, status: "taken_over" | "resolved") => void;
}

export function PresalesDashboard({ dashboard, onTakeover }: PresalesDashboardProps) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">运营驾驶舱</p>
          <h2>商品、工单与试点指标</h2>
        </div>
      </div>

      {!dashboard ? (
        <div className="empty-state">
          <p>正在加载私域售前 Demo 状态...</p>
        </div>
      ) : (
        <div className="dashboard-stack">
          <MetricSection dashboard={dashboard} />
          <ProductSection dashboard={dashboard} />
          <HandoffSection handoffTickets={dashboard.handoffTickets} onTakeover={onTakeover} />
          <OrderSection orderIntakes={dashboard.orderIntakes} />
        </div>
      )}
    </section>
  );
}

function MetricSection({ dashboard }: { dashboard: PresalesDashboardState }) {
  return (
    <div className="dashboard-section">
      <h3>试点守护指标</h3>
      <div className="metric-grid">
        <MetricCard label="自动接待率" value={`${dashboard.pilotMetrics.autoServeRate}%`} />
        <MetricCard label="转人工率" value={`${dashboard.pilotMetrics.handoffRate}%`} />
        <MetricCard label="待通知真人" value={`${dashboard.pendingHumanRequests.length}`} />
        <MetricCard label="错价次数" value={`${dashboard.pilotMetrics.wrongPriceCount}`} />
        <MetricCard label="模拟转化率" value={`${dashboard.pilotMetrics.conversionRate}%`} />
      </div>
    </div>
  );
}

function ProductSection({ dashboard }: { dashboard: PresalesDashboardState }) {
  return (
    <div className="dashboard-section">
      <h3>商品与活动</h3>
      <div className="product-card-list">
        {dashboard.productCards.map((item) => (
          <article key={item.id} className="mini-card">
            <strong>{item.name}</strong>
            <p>{item.packageDesc}</p>
            <p>{item.productForm}</p>
            <p>{item.doses.join("/")}</p>
          </article>
        ))}
      </div>
      <div className="promo-list">
        {dashboard.activePromos.map((item) => (
          <span key={item.id} className="metric-chip">
            {item.name} -{item.discount}
          </span>
        ))}
      </div>
    </div>
  );
}

function HandoffSection({
  handoffTickets,
  onTakeover,
}: {
  handoffTickets: HandoffTicketRecord[];
  onTakeover: (ticket: HandoffTicketRecord, status: "taken_over" | "resolved") => void;
}) {
  return (
    <div className="dashboard-section">
      <div className="dashboard-section__header">
        <h3>转人工工单</h3>
        <span>{handoffTickets.length} 条</span>
      </div>
      {handoffTickets.length === 0 ? (
        <div className="empty-inline">当前还没有待处理工单。</div>
      ) : (
        <div className="card-list">
          {handoffTickets.map((ticket) => (
            <article key={ticket.id} className="mini-card mini-card--ticket">
              <div className="mini-card__header">
                <strong>{ticket.id}</strong>
                <span className="metric-chip">{ticket.status}</span>
              </div>
              <p>{ticket.triggerType}</p>
              <pre>{ticket.summary}</pre>
              <div className="mini-card__actions">
                <button type="button" onClick={() => onTakeover(ticket, "taken_over")}>
                  接管
                </button>
                <button type="button" onClick={() => onTakeover(ticket, "resolved")}>
                  已解决
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderSection({ orderIntakes }: { orderIntakes: OrderIntakeRecord[] }) {
  return (
    <div className="dashboard-section">
      <h3>下单承接状态</h3>
      {orderIntakes.length === 0 ? (
        <div className="empty-inline">当前没有进入付款承接流的客户。</div>
      ) : (
        <div className="card-list">
          {orderIntakes.map((item) => (
            <article key={item.id} className="mini-card">
              <strong>{item.id}</strong>
              <p>状态：{item.status}</p>
              <p>已收截图：{item.paymentScreenshot ? "是" : "否"}</p>
              <p>已人工核对：{item.addressConfirmed ? "是" : "否"}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

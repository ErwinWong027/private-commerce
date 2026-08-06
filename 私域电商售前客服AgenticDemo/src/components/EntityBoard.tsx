"use client";

import { useState } from "react";
import { formatTicketAmountWithEquivalent, getTicketBaseAmount, isPointsTicket } from "@/lib/ticketPricing";
import { Ticket } from "@/types";
import { TicketIcon, TrainIcon, ClockIcon, SeatIcon, RefreshIcon } from "@/components/Icons";

interface EntityBoardProps {
  tickets: Ticket[];
  onOpenModal: (ticket: Ticket, action: "REFUND" | "REBOOK") => void;
  onReset?: () => void;
}

function formatDeparture(dateTime: string): string {
  const date = new Date(dateTime);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date
    .getHours()
    .toString()
    .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")} 开`;
}

function formatArrival(dateTime?: string): string {
  if (!dateTime) {
    return "到站时间待定";
  }
  const date = new Date(dateTime);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date
    .getHours()
    .toString()
    .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")} 到`;
}

/**
 * Entity Board View Placeholder.
 * Renders database records and exposes transaction buttons.
 * Customize labels, structures, and fields to fit your specific business entities.
 */
export function EntityBoard({ tickets, onOpenModal, onReset }: EntityBoardProps) {
  const [showRefunded, setShowRefunded] = useState(false);
  const passengerDisplayName = tickets[0]?.passengerName ?? "示例用户";

  const refundedCount = tickets.filter((t) => t.status === "已退票").length;
  const displayedTickets = tickets.filter((t) => t.status !== "已退票" || showRefunded);

  return (
    <section className="panel-card ticket-board-panel">
      <div className="panel-header-row">
        <div className="panel-title-group">
          <h2>
            <TicketIcon size={16} />
            记录列表
          </h2>
          {onReset && (
            <button 
              className="btn-icon-sm reset-tickets-btn" 
              onClick={onReset}
              title="重置示例数据"
              aria-label="重置示例数据"
            >
              <RefreshIcon size={14} />
            </button>
          )}
        </div>
        <span className="panel-meta-text">用户名称：{passengerDisplayName}</span>
      </div>

      <div className="ticket-board-subheader">
        <label className="show-refunded-checkbox-label" htmlFor="show-refunded-checkbox">
          <input 
            type="checkbox"
            checked={showRefunded}
            onChange={(e) => setShowRefunded(e.target.checked)}
            id="show-refunded-checkbox"
          />
          <span>已取消/退款 ({refundedCount})</span>
        </label>
      </div>

      <div className="tickets-container">
        {displayedTickets.map((ticket) => {
          const amountText = isPointsTicket(ticket)
            ? formatTicketAmountWithEquivalent(ticket, getTicketBaseAmount(ticket))
            : formatTicketAmountWithEquivalent(ticket, ticket.price);

          return (
            <div
              key={ticket.id}
              className={`ticket-card-railway ${ticket.status === "已退票" ? "is-inactive" : ""}`}
            >
              <div className="ticket-serial-row">
                <span className="ticket-serial">
                  <TicketIcon size={12} />
                  {ticket.ticketSerial ?? ticket.id}
                </span>
                <span
                  className={`ticket-status-badge rail-status ${
                    ticket.status === "未使用"
                      ? "unused"
                      : ticket.status === "已改签"
                        ? "rebooked"
                        : "refunded"
                  }`}
                >
                  {ticket.status}
                </span>
              </div>

              <div className="ticket-route-railway">
                <div className="railway-station">
                  <span className="railway-station-name">{ticket.from}</span>
                </div>
                <div className="railway-train-center">
                  <span className="train-no-label">
                    <TrainIcon size={10} />
                    {ticket.trainNo}
                  </span>
                  <div className="railway-train-arrow" aria-hidden="true">
                    <span className="railway-train-line" />
                    <span className="railway-train-head" />
                  </div>
                </div>
                <div className="railway-station railway-station-end">
                  <span className="railway-station-name">{ticket.to}</span>
                </div>
              </div>

              <div className="railway-meta-grid">
                <span className="railway-meta-primary">
                  <ClockIcon size={11} className="opacity-70" />
                  {formatDeparture(ticket.departureTime)}
                </span>
                <span className="railway-meta-primary railway-meta-right">{formatArrival(ticket.arrivalTime)}</span>
                <span className="railway-meta-secondary">
                  {amountText} ({ticket.orderChannel ?? "APP"})
                </span>
                <span className="railway-meta-secondary railway-meta-right">
                  <SeatIcon size={11} className="opacity-70" />
                  {ticket.carriageNo ?? "--"}车 {ticket.seatLabel ?? "信息待定"}
                </span>
              </div>

              <div className="ticket-barcode" aria-hidden="true" />
              <div className="ticket-card-divider" />

              {ticket.status !== "已退票" && (
                <div className="ticket-actions railway-ticket-actions">
                  <button className="btn-action refund" onClick={() => onOpenModal(ticket, "REFUND")}>
                    申请退票
                  </button>
                  <button className="btn-action rebook" onClick={() => onOpenModal(ticket, "REBOOK")}>
                    申请改签
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

import { Ticket } from "@/types";

export const YUAN_PER_100_POINTS = 0.5;
export const POINTS_PER_YUAN = 100 / YUAN_PER_100_POINTS;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isPointsTicket(ticket: Pick<Ticket, "ticketType" | "paymentMethod">): boolean {
  return ticket.ticketType === "积分兑换票" || ticket.paymentMethod === "积分支付";
}

export function pointsToYuan(points: number): number {
  return roundToTwoDecimals(points / POINTS_PER_YUAN);
}

export function yuanToPoints(yuan: number): number {
  return Math.round(yuan * POINTS_PER_YUAN);
}

export function getTicketBaseAmount(ticket: Ticket): number {
  if (isPointsTicket(ticket)) {
    return ticket.pointsPrice ?? yuanToPoints(ticket.price);
  }
  return ticket.price;
}

export function getTicketCashEquivalent(ticket: Ticket): number {
  if (isPointsTicket(ticket)) {
    return ticket.pointsPrice ? pointsToYuan(ticket.pointsPrice) : ticket.price;
  }
  return ticket.price;
}

export function formatYuanAmount(amount: number): string {
  return Number.isInteger(amount) ? `¥${amount}` : `¥${amount.toFixed(2)}`;
}

export function formatTicketAmount(ticket: Ticket, amount: number): string {
  if (isPointsTicket(ticket)) {
    return `${Math.round(amount)} 积分`;
  }
  return `${formatYuanAmount(amount)}元`;
}

export function formatTicketAmountWithEquivalent(ticket: Ticket, amount: number): string {
  if (isPointsTicket(ticket)) {
    return `${Math.round(amount)} 积分（约 ${formatYuanAmount(pointsToYuan(amount))}）`;
  }
  return `${formatYuanAmount(amount)}元`;
}

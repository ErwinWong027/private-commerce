import {
  RebookingTargetDateDelta,
  RefundDetail,
  RefundPreview,
  RebookDetail,
  RebookPreview,
  Ticket,
} from "@/types";
import {
  calculateStandardRefund,
  calculateRebooking,
} from "./rulesEngine";
import { calculateHoursUntilDeparture, TicketTimeContext } from "./timeContext";

type PolicyStatus = "READY" | "BLOCKED";

export interface RefundPolicyResult {
  status: PolicyStatus;
  hoursUntilDeparture: number;
  fee?: number;
  rate?: number;
  refundAmount?: number;
  message: string;
}

export interface RebookPolicyResult {
  status: PolicyStatus;
  hoursUntilDeparture: number;
  targetPrice?: number;
  targetDateDelta?: RebookingTargetDateDelta;
  targetDepartureTime?: string;
  rebookFee?: number;
  rate?: number;
  diff?: number;
  diffRefundFee?: number;
  refundDiffAmount?: number;
  diffRefundRate?: number;
  totalToPay?: number;
  message: string;
}

export interface RebookPolicyInput {
  newPrice?: number;
  targetDateDelta?: RebookingTargetDateDelta;
  targetDepartureTime?: string;
  targetTo?: string;
}

/**
 * Placeholder Policy Service: evaluate refund feasibility and fees.
 * Customize the checks and constraints inside this function for your domain needs.
 */
export function evaluateRefundPolicy(
  ticket: Ticket,
  timeContext: TicketTimeContext,
  options?: { exceptionReason?: string }
): RefundPolicyResult {
  const hoursUntilDeparture = calculateHoursUntilDeparture(ticket.departureTime, timeContext);

  // 1. Redline checks (Place custom checks here)
  if (ticket.status === "已退票") {
    return {
      status: "BLOCKED",
      hoursUntilDeparture,
      message: "对不起，该车票已经办理过退票，无法重复办理。",
    };
  }

  if (ticket.status === "已乘车") {
    return {
      status: "BLOCKED",
      hoursUntilDeparture,
      message: "对不起，该车票已使用（已乘车），按规定无法办理退票手续。",
    };
  }

  // Exception override (e.g. railway responsibility, force majeure)
  if (options?.exceptionReason === "RAILWAY_RESPONSIBILITY") {
    return {
      status: "READY",
      hoursUntilDeparture,
      fee: 0,
      rate: 0,
      refundAmount: ticket.price,
      message: "【特批停运免费退票】因列车停运，免收退票手续费。应退金额将全额退回原支付账户。",
    };
  }

  // 2. Call rules engine
  const calculation = calculateStandardRefund(ticket.price, hoursUntilDeparture, ticket.status === "已改签");

  if (calculation.error) {
    return {
      status: "BLOCKED",
      hoursUntilDeparture,
      message: calculation.message || "由于规则限制，目前无法办理退票。",
    };
  }

  const refundAmount = Math.max(0, ticket.price - calculation.fee);

  return {
    status: "READY",
    hoursUntilDeparture,
    fee: calculation.fee,
    rate: calculation.rate,
    refundAmount,
    message: `您申请的退票处于 ${hoursUntilDeparture >= 192 ? "免费退票期" : "退票费核收期"}。核收退票手续费 ${calculation.fee} 元，实际退款金额 ${refundAmount} 元。`,
  };
}

/**
 * Placeholder Policy Service: evaluate rebooking feasibility and fees.
 * Customize the modification checks and parameters inside this function for your domain.
 */
export function evaluateRebookPolicy(
  ticket: Ticket,
  timeContext: TicketTimeContext,
  input?: RebookPolicyInput
): RebookPolicyResult {
  const hoursUntilDeparture = calculateHoursUntilDeparture(ticket.departureTime, timeContext);

  // 1. Core constraints checks
  if (ticket.status === "已退票") {
    return {
      status: "BLOCKED",
      hoursUntilDeparture,
      message: "对不起，该车票已退票，无法办理改签。",
    };
  }

  if (ticket.rebookCount >= 1) {
    return {
      status: "BLOCKED",
      hoursUntilDeparture,
      message: "对不起，该车票已办理过改签。根据规定，每张车票仅限办理一次改签手续。",
    };
  }

  // Resolve target variables (either provided by frontend or resolved to placeholders)
  const resolvedDelta = input?.targetDateDelta ?? (hoursUntilDeparture < 0 ? "same_day" : "earlier_or_same");
  const targetPrice = input?.newPrice ?? ticket.price;
  const targetDepartureTime = input?.targetDepartureTime ?? ticket.departureTime;

  // 2. Execute calculation
  const calculation = calculateRebooking(
    ticket.price,
    hoursUntilDeparture,
    resolvedDelta,
    targetPrice,
    ticket.ticketType
  );

  if (calculation.error) {
    return {
      status: "BLOCKED",
      hoursUntilDeparture,
      message: calculation.message || "目前无法改签该车票。",
    };
  }

  const rebookFee = calculation.rebookFee;
  const priceDifference = calculation.diff;
  const totalToPay = rebookFee + Math.max(0, priceDifference);

  return {
    status: "READY",
    hoursUntilDeparture,
    targetPrice,
    targetDateDelta: resolvedDelta,
    targetDepartureTime,
    rebookFee,
    rate: calculation.rate,
    diff: priceDifference,
    diffRefundFee: calculation.diffRefundFee,
    refundDiffAmount: calculation.actualDiffRefund,
    diffRefundRate: calculation.diffRefundRate,
    totalToPay,
    message: `符合改签条件。新票面价值 ${targetPrice} 元，改签费 ${rebookFee} 元。` + 
      (priceDifference > 0 
        ? `需要补收差额 ${priceDifference} 元，合并支付 ${totalToPay} 元。` 
        : priceDifference < 0 
          ? `将退还您差额 ${calculation.actualDiffRefund} 元（扣除差额退票费 ${calculation.diffRefundFee} 元）。` 
          : "无差额需要补退。"),
  };
}

/**
 * Builds formatted Preview model for refund flow.
 */
export function buildRefundPreview(ticket: Ticket, result: RefundPolicyResult): RefundPreview {
  const isFree = (result.fee ?? 0) === 0;

  return {
    originalPrice: ticket.price,
    feeRate: result.rate ?? 0,
    refundFee: result.fee ?? 0,
    refundAmount: result.refundAmount ?? ticket.price,
    invoiceStatus: ticket.invoiceStatus,
    hoursUntilDeparture: result.hoursUntilDeparture,
    ruleTitle: isFree ? "免费退票期规则" : "梯次核收退票费规则",
    feeRule: isFree ? "免收退票手续费" : "根据发车前时间梯度比例核收退票手续费",
    rateExplanation: isFree 
      ? "距发车在 8 天以上（含 8 天）的，免收退票费。" 
      : `距发车不足 8 天，核收 ${Math.round((result.rate ?? 0) * 100)}% 退票手续费。`,
    deadlineRule: "开车前随时可办理线上退票，开车后不予退票。",
    settlementRule: "退款原路退回您的支付工具。",
  };
}

/**
 * Builds formatted Preview model for rebook flow.
 */
export function buildRebookPreview(ticket: Ticket, result: RebookPolicyResult): RebookPreview {
  const targetPrice = result.targetPrice ?? ticket.price;
  const isFree = (result.rebookFee ?? 0) === 0;

  return {
    targetPrice,
    targetDateDelta: result.targetDateDelta ?? "earlier_or_same",
    targetDepartureTime: result.targetDepartureTime,
    hoursUntilDeparture: result.hoursUntilDeparture,
    rebookFee: result.rebookFee ?? 0,
    feeRate: result.rate ?? 0,
    priceDifference: result.diff ?? 0,
    diffRefundFee: result.diffRefundFee ?? 0,
    refundDiffAmount: result.refundDiffAmount ?? 0,
    totalToPay: result.totalToPay ?? 0,
    ruleTitle: isFree ? "适用改签规则测算" : "改签手续费核收规则",
    rateExplanation: isFree 
      ? "改签至同乘车日或更早的车次，免收手续费。" 
      : `改签至次日及以后车次，核收 ${Math.round((result.rate ?? 0) * 100)}% 改签费。`,
    priceDiffRule: result.diff && result.diff > 0 
      ? "高票价补差：需补齐新车票全额并退还原车票全额。" 
      : "低票价退差：退还差额但差额部分须核收退票手续费。",
    targetSummary: `改签至新票价 ${targetPrice} 元`,
    settlementRule: "资金结算原路原卡返还或补扣。",
  };
}

export function buildRefundDetail(ticket: Ticket, result: RefundPolicyResult): RefundDetail {
  const fee = result.fee ?? 0;
  const refundAmount = result.refundAmount ?? ticket.price - fee;
  return {
    originalPrice: ticket.price,
    feeRate: result.rate ?? 0,
    refundFee: fee,
    refundAmount,
    invoiceStatus: ticket.invoiceStatus,
    message: `退款成功！退票费为 ${fee} 元，实际退款金额为 ${refundAmount} 元，款项已原路退回您的支付账户。`,
  };
}

export function buildRebookDetail(ticket: Ticket, result: RebookPolicyResult): RebookDetail {
  const diff = result.diff ?? 0;
  const rebookFee = result.rebookFee ?? 0;
  const diffRefundFee = result.diffRefundFee ?? 0;
  const refundDiffAmount = result.refundDiffAmount ?? 0;
  const totalToPay = result.totalToPay ?? 0;

  let msgText = `改签成功！新票面金额为 ${result.targetPrice} 元。`;
  if (diff > 0) {
    msgText += ` 补付票款差额 ${diff} 元，合计补付 ${totalToPay} 元。`;
  } else if (diff < 0) {
    msgText += ` 退还差额 ${refundDiffAmount} 元（扣除差额退票费 ${diffRefundFee} 元）。`;
  } else {
    msgText += ` 票价一致，无需支付额外费用。`;
  }

  return {
    rebookFee,
    priceDifference: diff,
    diffRefundFee,
    refundDiffAmount,
    totalToPay,
    message: msgText,
  };
}

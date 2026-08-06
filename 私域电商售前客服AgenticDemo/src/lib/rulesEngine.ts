// Generic Rules Engine
// Customize this file to implement the mathematical computations for your specific domain rules.

import { RebookingTargetDateDelta, TicketType } from "../types";

interface RefundResult {
  fee: number;
  rate: number;
  message?: string;
  error?: boolean;
}

interface RebookResult {
  rebookFee: number;
  rate: number;
  diff: number;
  diffRefundFee: number;
  actualDiffRefund: number;
  diffRefundRate: number;
  error?: boolean;
  message?: string;
}

/**
 * Placeholder Calculation Rule: standard refund computation.
 * Replace this logic to fit your specific refund/cancellation fees model.
 */
export function calculateStandardRefund(
  price: number,
  hours: number,
  isRescheduled: boolean = false
): RefundResult {
  let rate = 0.0;
  
  if (hours < 0) {
    return { fee: price, rate: 1.0, message: "已过截止办理时间，无法办理退票" };
  }
  
  // Standard tiered fee structure placeholder
  if (hours >= 192) {
    rate = 0.0; // Free refund
  } else if (hours >= 48) {
    rate = 0.05; // 5% fee
  } else if (hours >= 24) {
    rate = 0.10; // 10% fee
  } else {
    rate = 0.20; // 20% fee
  }

  let fee = price * rate;
  
  // Basic rounding rules placeholder (nearest 0.5 unit)
  if (rate > 0.0) {
    fee = Math.round(fee * 100) / 100;
    const integral = Math.floor(fee);
    const decimal = Math.round((fee - integral) * 100) / 100;
    if (decimal < 0.25) {
      fee = integral;
    } else if (decimal < 0.75) {
      fee = integral + 0.5;
    } else {
      fee = integral + 1;
    }
    
    // Minimum fee constraint
    if (fee < 2.0) {
      fee = Math.min(2.0, price);
    }
  } else {
    fee = 0.0;
  }
  
  return { fee, rate };
}

/**
 * Placeholder Calculation Rule: standard rebooking/modification computation.
 * Modify this to represent custom change/modifications fees.
 */
export function calculateRebooking(
  price: number,
  hours: number,
  targetDateDelta: RebookingTargetDateDelta,
  newPrice: number,
  ticketType: TicketType
): RebookResult {
  if (hours < 0) {
    if (targetDateDelta !== "same_day") {
      return { 
        rebookFee: 0, rate: 0, diff: 0, diffRefundFee: 0, actualDiffRefund: 0, diffRefundRate: 0,
        error: true, message: "对不起，车票已过发车时间，仅能改签至发车当天车次。" 
      };
    }
  }

  const lowPrice = Math.min(price, newPrice);
  let rate = 0.0;

  if (targetDateDelta === "earlier_or_same" || targetDateDelta === "same_day") {
    rate = 0.0;
  } else {
    if (hours >= 48) {
      rate = 0.05;
    } else if (hours >= 24) {
      rate = 0.15;
    } else {
      rate = 0.40;
    }
  }

  let rebookFee = lowPrice * rate;
  
  // Rounding logic
  if (rate > 0.0) {
    rebookFee = Math.round(rebookFee * 100) / 100;
    const integral = Math.floor(rebookFee);
    const decimal = Math.round((rebookFee - integral) * 100) / 100;
    if (decimal < 0.25) {
      rebookFee = integral;
    } else if (decimal < 0.75) {
      rebookFee = integral + 0.5;
    } else {
      rebookFee = integral + 1;
    }
  }

  const diff = newPrice - price;
  
  let diffRefundFee = 0;
  let actualDiffRefund = 0;
  let diffRefundRate = 0;

  if (diff < 0) {
    const diffAbs = Math.abs(diff);
    // Generic tiered fee refund for price differences
    if (hours >= 192) diffRefundRate = 0.0;
    else if (hours >= 48) diffRefundRate = 0.05;
    else if (hours >= 24) diffRefundRate = 0.10;
    else diffRefundRate = 0.20;

    if (hours <= 0) diffRefundRate = 0.20;
    
    let rawFee = diffAbs * diffRefundRate;
    if (diffRefundRate > 0) {
      rawFee = Math.round(rawFee * 100) / 100;
      const integral = Math.floor(rawFee);
      const decimal = Math.round((rawFee - integral) * 100) / 100;
      if (decimal < 0.25) diffRefundFee = integral;
      else if (decimal < 0.75) diffRefundFee = integral + 0.5;
      else diffRefundFee = integral + 1;
    }
    actualDiffRefund = diffAbs - diffRefundFee;
  }

  return {
    rebookFee,
    rate,
    diff,
    diffRefundFee,
    actualDiffRefund,
    diffRefundRate
  };
}

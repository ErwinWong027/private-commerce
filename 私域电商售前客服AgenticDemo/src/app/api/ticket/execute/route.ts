import { NextRequest, NextResponse } from "next/server";
import { getTicketById, updateTicket } from "@/lib/mockDb";
import { buildRebookDetail, buildRefundDetail, evaluateRebookPolicy, evaluateRefundPolicy } from "@/lib/policyService";
import { createTicketTimeContext } from "@/lib/timeContext";
import { RebookingTargetDateDelta } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const {
      ticketId,
      actionType,
      currentTime,
      newPrice,
      targetDateDelta,
      targetDepartureTime,
      targetTo,
      exceptionReason,
    } = await req.json();

    const ticket = getTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ success: false, message: "记录不存在" }, { status: 404 });
    }

    if (ticket.status === "已退票") {
      return NextResponse.json({ success: false, message: "该订单已办理过退款，无法重复操作" });
    }

    const timeContext = createTicketTimeContext(currentTime);

    if (actionType === "REFUND") {
      const refundPolicy = evaluateRefundPolicy(ticket, timeContext, {
        exceptionReason,
      });
      if (refundPolicy.status === "BLOCKED") {
        return NextResponse.json({ success: false, message: refundPolicy.message });
      }

      const updated = updateTicket(ticketId, { status: "已退票" });

      return NextResponse.json({
        success: true,
        action: "REFUND",
        ticket: updated,
        detail: buildRefundDetail(ticket, refundPolicy),
      });

    } else if (actionType === "REBOOK") {
      const normalizedTargetDelta: RebookingTargetDateDelta = targetDateDelta === "later"
        ? "later"
        : targetDateDelta === "same_day"
          ? "same_day"
          : "earlier_or_same";

      const rebookPolicy = evaluateRebookPolicy(ticket, timeContext, {
        newPrice: typeof newPrice === "number" ? newPrice : Number(newPrice),
        targetDateDelta: normalizedTargetDelta,
        targetDepartureTime: typeof targetDepartureTime === "string" ? targetDepartureTime : undefined,
        targetTo: typeof targetTo === "string" ? targetTo : undefined,
      });

      if (rebookPolicy.status === "BLOCKED") {
        return NextResponse.json({ success: false, message: rebookPolicy.message });
      }

      const targetAmount = rebookPolicy.targetPrice ?? ticket.price;
      
      let newArrivalTime: string | undefined = undefined;
      if (ticket.arrivalTime) {
        const durationMs = new Date(ticket.arrivalTime).getTime() - new Date(ticket.departureTime).getTime();
        const depTimeStr = rebookPolicy.targetDepartureTime ?? ticket.departureTime;
        const newDepTime = new Date(depTimeStr).getTime();
        const newArrTime = new Date(newDepTime + durationMs);
        
        if (depTimeStr.endsWith("Z")) {
          newArrivalTime = newArrTime.toISOString();
        } else {
          const pad = (n: number) => n.toString().padStart(2, '0');
          newArrivalTime = [
            `${newArrTime.getFullYear()}-${pad(newArrTime.getMonth() + 1)}-${pad(newArrTime.getDate())}`,
            `${pad(newArrTime.getHours())}:${pad(newArrTime.getMinutes())}:${pad(newArrTime.getSeconds())}`
          ].join('T');
        }
      }

      const updated = updateTicket(ticketId, {
        status: "已改签",
        rebookCount: ticket.rebookCount + 1,
        price: targetAmount,
        departureTime: rebookPolicy.targetDepartureTime ?? ticket.departureTime,
        arrivalTime: newArrivalTime ?? ticket.arrivalTime,
      });

      return NextResponse.json({
        success: true,
        action: "REBOOK",
        ticket: updated,
        detail: buildRebookDetail(ticket, rebookPolicy),
      });
    }

    return NextResponse.json({ success: false, message: "非法的交易操作类型" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "交易服务处理失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

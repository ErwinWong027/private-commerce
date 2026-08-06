import { NextRequest, NextResponse } from "next/server";
import { getTicketById } from "@/lib/mockDb";
import { buildRefundPreview, evaluateRefundPolicy } from "@/lib/policyService";
import { createTicketTimeContext } from "@/lib/timeContext";
import { RefundExceptionReason } from "@/types";

interface RefundPreviewRequestBody {
  ticketId?: string;
  currentTime?: string;
  exceptionReason?: RefundExceptionReason;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RefundPreviewRequestBody;
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    const ticket = getTicketById(ticketId);

    if (!ticket) {
      return NextResponse.json({ success: false, message: "记录不存在" }, { status: 404 });
    }

    if (ticket.status === "已退票") {
      return NextResponse.json({ success: false, message: "该订单已办理过退款，无法重复操作" });
    }

    const timeContext = createTicketTimeContext(body.currentTime);
    const refundPolicy = evaluateRefundPolicy(ticket, timeContext, {
      exceptionReason: body.exceptionReason,
    });

    if (refundPolicy.status === "BLOCKED") {
      return NextResponse.json({ success: false, message: refundPolicy.message });
    }

    return NextResponse.json({
      success: true,
      ticket,
      preview: buildRefundPreview(ticket, refundPolicy),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "退款预览失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

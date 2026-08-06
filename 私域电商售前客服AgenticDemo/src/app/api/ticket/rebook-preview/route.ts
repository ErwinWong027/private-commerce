import { NextRequest, NextResponse } from "next/server";
import { getTicketById } from "@/lib/mockDb";
import { buildRebookPreview, evaluateRebookPolicy } from "@/lib/policyService";
import { createTicketTimeContext } from "@/lib/timeContext";
import { RebookingTargetDateDelta } from "@/types";

interface RebookPreviewRequestBody {
  ticketId?: string;
  currentTime?: string;
  newPrice?: number;
  targetDateDelta?: RebookingTargetDateDelta;
  targetDepartureTime?: string;
  targetTo?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RebookPreviewRequestBody;
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    const ticket = getTicketById(ticketId);

    if (!ticket) {
      return NextResponse.json({ success: false, message: "记录不存在" }, { status: 404 });
    }

    if (ticket.status === "已退票") {
      return NextResponse.json({ success: false, message: "该车票已办理退票，无法再改签" });
    }

    const timeContext = createTicketTimeContext(body.currentTime);
    const rebookPolicy = evaluateRebookPolicy(ticket, timeContext, {
      newPrice: typeof body.newPrice === "number" ? body.newPrice : Number(body.newPrice),
      targetDateDelta: body.targetDateDelta,
      targetDepartureTime: body.targetDepartureTime,
      targetTo: body.targetTo,
    });

    if (rebookPolicy.status === "BLOCKED") {
      return NextResponse.json({ success: false, message: rebookPolicy.message });
    }

    return NextResponse.json({
      success: true,
      ticket,
      preview: buildRebookPreview(ticket, rebookPolicy),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "改签预览失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

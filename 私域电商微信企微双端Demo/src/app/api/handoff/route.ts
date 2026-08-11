import { NextResponse } from "next/server";
import { getRepository } from "@/server/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { ticketId?: unknown; action?: unknown };
    if (typeof body.ticketId !== "string" || (body.action !== "take_over" && body.action !== "resolve")) {
      return NextResponse.json({ error: "ticketId 与 action(take_over/resolve) 为必填项" }, { status: 400 });
    }
    const ticket = getRepository().updateTicket(body.ticketId, body.action);
    return ticket ? NextResponse.json({ ticket, conversation: getRepository().getConversation(ticket.sessionId) }) : NextResponse.json({ error: "工单不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
    return NextResponse.json({ error: "工单操作失败" }, { status: 500 });
  }
}

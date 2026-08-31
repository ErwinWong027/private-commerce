import { NextResponse } from "next/server";
import { ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import { getRepository } from "@/server/repository";

export async function POST(request: Request) {
  try {
    const identity = requireIdentity(request, { role: "agent" });
    const body = await request.json() as { ticketId?: unknown; action?: unknown };
    if (typeof body.ticketId !== "string" || (body.action !== "take_over" && body.action !== "resolve")) {
      return NextResponse.json({ error: "ticketId 与 action(take_over/resolve) 为必填项" }, { status: 400 });
    }
    const repo = getRepository();
    const result = repo.updateTicket(body.ticketId, body.action, identity.userId);
    if (!result.ok) {
      return result.reason === "not_found"
        ? NextResponse.json({ error: "工单不存在" }, { status: 404 })
        : NextResponse.json({ error: result.message }, { status: 409 });
    }
    return NextResponse.json({ ticket: result.ticket, conversation: repo.getConversation(result.ticket.sessionId, "agent") });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
    return NextResponse.json({ error: "工单操作失败" }, { status: 500 });
  }
}

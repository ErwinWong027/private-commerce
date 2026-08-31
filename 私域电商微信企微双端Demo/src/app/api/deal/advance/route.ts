import { NextResponse } from "next/server";
import { advanceDealStage, ConflictError, NotFoundError } from "@/server/conversationService";
import { ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import { DEAL_ACTIONS, type DealAdvanceAction } from "@/types";

const VALID_ACTIONS = DEAL_ACTIONS.map((item) => item.action) as readonly string[];

export async function POST(request: Request) {
  try {
    // 成交进度是客服侧运营动作，客户端不得调用；人工服务中仍允许推进（面板按钮本就在客服端）。
    requireIdentity(request, { role: "agent" });
    const body = await request.json() as { sessionId?: unknown; action?: unknown };
    if (typeof body.sessionId !== "string" || typeof body.action !== "string" || !VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: "sessionId 与 action(confirm_review/generate_tracking/simulate_pickup/simulate_transit) 为必填项" }, { status: 400 });
    }
    return NextResponse.json(advanceDealStage(body.sessionId, body.action as DealAdvanceAction));
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "推进操作失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

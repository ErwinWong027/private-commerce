import { NextResponse } from "next/server";
import { ConflictError, handleCustomerMessage, NotFoundError } from "@/server/conversationService";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionId?: unknown; message?: unknown };
    if (typeof body.sessionId !== "string" || typeof body.message !== "string" || !body.message.trim() || body.message.length > 2000) {
      return NextResponse.json({ error: "sessionId 与 1-2000 字符 message 为必填项" }, { status: 400 });
    }
    return NextResponse.json(await handleCustomerMessage(body.sessionId, body.message.trim()));
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "聊天服务异常";
    const status = message.includes("FOUNDATION_MODEL_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

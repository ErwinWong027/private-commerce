import { NextResponse } from "next/server";
import { ConflictError, handleCustomerMessage, NotFoundError } from "@/server/conversationService";
import { isMediaUrl } from "@/server/messageMedia";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sessionId?: unknown; message?: unknown; mediaUrl?: unknown };
    if (typeof body.sessionId !== "string" || typeof body.message !== "string" || body.message.length > 2000) {
      return NextResponse.json({ error: "sessionId、1-2000 字符 message（可配 mediaUrl 图片）为必填项" }, { status: 400 });
    }
    let mediaUrl: string | null = null;
    if (body.mediaUrl !== undefined && body.mediaUrl !== null) {
      if (!isMediaUrl(body.mediaUrl)) {
        return NextResponse.json({ error: "mediaUrl 必须是 /api/media/ 下的合法图片路径" }, { status: 400 });
      }
      mediaUrl = body.mediaUrl;
    }
    const text = body.message.trim();
    if (!text && !mediaUrl) return NextResponse.json({ error: "请提供 message 或 mediaUrl" }, { status: 400 });
    return NextResponse.json(await handleCustomerMessage(body.sessionId, text, mediaUrl));
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "聊天服务异常";
    const status = message.includes("FOUNDATION_MODEL_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import { getRepository } from "@/server/repository";

// 标记已读从 GET 详情里拆出来：GET 保持只读，未读清零必须由前端显式触发。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = requireIdentity(request);
    const { id } = await context.params;
    const repo = getRepository();
    const conversation = repo.getConversation(id, identity.role);
    if (!conversation) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    if (identity.role === "customer" && conversation.customerId !== identity.userId) {
      throw new ForbiddenError("无权访问该会话");
    }
    repo.markConversationRead(id, identity.role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "标记已读失败" }, { status: 500 });
  }
}

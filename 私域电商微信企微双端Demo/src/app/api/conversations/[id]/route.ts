import { NextResponse } from "next/server";
import { requireIdentity, UnauthorizedError } from "@/server/identity";
import { getRepository } from "@/server/repository";
import type { ConversationDetail } from "@/types";

// 客户端只需要聊天内容本身；AI 决策、置信度、静默拦截、图片识别文案属于客服侧运营视图，
// 一并返回会把内部判定逻辑暴露给客户，因此按角色裁剪响应。
function forCustomer(conversation: ConversationDetail): ConversationDetail {
  return {
    ...conversation,
    decisions: [],
    tickets: [],
    messages: conversation.messages
      .filter((item) => item.actor !== "system")
      .map((item) => ({ ...item, imageDescription: null })),
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = requireIdentity(request);
    const { id } = await context.params;
    const conversation = getRepository().getConversation(id, identity.role);
    if (!conversation) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    if (identity.role === "customer") {
      if (conversation.customerId !== identity.userId) return NextResponse.json({ error: "无权访问该会话" }, { status: 403 });
      return NextResponse.json({ conversation: forCustomer(conversation) });
    }
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: "会话读取失败" }, { status: 500 });
  }
}

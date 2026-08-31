import { NextResponse } from "next/server";
import { requireIdentity, UnauthorizedError } from "@/server/identity";
import { getRepository } from "@/server/repository";

export async function GET(request: Request) {
  try {
    const identity = requireIdentity(request);
    const repo = getRepository();
    const conversations = repo.listConversations(identity.role)
      .filter((item) => identity.role === "agent" || item.customerId === identity.userId);
    // 运营指标只对客服开放，客户端不需要也不应看到全局会话量。
    return NextResponse.json({ conversations, metrics: identity.role === "agent" ? repo.getMetrics() : {} });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: "会话列表读取失败" }, { status: 500 });
  }
}

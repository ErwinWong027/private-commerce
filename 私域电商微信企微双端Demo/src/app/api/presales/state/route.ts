import { NextResponse } from "next/server";
import { requireIdentity, ForbiddenError, UnauthorizedError } from "@/server/identity";
import { getRepository } from "@/server/repository";

const AGENTIC_DEMO_SESSION_ID = "S-001";

// /agentic 看板的只读数据源。指标口径直接取 metrics 表，不做任何推算，
// 因此看板上只出现双端真实统计到的项（消息总数 / AI 回复数 / 转人工数）。
// 与 /api/conversations 保持同一条约束：运营指标只对客服开放。
export async function GET(request: Request) {
  try {
    requireIdentity(request, { role: "agent" });
    const repo = getRepository();
    const conversation = repo.getConversation(AGENTIC_DEMO_SESSION_ID, "agent");
    if (!conversation) {
      return NextResponse.json({ success: false, message: "演示会话不存在" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      sessionId: AGENTIC_DEMO_SESSION_ID,
      metrics: repo.getMetrics(),
      dealState: conversation.dealState,
      decisions: conversation.decisions,
      tickets: conversation.tickets,
      status: conversation.status,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ success: false, message: "演示状态读取失败" }, { status: 500 });
  }
}

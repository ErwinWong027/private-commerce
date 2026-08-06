import { NextRequest, NextResponse } from "next/server";
import { getPresalesDashboardState, recordDecision } from "@/lib/presalesStore";
import { runPresalesSkillOrchestrator } from "@/lib/presalesSkillOrchestrator";

export async function POST(req: NextRequest) {
  try {
    const { message, history, sourceChannel } = await req.json();
    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ success: false, message: "消息内容为空" }, { status: 400 });
    }

    const safeHistory = Array.isArray(history) ? history : [];
    const decision = await runPresalesSkillOrchestrator({ message, history: safeHistory });
    recordDecision(
      message,
      decision,
      safeHistory,
      typeof sourceChannel === "string" ? sourceChannel : undefined,
    );

    return NextResponse.json({
      success: true,
      decision,
      dashboard: getPresalesDashboardState(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "聊天服务处理失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getPresalesDashboardState, updateHandoffStatus } from "@/lib/presalesStore";

export async function POST(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    if (typeof id !== "string" || (status !== "taken_over" && status !== "resolved")) {
      return NextResponse.json({ success: false, message: "参数不合法" }, { status: 400 });
    }

    const target = updateHandoffStatus(id, status);
    if (!target) {
      return NextResponse.json({ success: false, message: "未找到工单" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ticket: target,
      dashboard: getPresalesDashboardState(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "更新转人工工单失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}


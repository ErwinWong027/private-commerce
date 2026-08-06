import { NextResponse } from "next/server";
import { getTickets } from "@/lib/mockDb";

export async function GET() {
  try {
    const list = getTickets();
    return NextResponse.json({ success: true, tickets: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { resetDb } = await import("@/lib/mockDb");
    const list = resetDb();
    return NextResponse.json({ success: true, tickets: list, message: "数据库已成功重置为初始状态" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

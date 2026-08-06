import { NextResponse } from "next/server";
import { getPresalesDashboardState } from "@/lib/presalesStore";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: getPresalesDashboardState(),
  });
}


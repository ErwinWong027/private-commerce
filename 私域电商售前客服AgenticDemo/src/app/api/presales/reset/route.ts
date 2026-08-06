import { NextResponse } from "next/server";
import { getPresalesDashboardState, resetPresalesStore } from "@/lib/presalesStore";

export async function POST() {
  resetPresalesStore();
  return NextResponse.json({
    success: true,
    data: getPresalesDashboardState(),
  });
}


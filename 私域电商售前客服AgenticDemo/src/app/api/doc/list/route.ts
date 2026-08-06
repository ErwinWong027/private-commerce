import { NextResponse } from "next/server";
import { getDocEntries, invalidateDocCache } from "@/lib/docRegistry";

export async function GET() {
  try {
    // Invalidate cache first to scan for newly added documents on reload
    invalidateDocCache();
    const docs = await getDocEntries();
    return NextResponse.json({ success: true, docs });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

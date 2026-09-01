import { NextResponse } from "next/server";
import { getDocEntries, invalidateDocCache } from "@/server/docRegistry";
import { requireIdentity, UnauthorizedError } from "@/server/identity";

export async function GET(request: Request) {
  try {
    requireIdentity(request);
    invalidateDocCache();
    const docs = await getDocEntries();
    return NextResponse.json({ success: true, docs });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    const message = error instanceof Error ? error.message : "文档列表读取失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

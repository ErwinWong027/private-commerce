import { NextResponse } from "next/server";
import { getRepository } from "@/server/repository";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const role = (body as { role?: unknown })?.role;
  if (role !== "customer" && role !== "agent") return NextResponse.json({ error: "role 必须为 customer 或 agent" }, { status: 400 });
  return NextResponse.json({ user: getRepository().getUserForRole(role), demo: true });
}

import { NextResponse } from "next/server";
import { issueIdentityToken } from "@/server/identity";
import { getRepository } from "@/server/repository";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const role = (body as { role?: unknown })?.role;
  if (role !== "customer" && role !== "agent") return NextResponse.json({ error: "role 必须为 customer 或 agent" }, { status: 400 });
  const user = getRepository().getUserForRole(role);
  return NextResponse.json({ user, token: issueIdentityToken({ userId: user.id, role }), demo: true });
}

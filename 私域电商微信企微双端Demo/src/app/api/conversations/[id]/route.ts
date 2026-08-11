import { NextResponse } from "next/server";
import { getRepository } from "@/server/repository";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const markRead = new URL(request.url).searchParams.get("role") === "agent";
  const conversation = getRepository().getConversation(id, markRead);
  return conversation ? NextResponse.json({ conversation }) : NextResponse.json({ error: "会话不存在" }, { status: 404 });
}

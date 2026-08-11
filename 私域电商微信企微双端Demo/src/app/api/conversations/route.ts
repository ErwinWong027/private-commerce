import { NextResponse } from "next/server";
import { getRepository } from "@/server/repository";

export async function GET() {
  const repo = getRepository();
  return NextResponse.json({ conversations: repo.listConversations(), metrics: repo.getMetrics() });
}

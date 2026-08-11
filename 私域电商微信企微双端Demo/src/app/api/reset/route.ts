import { NextResponse } from "next/server";
import { getRepository } from "@/server/repository";

export async function POST() {
  return NextResponse.json({ conversation: getRepository().reset() });
}

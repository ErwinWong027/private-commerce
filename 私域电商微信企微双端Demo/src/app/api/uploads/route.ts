import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveUploadDir } from "@/server/uploadStorage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form ? form.get("file") : null;
  if (!(file instanceof File)) return NextResponse.json({ error: "请上传名为 file 的图片" }, { status: 400 });
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) return NextResponse.json({ error: "仅支持 PNG、JPEG、WebP、GIF 图片" }, { status: 415 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) return NextResponse.json({ error: "图片内容为空" }, { status: 400 });
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 413 });
  const filename = `${randomUUID()}.${extension}`;
  const dir = resolveUploadDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, filename), buffer);
  return NextResponse.json({ url: `/api/media/${filename}` });
}

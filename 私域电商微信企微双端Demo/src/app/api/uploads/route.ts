import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildMediaUrl, ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import { sniffMimeType } from "@/server/imageVision";
import { resolveUploadDir } from "@/server/uploadStorage";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// 以魔数嗅探结果决定扩展名，不再采信客户端声明的 file.type。
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  try {
    requireIdentity(request);
    // Content-Length 预检：超限请求在读入内存前就拒掉，避免大文件先落内存再判断。
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 413 });
    }
    const form = await request.formData().catch(() => null);
    const file = form ? form.get("file") : null;
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传名为 file 的图片" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength === 0) return NextResponse.json({ error: "图片内容为空" }, { status: 400 });
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "图片大小不能超过 5MB" }, { status: 413 });
    const mimeType = sniffMimeType(buffer);
    const extension = mimeType ? EXTENSIONS[mimeType] : undefined;
    if (!extension) return NextResponse.json({ error: "仅支持 PNG、JPEG、WebP、GIF 图片" }, { status: 415 });
    const filename = `${randomUUID()}.${extension}`;
    const dir = resolveUploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);
    return NextResponse.json({ url: buildMediaUrl(filename) });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "图片上传失败" }, { status: 500 });
  }
}

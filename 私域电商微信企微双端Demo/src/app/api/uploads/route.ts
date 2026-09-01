import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildMediaUrl, ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import { sniffMediaMimeType } from "@/server/mediaPipeline";
import { resolveUploadDir } from "@/server/uploadStorage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
};

export async function POST(request: Request) {
  try {
    requireIdentity(request);
    const form = await request.formData().catch(() => null);
    const file = form ? form.get("file") : null;
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传名为 file 的图片或语音" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength === 0) return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
    const mimeType = sniffMediaMimeType(buffer);
    if (!mimeType) return NextResponse.json({ error: "仅支持 PNG、JPEG、WebP、GIF 图片或 MP3、WAV、OGG、WebM、M4A 语音" }, { status: 415 });
    const isAudio = mimeType.startsWith("audio/");
    const extension = isAudio ? AUDIO_EXTENSIONS[mimeType] : IMAGE_EXTENSIONS[mimeType];
    if (!extension) return NextResponse.json({ error: "仅支持 PNG、JPEG、WebP、GIF 图片或 MP3、WAV、OGG、WebM、M4A 语音" }, { status: 415 });
    const maxBytes = isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) return NextResponse.json({ error: isAudio ? "语音大小不能超过 10MB" : "图片大小不能超过 5MB" }, { status: 413 });
    if (file.size > maxBytes || buffer.byteLength > maxBytes) return NextResponse.json({ error: isAudio ? "语音大小不能超过 10MB" : "图片大小不能超过 5MB" }, { status: 413 });
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


import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyMediaSignature } from "@/server/identity";
import { resolveUploadDir } from "@/server/uploadStorage";

const FILENAME_PATTERN = /^[\w-]+\.(png|jpe?g|webp|gif|mp3|wav|ogg|webm|m4a)$/i;
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  m4a: "audio/mp4",
};

// 媒体由 <img> / audio 直接加载，无法携带 X-Demo-Identity 头，
// 因此改为校验上传时下发的 URL 签名：拿不到签名就等于拿不到资源。
export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!FILENAME_PATTERN.test(name)) return Response.json({ error: "资源名称非法" }, { status: 400 });
  if (!verifyMediaSignature(name, new URL(request.url).searchParams.get("sig"))) {
    return Response.json({ error: "媒体链接签名无效" }, { status: 403 });
  }
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  try {
    const bytes = await readFile(path.join(resolveUploadDir(), name));
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": MIME_TYPES[extension], "Content-Length": String(bytes.byteLength), "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return Response.json({ error: "资源不存在" }, { status: 404 });
  }
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveUploadDir } from "@/server/uploadStorage";

const FILENAME_PATTERN = /^[\w-]+\.(png|jpe?g|webp|gif)$/i;
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!FILENAME_PATTERN.test(name)) return Response.json({ error: "资源名称非法" }, { status: 400 });
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  try {
    const bytes = await readFile(path.join(resolveUploadDir(), name));
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": MIME_TYPES[extension], "Content-Length": String(bytes.byteLength), "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return Response.json({ error: "图片不存在" }, { status: 404 });
  }
}

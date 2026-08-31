import path from "node:path";

export function resolveUploadDir() {
  return process.env.PRESALES_UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

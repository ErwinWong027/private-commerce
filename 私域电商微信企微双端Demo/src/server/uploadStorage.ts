import path from "node:path";

// 启动期一次性解析为绝对路径并缓存：PRESALES_UPLOAD_DIR 若配成相对路径，
// 后续任何 process.chdir 或不同工作目录启动都会让上传目录漂移，导致已落盘的图片读不到。
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.PRESALES_UPLOAD_DIR || path.join("data", "uploads"));

export function resolveUploadDir() {
  return UPLOAD_DIR;
}

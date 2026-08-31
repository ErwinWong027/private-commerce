import { verifyMediaSignature } from "./identity";

// 上传成功后返回的地址带 HMAC 签名（?sig=...），因此消息体里的 mediaUrl 需允许该后缀，
// 并连带校验签名，防止伪造他人图片路径。
export const MEDIA_URL_PATTERN = /^\/api\/media\/([\w-]+\.(?:png|jpe?g|webp|gif))\?sig=([\w-]+)$/i;

export function isMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const matched = MEDIA_URL_PATTERN.exec(value);
  if (!matched) return false;
  return verifyMediaSignature(matched[1], matched[2]);
}

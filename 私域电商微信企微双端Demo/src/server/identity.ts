import { createHmac, timingSafeEqual } from "node:crypto";
import type { PortalRole } from "@/types";

// Demo 身份令牌：HMAC 签名后由前端存 localStorage，并通过 X-Demo-Identity 头回传。
// 之所以不用 Cookie：客户端与客服端同域并排演示时，Cookie 会互相覆盖，无法同时保持两种身份。
export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export const IDENTITY_HEADER = "x-demo-identity";
const DEV_SECRET = "presales-demo-dev-secret";

export interface PortalIdentity {
  userId: string;
  role: PortalRole;
}

function secret(): string {
  const value = process.env.PRESALES_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 PRESALES_SESSION_SECRET");
  }
  return DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueIdentityToken(identity: PortalIdentity): string {
  const payload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseIdentityToken(token: unknown): PortalIdentity | null {
  if (typeof token !== "string") return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  if (!equals(token.slice(separator + 1), sign(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PortalIdentity>;
    if (typeof parsed.userId !== "string" || (parsed.role !== "customer" && parsed.role !== "agent")) return null;
    return { userId: parsed.userId, role: parsed.role };
  } catch {
    return null;
  }
}

export function requireIdentity(request: Request, options: { role?: PortalRole } = {}): PortalIdentity {
  const identity = parseIdentityToken(request.headers.get(IDENTITY_HEADER));
  if (!identity) throw new UnauthorizedError("请先完成演示登录");
  if (options.role && identity.role !== options.role) {
    throw new ForbiddenError(options.role === "agent" ? "该操作仅客服可执行" : "该操作仅客户可执行");
  }
  return identity;
}

// 图片资源签名：<img> 无法携带自定义请求头，因此改为在 URL 上带 HMAC 签名。
export function signMediaName(filename: string): string {
  return sign(`media:${filename}`);
}

export function verifyMediaSignature(filename: string, signature: unknown): boolean {
  return typeof signature === "string" && equals(signature, signMediaName(filename));
}

export function buildMediaUrl(filename: string): string {
  return `/api/media/${filename}?sig=${signMediaName(filename)}`;
}

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { IDENTITY_HEADER, issueIdentityToken, parseIdentityToken } from "../src/server/identity";

const dir = mkdtempSync(path.join(tmpdir(), "presales-api-"));
before(() => { process.env.PRESALES_DB_PATH = path.join(dir, "api.db"); });
after(() => rmSync(dir, { recursive: true, force: true }));

const CUSTOMER_TOKEN = issueIdentityToken({ userId: "U-CUSTOMER-001", role: "customer" });
const AGENT_TOKEN = issueIdentityToken({ userId: "U-AGENT-001", role: "agent" });

function chatRequest(body: unknown, token: string | null = CUSTOMER_TOKEN) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers[IDENTITY_HEADER] = token;
  return new Request("http://localhost/api/chat", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("demo-login API", () => {
  it("拒绝非法角色", async () => {
    const { POST } = await import("../src/app/api/auth/demo-login/route");
    const response = await POST(new Request("http://localhost/api/auth/demo-login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "admin" }),
    }));
    assert.equal(response.status, 400);
  });

  it("返回预置客服身份、签名令牌且不返回密钥", async () => {
    const { POST } = await import("../src/app/api/auth/demo-login/route");
    const response = await POST(new Request("http://localhost/api/auth/demo-login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "agent" }),
    }));
    const payload = await response.json() as { user: { id: string; name: string }; token: string; apiKey?: string };
    assert.equal(response.status, 200);
    assert.equal(payload.user.id, "U-AGENT-001");
    assert.equal(payload.user.name, "小禾");
    assert.equal(payload.apiKey, undefined);
    assert.deepEqual(parseIdentityToken(payload.token), { userId: "U-AGENT-001", role: "agent" });
    // 令牌被篡改后验签失败。
    assert.equal(parseIdentityToken(`${payload.token}x`), null);
  });
});

describe("chat API 图片消息校验", () => {
  it("未登录返回 401，客服身份返回 403", async () => {
    const { POST } = await import("../src/app/api/chat/route");
    assert.equal((await POST(chatRequest({ sessionId: "S-001", message: "你好" }, null))).status, 401);
    assert.equal((await POST(chatRequest({ sessionId: "S-001", message: "你好" }, AGENT_TOKEN))).status, 403);
  });

  it("message 与 mediaUrl 至少提供一项", async () => {
    const { POST } = await import("../src/app/api/chat/route");
    const response = await POST(chatRequest({ sessionId: "S-001", message: "  " }));
    assert.equal(response.status, 400);
  });

  it("拒绝非法 mediaUrl", async () => {
    const { POST } = await import("../src/app/api/chat/route");
    const response = await POST(chatRequest({ sessionId: "S-001", message: "你好", mediaUrl: "/etc/passwd" }));
    assert.equal(response.status, 400);
  });

  it("拒绝未签名或签名错误的 mediaUrl", async () => {
    const { POST } = await import("../src/app/api/chat/route");
    assert.equal((await POST(chatRequest({ sessionId: "S-001", message: "看图", mediaUrl: "/api/media/abc.png" }))).status, 400);
    assert.equal((await POST(chatRequest({ sessionId: "S-001", message: "看图", mediaUrl: "/api/media/abc.png?sig=bad" }))).status, 400);
  });
});

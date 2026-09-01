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

describe("客服人工回复状态", () => {
  it("人工回复后保持人工接管，显式解决后才恢复 AI", async () => {
    const { getRepository } = await import("../src/server/repository");
    const { handleAgentReply } = await import("../src/server/conversationService");
    const repo = getRepository();
    const customer = repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "需要人工");
    const { ticket } = repo.saveAutomatedDecision("S-001", customer.id, customer.content, {
      intent: "handoff", confidence: 1, reply: "", needHuman: true, silentIntercept: true,
      handoffTriggerType: "客户点名人工", boundaryDecision: "停止 AI 回复", matchedEvidence: [],
      handoffSummary: "客户要求人工", toolName: null, toolArgs: [], toolResult: null,
    });
    repo.updateTicket(ticket!.id, "take_over", "U-AGENT-001");
    const first = handleAgentReply("S-001", "U-AGENT-001", "您好，我来协助您");
    assert.equal(first.conversation?.status, "human_serving");
    assert.equal(first.conversation?.tickets[0].status, "in_progress");
    const second = handleAgentReply("S-001", "U-AGENT-001", "请问您想咨询哪方面？");
    assert.equal(second.conversation?.status, "human_serving");
    assert.equal(second.conversation?.tickets[0].status, "in_progress");
    assert.equal(repo.updateTicket(ticket!.id, "resolve", "U-AGENT-001").ok, true);
    assert.equal(repo.getSessionStatus("S-001"), "ai_serving");
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

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { IDENTITY_HEADER, issueIdentityToken } from "../src/server/identity";

const dir = mkdtempSync(path.join(tmpdir(), "presales-deal-"));
before(() => { process.env.PRESALES_DB_PATH = path.join(dir, "deal.db"); });
after(() => rmSync(dir, { recursive: true, force: true }));

const AGENT_TOKEN = issueIdentityToken({ userId: "U-AGENT-001", role: "agent" });
const CUSTOMER_TOKEN = issueIdentityToken({ userId: "U-CUSTOMER-001", role: "customer" });

function post(body: unknown, token: string | null = AGENT_TOKEN) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers[IDENTITY_HEADER] = token;
  return new Request("http://localhost/api/deal/advance", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

describe("deal advance API", () => {
  it("未登录返回 401，客户身份返回 403", async () => {
    const { POST } = await import("../src/app/api/deal/advance/route");
    assert.equal((await POST(post({ sessionId: "S-001", action: "confirm_review" }, null))).status, 401);
    assert.equal((await POST(post({ sessionId: "S-001", action: "confirm_review" }, CUSTOMER_TOKEN))).status, 403);
  });

  it("拒绝非法 action", async () => {
    const { POST } = await import("../src/app/api/deal/advance/route");
    const response = await POST(post({ sessionId: "S-001", action: "teleport" }));
    assert.equal(response.status, 400);
  });

  it("跨阶段推进返回 409（按钮顺序约束）", async () => {
    const { POST } = await import("../src/app/api/deal/advance/route");
    // 初始为咨询中，直接确认核对属于跨阶段
    const response = await POST(post({ sessionId: "S-001", action: "confirm_review" }));
    assert.equal(response.status, 409);
  });

  it("阶段就绪时可正常推进并返回新进度", async () => {
    const { getRepository } = await import("../src/server/repository");
    getRepository().setDealState("S-001", { stage: "awaiting_review", trackingNo: null });
    const { POST } = await import("../src/app/api/deal/advance/route");
    const response = await POST(post({ sessionId: "S-001", action: "confirm_review" }));
    const payload = await response.json() as { dealState: { stage: string } };
    assert.equal(response.status, 200);
    assert.equal(payload.dealState.stage, "awaiting_shipment");
  });

  it("会话不存在返回 404", async () => {
    const { POST } = await import("../src/app/api/deal/advance/route");
    const response = await POST(post({ sessionId: "S-UNKNOWN", action: "confirm_review" }));
    assert.equal(response.status, 404);
  });
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "presales-api-"));
before(() => { process.env.PRESALES_DB_PATH = path.join(dir, "api.db"); });
after(() => rmSync(dir, { recursive: true, force: true }));

describe("demo-login API", () => {
  it("拒绝非法角色", async () => {
    const { POST } = await import("../src/app/api/auth/demo-login/route");
    const response = await POST(new Request("http://localhost/api/auth/demo-login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "admin" }),
    }));
    assert.equal(response.status, 400);
  });

  it("返回预置客服身份且不返回密钥", async () => {
    const { POST } = await import("../src/app/api/auth/demo-login/route");
    const response = await POST(new Request("http://localhost/api/auth/demo-login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "agent" }),
    }));
    const payload = await response.json() as { user: { id: string; name: string }; apiKey?: string };
    assert.equal(response.status, 200);
    assert.equal(payload.user.id, "U-AGENT-001");
    assert.equal(payload.user.name, "小禾");
    assert.equal(payload.apiKey, undefined);
  });
});

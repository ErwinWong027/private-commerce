import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PresalesRepository } from "../src/server/repository";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function createRepository() {
  const dir = mkdtempSync(path.join(tmpdir(), "presales-repo-"));
  dirs.push(dir);
  return new PresalesRepository(path.join(dir, "test.db"));
}

describe("PresalesRepository", () => {
  it("初始化预置用户、会话与欢迎消息", () => {
    const repo = createRepository();
    const detail = repo.getConversation("S-001");
    assert.equal(repo.getUserForRole("customer").name, "林女士");
    assert.equal(detail?.status, "ai_serving");
    assert.equal(detail?.messages[0].sequence, 1);
    assert.equal(
      detail?.messages[0].content,
      "哈喽～欢迎添加，专注替西帕肽正品渠道，规格齐全、价优靠谱，支持一对一用量指导，有需要随时滴滴我～",
    );
    repo.close();
  });

  it("原子保存决策、AI 回复和工单，并支持接管与解决", () => {
    const repo = createRepository();
    const customer = repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "我要人工");
    const result = repo.saveAutomatedDecision("S-001", customer.id, "我要人工", {
      intent: "handoff", confidence: 0.99, reply: "", needHuman: true, silentIntercept: true,
      handoffTriggerType: "客户点名人工", boundaryDecision: "停止 AI 回复", matchedEvidence: ["handoff"],
      handoffSummary: "客户要求人工", toolName: null, toolArgs: [], toolResult: null,
    });
    assert.equal(result.reply, null);
    assert.equal(repo.getConversation("S-001")?.messages.length, 2);
    assert.equal(repo.getConversation("S-001")?.decisions.length, 1);
    assert.ok(result.ticket);
    repo.updateTicket(result.ticket!.id, "take_over");
    assert.equal(repo.getSessionStatus("S-001"), "human_serving");
    repo.updateTicket(result.ticket!.id, "resolve");
    assert.equal(repo.getSessionStatus("S-001"), "ai_serving");
    assert.equal(repo.getConversation("S-001")?.tickets[0].status, "resolved");
    repo.close();
  });

  it("消息 sequence 始终唯一递增", () => {
    const repo = createRepository();
    repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "一");
    repo.appendMessage("S-001", "agent", "U-AGENT-001", "二");
    assert.deepEqual(repo.getConversation("S-001")?.messages.map((m) => m.sequence), [1, 2, 3]);
    repo.close();
  });
});

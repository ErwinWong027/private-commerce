import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
    const takeOver = repo.updateTicket(result.ticket!.id, "take_over", "U-AGENT-001");
    assert.equal(takeOver.ok, true);
    assert.equal(repo.getSessionStatus("S-001"), "human_serving");
    const resolve = repo.updateTicket(result.ticket!.id, "resolve", "U-AGENT-001");
    assert.equal(resolve.ok, true);
    assert.equal(repo.getSessionStatus("S-001"), "ai_serving");
    assert.equal(repo.getConversation("S-001")?.tickets[0].status, "resolved");
    repo.close();
  });

  it("工单状态机：重复动作幂等，跨状态返回冲突", () => {
    const repo = createRepository();
    const customer = repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "我要人工");
    const { ticket } = repo.saveAutomatedDecision("S-001", customer.id, "我要人工", {
      intent: "handoff", confidence: 0.99, reply: "", needHuman: true, silentIntercept: true,
      handoffTriggerType: "客户点名人工", boundaryDecision: "停止 AI 回复", matchedEvidence: ["handoff"],
      handoffSummary: "客户要求人工", toolName: null, toolArgs: [], toolResult: null,
    });
    const ticketId = ticket!.id;
    assert.deepEqual(repo.updateTicket("T-NOT-EXIST", "take_over", "U-AGENT-001"), { ok: false, reason: "not_found" });
    const early = repo.updateTicket(ticketId, "resolve", "U-AGENT-001");
    assert.equal(early.ok, false);
    assert.equal(early.ok === false && early.reason, "invalid_transition");
    assert.equal(repo.getSessionStatus("S-001"), "ai_serving");
    repo.updateTicket(ticketId, "take_over", "U-AGENT-001");
    // 重复接管保持幂等，不会重复插入系统消息。
    const beforeRepeat = repo.getConversation("S-001")!.messages.length;
    assert.equal(repo.updateTicket(ticketId, "take_over", "U-AGENT-001").ok, true);
    assert.equal(repo.getConversation("S-001")!.messages.length, beforeRepeat);
    repo.updateTicket(ticketId, "resolve", "U-AGENT-001");
    const afterResolve = repo.getConversation("S-001")!.messages.length;
    assert.equal(repo.updateTicket(ticketId, "resolve", "U-AGENT-001").ok, true);
    assert.equal(repo.getConversation("S-001")!.messages.length, afterResolve);
    const reTakeOver = repo.updateTicket(ticketId, "take_over", "U-AGENT-001");
    assert.equal(reTakeOver.ok, false);
    assert.equal(reTakeOver.ok === false && reTakeOver.reason, "invalid_transition");
    repo.close();
  });

  it("双向未读记账，按角色分别清零", () => {
    const repo = createRepository();
    // seed 的欢迎消息由 AI 直接写入，未读从 0 起算。
    assert.equal(repo.listConversations("agent")[0].unreadCount, 0);
    assert.equal(repo.listConversations("customer")[0].unreadCount, 0);
    repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "在吗");
    repo.appendMessage("S-001", "ai", null, "在的");
    repo.appendMessage("S-001", "system", null, "系统提示");
    assert.equal(repo.listConversations("agent")[0].unreadCount, 1);
    assert.equal(repo.listConversations("customer")[0].unreadCount, 1);
    assert.equal(repo.markConversationRead("S-001", "agent"), true);
    assert.equal(repo.listConversations("agent")[0].unreadCount, 0);
    assert.equal(repo.listConversations("customer")[0].unreadCount, 1);
    assert.equal(repo.markConversationRead("S-001", "customer"), true);
    assert.equal(repo.listConversations("customer")[0].unreadCount, 0);
    assert.equal(repo.markConversationRead("S-404", "agent"), false);
    repo.close();
  });

  it("getConversation 不再清零未读", () => {
    const repo = createRepository();
    repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "在吗");
    repo.getConversation("S-001", "agent");
    assert.equal(repo.listConversations("agent")[0].unreadCount, 1);
    repo.close();
  });

  it("消息 sequence 始终唯一递增", () => {
    const repo = createRepository();
    repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "一");
    repo.appendMessage("S-001", "agent", "U-AGENT-001", "二");
    assert.deepEqual(repo.getConversation("S-001")?.messages.map((m) => m.sequence), [1, 2, 3]);
    repo.close();
  });

  it("保存图片消息，会话列表展示 [图片]", () => {
    const repo = createRepository();
    const image = repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "", "/api/media/abc.png");
    assert.equal(image.contentType, "image");
    assert.equal(image.mediaPath, "/api/media/abc.png");
    assert.equal(repo.listConversations()[0].lastMessage, "[图片]");
    const withCaption = repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "这个正品吗", "/api/media/def.png");
    assert.equal(withCaption.contentType, "image");
    assert.equal(withCaption.content, "这个正品吗");
    const text = repo.appendMessage("S-001", "agent", "U-AGENT-001", "是正品");
    assert.equal(text.contentType, "text");
    assert.equal(text.mediaPath, null);
    assert.equal(repo.listConversations()[0].lastMessage, "是正品");
    repo.close();
  });

  it("旧库（无图片列）启动时原地升级", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "presales-repo-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "legacy.db");
    const raw = new DatabaseSync(dbPath);
    raw.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL, organization TEXT, created_at TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, status TEXT NOT NULL, assigned_agent_id TEXT, unread_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, sequence INTEGER NOT NULL, actor TEXT NOT NULL, sender_id TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_id, sequence));
      INSERT INTO users VALUES ('U-1','customer','A','A',NULL,'t');
      INSERT INTO sessions VALUES ('S-1','U-1','ai_serving',NULL,0,'t','t');
      INSERT INTO messages VALUES ('M-1','S-1',1,'customer',NULL,'你好','t');
    `);
    raw.close();
    const repo = new PresalesRepository(dbPath);
    const legacy = repo.getConversation("S-1")!.messages[0];
    assert.equal(legacy.contentType, "text");
    assert.equal(legacy.mediaPath, null);
    const image = repo.appendMessage("S-1", "customer", "U-1", "", "/api/media/x.png");
    assert.equal(image.contentType, "image");
    assert.equal(repo.listConversations()[0].lastMessage, "[图片]");
    repo.close();
  });

  it("成交状态默认咨询中，可持久化并随 reset 恢复初始", () => {
    const repo = createRepository();
    assert.deepEqual(repo.getConversation("S-001")?.dealState, { stage: "consulting", trackingNo: null });
    repo.setDealState("S-001", { stage: "awaiting_pickup", trackingNo: "SF12345678" });
    assert.deepEqual(repo.getConversation("S-001")?.dealState, { stage: "awaiting_pickup", trackingNo: "SF12345678" });
    repo.reset();
    assert.deepEqual(repo.getConversation("S-001")?.dealState, { stage: "consulting", trackingNo: null });
    repo.close();
  });
});

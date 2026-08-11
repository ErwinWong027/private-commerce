import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ChatActor, ConversationDetail, ConversationSummary, DecisionRecord, HandoffTicketRecord, MessageRecord, SessionStatus, TicketStatus, UserRecord } from "@/types";

const DEFAULT_DB = path.join(process.cwd(), "data", "presales-demo.db");
const WELCOME = "哈喽～欢迎添加，专注替西帕肽正品渠道，规格齐全、价优靠谱，支持一对一用量指导，有需要随时滴滴我～";
type Row = Record<string, unknown>;

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function bool(value: unknown) { return Number(value) === 1; }
function jsonArray(value: unknown): string[] { try { return JSON.parse(String(value ?? "[]")); } catch { return []; } }
function jsonObject(value: unknown): Record<string, unknown> | null { if (!value) return null; try { return JSON.parse(String(value)); } catch { return null; } }

export class PresalesRepository {
  readonly db: DatabaseSync;

  constructor(dbPath = process.env.PRESALES_DB_PATH || DEFAULT_DB) {
    if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
    this.seed();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('customer','agent')), name TEXT NOT NULL,
        avatar TEXT NOT NULL, organization TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('ai_serving','human_serving','closed')),
        assigned_agent_id TEXT REFERENCES users(id), unread_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL, actor TEXT NOT NULL CHECK(actor IN ('customer','ai','agent','system')),
        sender_id TEXT REFERENCES users(id), content TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, intent TEXT NOT NULL, confidence REAL NOT NULL,
        need_human INTEGER NOT NULL, silent_intercept INTEGER NOT NULL, boundary_decision TEXT NOT NULL,
        matched_evidence TEXT NOT NULL, tool_name TEXT, tool_args TEXT NOT NULL, tool_result TEXT,
        handoff_summary TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS handoff_tickets (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending','in_progress','resolved')), trigger_type TEXT NOT NULL,
        summary TEXT NOT NULL, assigned_agent_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metrics (
        key TEXT PRIMARY KEY, value REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_sequence ON messages(session_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_decisions_session_created ON decisions(session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_session_status ON handoff_tickets(session_id, status);
    `);
  }

  private seed() {
    const t = now();
    this.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO users(id,role,name,avatar,organization,created_at) VALUES(?,?,?,?,?,?)")
        .run("U-CUSTOMER-001", "customer", "林女士", "林", null, t);
      this.db.prepare("INSERT OR IGNORE INTO users(id,role,name,avatar,organization,created_at) VALUES(?,?,?,?,?,?)")
        .run("U-AGENT-001", "agent", "小禾", "禾", "小禾健康私域服务中心", t);
      this.db.prepare("INSERT OR IGNORE INTO sessions(id,customer_id,status,assigned_agent_id,unread_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
        .run("S-001", "U-CUSTOMER-001", "ai_serving", null, 0, t, t);
      this.db.prepare("INSERT OR IGNORE INTO messages(id,session_id,sequence,actor,sender_id,content,created_at) VALUES(?,?,?,?,?,?,?)")
        .run("M-WELCOME-001", "S-001", 1, "ai", null, WELCOME, t);
      for (const [key, value] of [["total_messages", 1], ["ai_replies", 1], ["handoffs", 0]]) {
        this.db.prepare("INSERT OR IGNORE INTO metrics(key,value,updated_at) VALUES(?,?,?)").run(key, value, t);
      }
    });
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  getUserForRole(role: "customer" | "agent"): UserRecord {
    const userId = role === "customer" ? "U-CUSTOMER-001" : "U-AGENT-001";
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(userId) as Row;
    return { id: String(row.id), role: row.role as UserRecord["role"], name: String(row.name), avatar: String(row.avatar), organization: row.organization ? String(row.organization) : null };
  }

  listConversations(): ConversationSummary[] {
    const rows = this.db.prepare(`
      SELECT s.*, u.name customer_name,
        COALESCE((SELECT content FROM messages m WHERE m.session_id=s.id ORDER BY sequence DESC LIMIT 1),'') last_message,
        COALESCE((SELECT created_at FROM messages m WHERE m.session_id=s.id ORDER BY sequence DESC LIMIT 1),s.updated_at) last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id) message_count
      FROM sessions s JOIN users u ON u.id=s.customer_id ORDER BY last_message_at DESC
    `).all() as Row[];
    return rows.map((r) => ({
      id: String(r.id), customerId: String(r.customer_id), customerName: String(r.customer_name),
      status: r.status as SessionStatus, assignedAgentId: r.assigned_agent_id ? String(r.assigned_agent_id) : null,
      lastMessage: String(r.last_message), lastMessageAt: String(r.last_message_at),
      unreadCount: Number(r.unread_count), messageCount: Number(r.message_count),
    }));
  }

  getConversation(sessionId: string, markRead = false): ConversationDetail | null {
    const summary = this.listConversations().find((item) => item.id === sessionId);
    if (!summary) return null;
    if (markRead) this.db.prepare("UPDATE sessions SET unread_count=0 WHERE id=?").run(sessionId);
    const customerRow = this.db.prepare("SELECT * FROM users WHERE id=?").get(summary.customerId) as Row;
    const messages = (this.db.prepare("SELECT * FROM messages WHERE session_id=? ORDER BY sequence").all(sessionId) as Row[]).map(this.mapMessage);
    const decisions = (this.db.prepare("SELECT * FROM decisions WHERE session_id=? ORDER BY created_at DESC").all(sessionId) as Row[]).map(this.mapDecision);
    const tickets = (this.db.prepare("SELECT * FROM handoff_tickets WHERE session_id=? ORDER BY created_at DESC").all(sessionId) as Row[]).map(this.mapTicket);
    return {
      ...summary, unreadCount: markRead ? 0 : summary.unreadCount,
      customer: { id: String(customerRow.id), role: "customer", name: String(customerRow.name), avatar: String(customerRow.avatar), organization: null },
      messages, decisions, tickets,
    };
  }

  private mapMessage = (r: Row): MessageRecord => ({
    id: String(r.id), sessionId: String(r.session_id), sequence: Number(r.sequence), actor: r.actor as ChatActor,
    senderId: r.sender_id ? String(r.sender_id) : null, content: String(r.content), createdAt: String(r.created_at),
  });
  private mapDecision = (r: Row): DecisionRecord => ({
    id: String(r.id), sessionId: String(r.session_id), messageId: String(r.message_id), intent: String(r.intent),
    confidence: Number(r.confidence), needHuman: bool(r.need_human), silentIntercept: bool(r.silent_intercept),
    boundaryDecision: String(r.boundary_decision), matchedEvidence: jsonArray(r.matched_evidence),
    toolName: r.tool_name ? String(r.tool_name) : null, toolArgs: jsonArray(r.tool_args),
    toolResult: jsonObject(r.tool_result), handoffSummary: String(r.handoff_summary), createdAt: String(r.created_at),
  });
  private mapTicket = (r: Row): HandoffTicketRecord => ({
    id: String(r.id), sessionId: String(r.session_id), status: r.status as TicketStatus,
    triggerType: String(r.trigger_type), summary: String(r.summary), assignedAgentId: r.assigned_agent_id ? String(r.assigned_agent_id) : null,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  });

  getSessionStatus(sessionId: string): SessionStatus | null {
    const row = this.db.prepare("SELECT status FROM sessions WHERE id=?").get(sessionId) as Row | undefined;
    return row ? row.status as SessionStatus : null;
  }

  appendMessage(sessionId: string, actor: ChatActor, senderId: string | null, content: string): MessageRecord {
    return this.transaction(() => this.insertMessage(sessionId, actor, senderId, content));
  }

  private insertMessage(sessionId: string, actor: ChatActor, senderId: string | null, content: string): MessageRecord {
    const t = now();
    const next = Number((this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 seq FROM messages WHERE session_id=?").get(sessionId) as Row).seq);
    const messageId = id("M");
    this.db.prepare("INSERT INTO messages(id,session_id,sequence,actor,sender_id,content,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(messageId, sessionId, next, actor, senderId, content, t);
    this.db.prepare("UPDATE sessions SET updated_at=?, unread_count=unread_count+? WHERE id=?").run(t, actor === "customer" ? 1 : 0, sessionId);
    this.bump("total_messages", 1, t);
    return { id: messageId, sessionId, sequence: next, actor, senderId, content, createdAt: t };
  }

  saveAutomatedDecision(sessionId: string, customerMessageId: string, customerContent: string, decision: {
    intent: string; confidence: number; reply: string; needHuman: boolean; silentIntercept: boolean;
    handoffTriggerType: string | null; boundaryDecision: string; matchedEvidence: string[]; handoffSummary: string;
    toolName: string | null; toolArgs?: string[]; toolResult?: Record<string, unknown> | null;
  }) {
    return this.transaction(() => {
      const customerRow = this.db.prepare(
        "SELECT * FROM messages WHERE id=? AND session_id=? AND actor='customer'",
      ).get(customerMessageId, sessionId) as Row | undefined;
      if (!customerRow) throw new Error("客户消息不存在");
      const customer = this.mapMessage(customerRow);
      const t = now();
      const decisionId = id("D");
      this.db.prepare(`INSERT INTO decisions(id,session_id,message_id,intent,confidence,need_human,silent_intercept,boundary_decision,matched_evidence,tool_name,tool_args,tool_result,handoff_summary,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        decisionId, sessionId, customer.id, decision.intent, decision.confidence, decision.needHuman ? 1 : 0,
        decision.silentIntercept ? 1 : 0, decision.boundaryDecision, JSON.stringify(decision.matchedEvidence),
        decision.toolName, JSON.stringify(decision.toolArgs ?? []), decision.toolResult ? JSON.stringify(decision.toolResult) : null,
        decision.handoffSummary, t,
      );
      const reply = !decision.silentIntercept && decision.reply ? this.insertMessage(sessionId, "ai", null, decision.reply) : null;
      let ticket: HandoffTicketRecord | null = null;
      if (decision.needHuman) {
        const ticketId = id("T");
        this.db.prepare("INSERT INTO handoff_tickets(id,session_id,status,trigger_type,summary,assigned_agent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
          .run(ticketId, sessionId, "pending", decision.handoffTriggerType || "知识盲区", decision.handoffSummary || customerContent, null, t, t);
        ticket = { id: ticketId, sessionId, status: "pending", triggerType: decision.handoffTriggerType || "知识盲区", summary: decision.handoffSummary || customerContent, assignedAgentId: null, createdAt: t, updatedAt: t };
        this.bump("handoffs", 1, t);
      }
      if (reply) this.bump("ai_replies", 1, t);
      return { customer, reply, ticket };
    });
  }

  updateTicket(ticketId: string, action: "take_over" | "resolve"): HandoffTicketRecord | null {
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM handoff_tickets WHERE id=?").get(ticketId) as Row | undefined;
      if (!existing) return null;
      const t = now();
      if (action === "take_over") {
        this.db.prepare("UPDATE handoff_tickets SET status='in_progress',assigned_agent_id='U-AGENT-001',updated_at=? WHERE id=?").run(t, ticketId);
        this.db.prepare("UPDATE sessions SET status='human_serving',assigned_agent_id='U-AGENT-001',updated_at=? WHERE id=?").run(t, String(existing.session_id));
        this.insertMessage(String(existing.session_id), "system", null, "人工客服小禾已接入会话");
      } else {
        this.db.prepare("UPDATE handoff_tickets SET status='resolved',updated_at=? WHERE id=?").run(t, ticketId);
        this.db.prepare("UPDATE sessions SET status='ai_serving',assigned_agent_id=NULL,updated_at=? WHERE id=?").run(t, String(existing.session_id));
        this.insertMessage(String(existing.session_id), "system", null, "人工服务已结束，智能助手恢复服务");
      }
      return this.mapTicket(this.db.prepare("SELECT * FROM handoff_tickets WHERE id=?").get(ticketId) as Row);
    });
  }

  reset() {
    this.transaction(() => {
      this.db.exec("DELETE FROM decisions; DELETE FROM handoff_tickets; DELETE FROM messages; DELETE FROM sessions; DELETE FROM metrics;");
    });
    this.seed();
    return this.getConversation("S-001");
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries((this.db.prepare("SELECT key,value FROM metrics").all() as Row[]).map((r) => [String(r.key), Number(r.value)]));
  }

  private bump(key: string, amount: number, t: string) {
    this.db.prepare("INSERT INTO metrics(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value,updated_at=excluded.updated_at").run(key, amount, t);
  }

  close() { this.db.close(); }
}

let singleton: PresalesRepository | null = null;
export function getRepository() { singleton ??= new PresalesRepository(); return singleton; }

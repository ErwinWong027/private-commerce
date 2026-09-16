import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ChatActor, ConversationDetail, ConversationSummary, DealStage, DealState, DecisionRecord, HandoffTicketRecord, MediaAsset, MessageContentType, MessageRecord, PortalRole, SessionStatus, TicketStatus, UserRecord } from "@/types";

const DEFAULT_DB = path.join(process.cwd(), "data", "presales-demo.db");
const WELCOME = "哈喽～欢迎添加，专注替西帕肽正品渠道，规格齐全、价优靠谱，支持一对一用量指导，有需要随时滴滴我～";
type Row = Record<string, unknown>;

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function bool(value: unknown) { return Number(value) === 1; }
function jsonArray(value: unknown): string[] { try { return JSON.parse(String(value ?? "[]")); } catch { return []; } }
function jsonObject(value: unknown): Record<string, unknown> | null { if (!value) return null; try { return JSON.parse(String(value)); } catch { return null; } }
function mediaFilename(mediaPath: string): string { return mediaPath.split("?")[0].slice(mediaPath.split("?")[0].lastIndexOf("/") + 1); }
function inferMediaContentType(mediaPath: string | null, explicit?: MessageContentType): MessageContentType {
  if (explicit) return explicit;
  if (!mediaPath) return "text";
  const filename = mediaFilename(mediaPath).toLowerCase();
  if (/\.(mp3|wav|m4a|ogg|webm)$/.test(filename)) return "voice";
  if (/\.(png|jpe?g|webp|gif)$/.test(filename)) return "image";
  return "text";
}


export type TicketUpdateResult =
  | { ok: true; ticket: HandoffTicketRecord }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_transition"; message: string };

export interface AutomatedDecisionInput {
  intent: string;
  confidence: number;
  reply?: string[] | string;
  needHuman: boolean;
  silentIntercept: boolean;
  handoffTriggerType: string | null;
  boundaryDecision: string;
  matchedEvidence: string[];
  handoffSummary: string;
  toolName: string | null;
  toolArgs?: string[];
  toolResult?: Record<string, unknown> | null;
}

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
        assigned_agent_id TEXT REFERENCES users(id), unread_count INTEGER NOT NULL DEFAULT 0,
        customer_unread_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL, actor TEXT NOT NULL CHECK(actor IN ('customer','ai','agent','system')),
        sender_id TEXT REFERENCES users(id), content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text','image','voice')),
        media_path TEXT, image_description TEXT, media_asset_id TEXT REFERENCES media_assets(id), created_at TEXT NOT NULL, UNIQUE(session_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY, message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('voice','image')), local_path TEXT NOT NULL,
        transcript TEXT, extracted TEXT, confidence REAL, needs_manual_confirm INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
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
      CREATE TABLE IF NOT EXISTS deal_states (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        stage TEXT NOT NULL, tracking_no TEXT, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_sequence ON messages(session_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_decisions_session_created ON decisions(session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_session_status ON handoff_tickets(session_id, status);
      CREATE INDEX IF NOT EXISTS idx_media_assets_message ON media_assets(message_id);
    `);
    for (const [column, definition] of [
      ["content_type", "TEXT NOT NULL DEFAULT 'text'"],
      ["media_path", "TEXT"],
      ["image_description", "TEXT"],
      ["media_asset_id", "TEXT"],
    ] as const) {
      const columns = (this.db.prepare("PRAGMA table_info(messages)").all() as Row[]).map((item) => String(item.name));
      if (!columns.includes(column)) this.db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
    }
    if (this.messagesNeedVoiceConstraint()) this.rebuildMessagesForVoice();
    const mediaColumns = (this.db.prepare("PRAGMA table_info(media_assets)").all() as Row[]).map((item) => String(item.name));
    if (mediaColumns.length === 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY, message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('voice','image')), local_path TEXT NOT NULL,
          transcript TEXT, extracted TEXT, confidence REAL, needs_manual_confirm INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_media_assets_message ON media_assets(message_id);
      `);
    }
    // unread_count 表示客服侧未读，customer_unread_count 表示客户侧未读（旧库原地补列）。
    const sessionColumns = (this.db.prepare("PRAGMA table_info(sessions)").all() as Row[]).map((item) => String(item.name));
    if (!sessionColumns.includes("customer_unread_count")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN customer_unread_count INTEGER NOT NULL DEFAULT 0");
    }
  }

  private messagesNeedVoiceConstraint(): boolean {
    const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'").get() as Row | undefined;
    const sql = String(row?.sql ?? "").replace(/\s+/g, " ").toLowerCase();
    const legacyConstraint = /check\s*\(\s*content_type\s+in\s*\(\s*'text'\s*,\s*'image'\s*\)\s*\)/;
    return legacyConstraint.test(sql) && !sql.includes("'voice'");
  }

  private rebuildMessagesForVoice(): void {
    this.db.exec("PRAGMA foreign_keys = OFF");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(`
        CREATE TABLE messages_new (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL, actor TEXT NOT NULL CHECK(actor IN ('customer','ai','agent','system')),
          sender_id TEXT REFERENCES users(id), content TEXT NOT NULL,
          content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text','image','voice')),
          media_path TEXT, image_description TEXT, media_asset_id TEXT REFERENCES media_assets(id),
          created_at TEXT NOT NULL, UNIQUE(session_id, sequence)
        );
        INSERT INTO messages_new(id,session_id,sequence,actor,sender_id,content,content_type,media_path,image_description,media_asset_id,created_at)
          SELECT id,session_id,sequence,actor,sender_id,content,content_type,media_path,image_description,media_asset_id,created_at FROM messages;
        DROP INDEX IF EXISTS idx_messages_session_sequence;
        DROP TABLE messages;
        ALTER TABLE messages_new RENAME TO messages;
        CREATE INDEX idx_messages_session_sequence ON messages(session_id, sequence);
      `);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON");
    }
  }

  private seed() {
    const t = now();
    this.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO users(id,role,name,avatar,organization,created_at) VALUES(?,?,?,?,?,?)")
        .run("U-CUSTOMER-001", "customer", "林女士", "林", null, t);
      this.db.prepare("INSERT OR IGNORE INTO users(id,role,name,avatar,organization,created_at) VALUES(?,?,?,?,?,?)")
        .run("U-AGENT-001", "agent", "小禾", "禾", "小禾健康私域服务中心", t);
      this.db.prepare("INSERT OR IGNORE INTO sessions(id,customer_id,status,assigned_agent_id,unread_count,customer_unread_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .run("S-001", "U-CUSTOMER-001", "ai_serving", null, 0, 0, t, t);
      this.db.prepare("INSERT OR IGNORE INTO messages(id,session_id,sequence,actor,sender_id,content,created_at) VALUES(?,?,?,?,?,?,?)")
        .run("M-WELCOME-001", "S-001", 1, "ai", null, WELCOME, t);
      this.db.prepare("INSERT OR IGNORE INTO deal_states(session_id,stage,tracking_no,updated_at) VALUES(?,?,?,?)")
        .run("S-001", "consulting", null, t);
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

  getUserForRole(role: PortalRole): UserRecord {
    const row = this.db.prepare("SELECT * FROM users WHERE role=? ORDER BY created_at, id LIMIT 1").get(role) as Row | undefined;
    if (!row) throw new Error(`演示数据缺少角色 ${role} 的用户`);
    return { id: String(row.id), role: row.role as UserRecord["role"], name: String(row.name), avatar: String(row.avatar), organization: row.organization ? String(row.organization) : null };
  }

  listConversations(role: PortalRole = "agent"): ConversationSummary[] {
    const rows = this.db.prepare(`
      SELECT s.*, u.name customer_name,
        COALESCE((SELECT CASE WHEN content_type='image' THEN '[图片]' ELSE content END FROM messages m WHERE m.session_id=s.id ORDER BY sequence DESC LIMIT 1),'') last_message,
        COALESCE((SELECT created_at FROM messages m WHERE m.session_id=s.id ORDER BY sequence DESC LIMIT 1),s.updated_at) last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id) message_count
      FROM sessions s JOIN users u ON u.id=s.customer_id ORDER BY last_message_at DESC
    `).all() as Row[];
    return rows.map((r) => ({
      id: String(r.id), customerId: String(r.customer_id), customerName: String(r.customer_name),
      status: r.status as SessionStatus, assignedAgentId: r.assigned_agent_id ? String(r.assigned_agent_id) : null,
      lastMessage: String(r.last_message), lastMessageAt: String(r.last_message_at),
      unreadCount: Number(role === "agent" ? r.unread_count : r.customer_unread_count), messageCount: Number(r.message_count),
    }));
  }

  // 只读查询：标记已读改由 markConversationRead 显式触发，避免 GET 产生副作用。
  getConversation(sessionId: string, role: PortalRole = "agent"): ConversationDetail | null {
    const summary = this.listConversations(role).find((item) => item.id === sessionId);
    if (!summary) return null;
    const customerRow = this.db.prepare("SELECT * FROM users WHERE id=?").get(summary.customerId) as Row;
    const messages = (this.db.prepare("SELECT * FROM messages WHERE session_id=? ORDER BY sequence").all(sessionId) as Row[]).map(this.mapMessage);
    const decisions = (this.db.prepare("SELECT * FROM decisions WHERE session_id=? ORDER BY created_at DESC").all(sessionId) as Row[]).map(this.mapDecision);
    const tickets = (this.db.prepare("SELECT * FROM handoff_tickets WHERE session_id=? ORDER BY created_at DESC").all(sessionId) as Row[]).map(this.mapTicket);
    return {
      ...summary,
      customer: { id: String(customerRow.id), role: "customer", name: String(customerRow.name), avatar: String(customerRow.avatar), organization: null },
      messages, decisions, tickets, dealState: this.getDealState(sessionId),
    };
  }

  markConversationRead(sessionId: string, role: PortalRole): boolean {
    const column = role === "agent" ? "unread_count" : "customer_unread_count";
    const result = this.db.prepare(`UPDATE sessions SET ${column}=0 WHERE id=?`).run(sessionId);
    return Number(result.changes) > 0;
  }

  getDealState(sessionId: string): DealState {
    const row = this.db.prepare("SELECT stage, tracking_no FROM deal_states WHERE session_id=?").get(sessionId) as Row | undefined;
    if (!row) return { stage: "consulting", trackingNo: null };
    return { stage: row.stage as DealStage, trackingNo: row.tracking_no ? String(row.tracking_no) : null };
  }

  setDealState(sessionId: string, state: DealState): DealState {
    return this.transaction(() => {
      this.db.prepare("INSERT INTO deal_states(session_id,stage,tracking_no,updated_at) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET stage=excluded.stage,tracking_no=excluded.tracking_no,updated_at=excluded.updated_at")
        .run(sessionId, state.stage, state.trackingNo, now());
      return state;
    });
  }

  private mapMessage = (r: Row): MessageRecord => ({
    id: String(r.id), sessionId: String(r.session_id), sequence: Number(r.sequence), actor: r.actor as ChatActor,
    senderId: r.sender_id ? String(r.sender_id) : null, content: String(r.content),
    contentType: (r.content_type as MessageContentType) ?? "text",
    mediaPath: r.media_path ? String(r.media_path) : null,
    imageDescription: r.image_description ? String(r.image_description) : null,
    mediaAssetId: r.media_asset_id ? String(r.media_asset_id) : null,
    createdAt: String(r.created_at),
  });
  private mapDecision = (r: Row): DecisionRecord => ({
    id: String(r.id), sessionId: String(r.session_id), messageId: String(r.message_id), intent: String(r.intent),
    confidence: Number(r.confidence), needHuman: bool(r.need_human), silentIntercept: bool(r.silent_intercept),
    boundaryDecision: String(r.boundary_decision), matchedEvidence: jsonArray(r.matched_evidence),
    toolName: r.tool_name ? String(r.tool_name) : null, toolArgs: jsonArray(r.tool_args),
    toolResult: jsonObject(r.tool_result), handoffSummary: String(r.handoff_summary), createdAt: String(r.created_at),
  });
  private mapMediaAsset = (r: Row): MediaAsset => ({
    id: String(r.id),
    messageId: r.message_id ? String(r.message_id) : null,
    kind: r.kind as MediaAsset["kind"],
    localPath: String(r.local_path),
    transcript: r.transcript ? String(r.transcript) : null,
    extracted: r.extracted ? String(r.extracted) : null,
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    needsManualConfirm: bool(r.needs_manual_confirm),
    createdAt: String(r.created_at),
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

  appendMessage(sessionId: string, actor: ChatActor, senderId: string | null, content: string, mediaPath: string | null = null): MessageRecord {
    return this.transaction(() => this.insertMessage(sessionId, actor, senderId, content, mediaPath));
  }

  setMessageImageDescription(messageId: string, description: string): void {
    this.db.prepare("UPDATE messages SET image_description=? WHERE id=?").run(description, messageId);
  }

  setMessageContent(messageId: string, content: string): void {
    this.db.prepare("UPDATE messages SET content=? WHERE id=?").run(content, messageId);
  }

  createMediaAsset(input: {
    kind: MediaAsset["kind"];
    localPath: string;
    transcript?: string | null;
    extracted?: string | null;
    confidence?: number | null;
    needsManualConfirm?: boolean;
    messageId?: string | null;
  }): MediaAsset {
    const assetId = id("A");
    const t = now();
    this.db.prepare(
      "INSERT INTO media_assets(id,message_id,kind,local_path,transcript,extracted,confidence,needs_manual_confirm,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      assetId,
      input.messageId ?? null,
      input.kind,
      input.localPath,
      input.transcript ?? null,
      input.extracted ?? null,
      input.confidence ?? null,
      input.needsManualConfirm === undefined ? 1 : input.needsManualConfirm ? 1 : 0,
      t,
    );
    return {
      id: assetId,
      messageId: input.messageId ?? null,
      kind: input.kind,
      localPath: input.localPath,
      transcript: input.transcript ?? null,
      extracted: input.extracted ?? null,
      confidence: input.confidence ?? null,
      needsManualConfirm: input.needsManualConfirm === undefined ? true : input.needsManualConfirm,
      createdAt: t,
    };
  }


  linkMediaAsset(messageId: string, assetId: string): void {
    this.db.prepare("UPDATE messages SET media_asset_id=? WHERE id=?").run(assetId, messageId);
    this.db.prepare("UPDATE media_assets SET message_id=? WHERE id=?").run(messageId, assetId);
  }

  getMediaAsset(assetId: string): MediaAsset | null {
    const row = this.db.prepare("SELECT * FROM media_assets WHERE id=?").get(assetId) as Row | undefined;
    return row ? this.mapMediaAsset(row) : null;
  }

  listMediaAssets(sessionId: string): MediaAsset[] {
    return (this.db.prepare(`
      SELECT a.*
      FROM media_assets a
      JOIN messages m ON m.id = a.message_id
      WHERE m.session_id = ?
      ORDER BY a.created_at
    `).all(sessionId) as Row[]).map(this.mapMediaAsset);
  }

  private insertMessage(sessionId: string, actor: ChatActor, senderId: string | null, content: string, mediaPath: string | null = null): MessageRecord {
    const t = now();
    const next = Number((this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 seq FROM messages WHERE session_id=?").get(sessionId) as Row).seq);
    const messageId = id("M");
    const contentType = inferMediaContentType(mediaPath);
    this.db.prepare("INSERT INTO messages(id,session_id,sequence,actor,sender_id,content,content_type,media_path,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(messageId, sessionId, next, actor, senderId, content, contentType, mediaPath, t);
    // 按接收方视角双向记账：客户发言累加客服未读，AI/人工发言累加客户未读，系统消息不计未读。
    const agentUnread = actor === "customer" ? 1 : 0;
    const customerUnread = actor === "ai" || actor === "agent" ? 1 : 0;
    this.db.prepare("UPDATE sessions SET updated_at=?, unread_count=unread_count+?, customer_unread_count=customer_unread_count+? WHERE id=?")
      .run(t, agentUnread, customerUnread, sessionId);
    this.bump("total_messages", 1, t);
    return { id: messageId, sessionId, sequence: next, actor, senderId, content, contentType, mediaPath, imageDescription: null, mediaAssetId: null, createdAt: t };
  }

  saveAutomatedDecision(sessionId: string, customerMessageId: string, customerContent: string, decision: AutomatedDecisionInput) {
    return this.transaction(() => {
      const t = now();
      const { customer, ticket } = this.insertDecisionAndTicket(sessionId, customerMessageId, customerContent, decision, t);
      const replySegments = (Array.isArray(decision.reply) ? decision.reply : [decision.reply]).filter((item): item is string => Boolean(item));
      const replyMessages = !decision.silentIntercept
        ? replySegments.map((segment) => this.insertMessage(sessionId, "ai", null, segment))
        : [];
      if (replyMessages.length) this.bump("ai_replies", replyMessages.length, t);
      const reply = replyMessages.length ? replyMessages[replyMessages.length - 1] : null;
      return { customer, reply, ticket };
    });
  }

  // 只落决策与工单、不写 AI 回复消息：供“分段间隔发送”流程在首条消息前记录本轮决策。
  recordAutomatedDecision(sessionId: string, customerMessageId: string, customerContent: string, decision: AutomatedDecisionInput) {
    return this.transaction(() => {
      const t = now();
      return this.insertDecisionAndTicket(sessionId, customerMessageId, customerContent, decision, t);
    });
  }

  countAiReply(segmentCount: number) {
    if (segmentCount > 0) this.bump("ai_replies", segmentCount, now());
  }

  private insertDecisionAndTicket(
    sessionId: string,
    customerMessageId: string,
    customerContent: string,
    decision: AutomatedDecisionInput,
    t: string,
  ): { customer: MessageRecord; ticket: HandoffTicketRecord | null } {
    const customerRow = this.db.prepare(
      "SELECT * FROM messages WHERE id=? AND session_id=? AND actor='customer'",
    ).get(customerMessageId, sessionId) as Row | undefined;
    if (!customerRow) throw new Error("客户消息不存在");
    const customer = this.mapMessage(customerRow);
    const decisionId = id("D");
    this.db.prepare(`INSERT INTO decisions(id,session_id,message_id,intent,confidence,need_human,silent_intercept,boundary_decision,matched_evidence,tool_name,tool_args,tool_result,handoff_summary,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      decisionId, sessionId, customer.id, decision.intent, decision.confidence, decision.needHuman ? 1 : 0,
      decision.silentIntercept ? 1 : 0, decision.boundaryDecision, JSON.stringify(decision.matchedEvidence),
      decision.toolName, JSON.stringify(decision.toolArgs ?? []), decision.toolResult ? JSON.stringify(decision.toolResult) : null,
      decision.handoffSummary, t,
    );
    let ticket: HandoffTicketRecord | null = null;
    if (decision.needHuman) {
      const ticketId = id("T");
      this.db.prepare("INSERT INTO handoff_tickets(id,session_id,status,trigger_type,summary,assigned_agent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .run(ticketId, sessionId, "pending", decision.handoffTriggerType || "知识盲区", decision.handoffSummary || customerContent, null, t, t);
      ticket = { id: ticketId, sessionId, status: "pending", triggerType: decision.handoffTriggerType || "知识盲区", summary: decision.handoffSummary || customerContent, assignedAgentId: null, createdAt: t, updatedAt: t };
      this.bump("handoffs", 1, t);
    }
    return { customer, ticket };
  }

  // 工单状态机：pending --take_over--> in_progress --resolve--> resolved。
  // 重复提交同一动作按幂等处理，跨状态提交返回冲突原因，避免已解决工单把人工会话打回。
  updateTicket(ticketId: string, action: "take_over" | "resolve", agentId: string): TicketUpdateResult {
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM handoff_tickets WHERE id=?").get(ticketId) as Row | undefined;
      if (!existing) return { ok: false as const, reason: "not_found" as const };
      const status = existing.status as TicketStatus;
      const sessionId = String(existing.session_id);
      const t = now();
      if (action === "take_over") {
        if (status === "in_progress") return { ok: true as const, ticket: this.readTicket(ticketId) };
        if (status !== "pending") return { ok: false as const, reason: "invalid_transition" as const, message: "工单已解决，无法再次接管" };
        const agentName = this.getUserName(agentId);
        this.db.prepare("UPDATE handoff_tickets SET status='in_progress',assigned_agent_id=?,updated_at=? WHERE id=?").run(agentId, t, ticketId);
        this.db.prepare("UPDATE sessions SET status='human_serving',assigned_agent_id=?,updated_at=? WHERE id=?").run(agentId, t, sessionId);
        this.insertMessage(sessionId, "system", null, `人工客服${agentName}已接入会话`);
        return { ok: true as const, ticket: this.readTicket(ticketId) };
      }
      if (status === "resolved") return { ok: true as const, ticket: this.readTicket(ticketId) };
      if (status !== "in_progress") return { ok: false as const, reason: "invalid_transition" as const, message: "工单尚未被接管，无法解决" };
      this.db.prepare("UPDATE handoff_tickets SET status='resolved',updated_at=? WHERE id=?").run(t, ticketId);
      const sessionStatus = this.db.prepare("SELECT status FROM sessions WHERE id=?").get(sessionId) as Row | undefined;
      if (sessionStatus?.status === "human_serving") {
        this.db.prepare("UPDATE sessions SET status='ai_serving',assigned_agent_id=NULL,updated_at=? WHERE id=?").run(t, sessionId);
        this.insertMessage(sessionId, "system", null, "人工服务已结束，智能助手恢复服务");
      }
      return { ok: true as const, ticket: this.readTicket(ticketId) };
    });
  }

  resolveActiveTicketAfterReply(sessionId: string, agentId: string): HandoffTicketRecord | null {
    const row = this.db.prepare("SELECT id FROM handoff_tickets WHERE session_id=? AND status='in_progress' ORDER BY created_at DESC LIMIT 1").get(sessionId) as Row | undefined;
    if (!row) return null;
    const result = this.updateTicket(String(row.id), "resolve", agentId);
    return result.ok ? result.ticket : null;
  }

  private readTicket(ticketId: string): HandoffTicketRecord {
    return this.mapTicket(this.db.prepare("SELECT * FROM handoff_tickets WHERE id=?").get(ticketId) as Row);
  }

  private getUserName(userId: string): string {
    const row = this.db.prepare("SELECT name FROM users WHERE id=?").get(userId) as Row | undefined;
    return row ? String(row.name) : "客服";
  }

  reset() {
    this.transaction(() => {
      this.db.exec("DELETE FROM decisions; DELETE FROM handoff_tickets; DELETE FROM messages; DELETE FROM deal_states; DELETE FROM sessions; DELETE FROM metrics;");
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

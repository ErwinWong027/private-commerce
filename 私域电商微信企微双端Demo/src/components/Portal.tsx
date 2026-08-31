"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ConversationDetail, ConversationSummary, DealAdvanceAction, PortalRole, UserRecord } from "@/types";
import { DEAL_ACTIONS, DEAL_STAGE_LABELS } from "@/types";

const STATUS = { ai_serving: "AI 服务中", human_serving: "人工服务中", closed: "已关闭" };

// 演示身份令牌通过自定义请求头回传：客户端与客服端同域并排打开时，
// Cookie 会互相覆盖导致无法同时保持两种身份，因此改用 localStorage + 请求头。
const IDENTITY_HEADER = "X-Demo-Identity";

export default function Portal({ role }: { role: PortalRole }) {
  const storageKey = `presales-demo-login-${role}`;
  const [user, setUser] = useState<UserRecord | null>(null);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [activeId, setActiveId] = useState("S-001");
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = useCallback((extra: Record<string, string> = {}) => ({ ...extra, [IDENTITY_HEADER]: token }), [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const listResponse = await fetch("/api/conversations", { cache: "no-store", headers: authHeaders() });
      const list = await listResponse.json() as { conversations: ConversationSummary[] };
      setConversations(list.conversations);
      const targetId = activeId || list.conversations[0]?.id;
      if (targetId) {
        const detailResponse = await fetch(`/api/conversations/${targetId}`, { cache: "no-store", headers: authHeaders() });
        if (detailResponse.ok) {
          const detail = await detailResponse.json() as { conversation: ConversationDetail };
          setConversation(detail.conversation);
          // GET 详情已改为纯只读，未读清零必须显式调用。
          await fetch(`/api/conversations/${targetId}/read`, { method: "POST", headers: authHeaders() });
        }
      }
    } catch { setNotice("同步暂时失败，将自动重试"); }
  }, [activeId, authHeaders, token]);

  useEffect(() => {
    const hydrate = () => {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { user?: UserRecord; token?: string };
          if (parsed.user && parsed.token) { setUser(parsed.user); setToken(parsed.token); }
          else localStorage.removeItem(storageKey);
        } catch { localStorage.removeItem(storageKey); }
      }
      setReady(true);
    };
    queueMicrotask(hydrate);
  }, [storageKey]);

  useEffect(() => {
    if (!user) return;
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 1000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [user, refresh]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversation?.messages.length]);

  async function login() {
    setBusy(true);
    const response = await fetch("/api/auth/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    const payload = await response.json() as { user?: UserRecord; token?: string; error?: string };
    setBusy(false);
    if (!response.ok || !payload.user || !payload.token) return setNotice(payload.error || "登录失败");
    localStorage.setItem(storageKey, JSON.stringify({ user: payload.user, token: payload.token }));
    setUser(payload.user);
    setToken(payload.token);
  }

  async function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true); setNotice("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/uploads", { method: "POST", headers: authHeaders(), body: form });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) setNotice(payload.error || "图片上传失败");
      else setPendingImage(payload.url);
    } catch { setNotice("图片上传失败"); }
    setBusy(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!text.trim() && !pendingImage) || !conversation || busy) return;
    const outgoing = text.trim();
    const outgoingImage = pendingImage;
    setBusy(true); setNotice("");
    if (role === "customer") {
      const optimisticId = `optimistic-${Date.now()}`;
      setConversation((current) => current ? {
        ...current,
        messages: [...current.messages, {
          id: optimisticId,
          sessionId: current.id,
          sequence: (current.messages[current.messages.length - 1]?.sequence ?? 0) + 1,
          actor: "customer",
          senderId: user?.id ?? null,
          content: outgoing,
          contentType: outgoingImage ? "image" : "text",
          mediaPath: outgoingImage,
          imageDescription: null,
          createdAt: new Date().toISOString(),
        }],
      } : current);
      setText("");
      setPendingImage(null);
    }
    const endpoint = role === "customer" ? "/api/chat" : "/api/agent/reply";
    const response = await fetch(endpoint, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ sessionId: conversation.id, message: outgoing, mediaUrl: outgoingImage ?? undefined }) });
    const payload = await response.json() as { error?: string };
    if (response.ok) setText(""); else setNotice(payload.error || "发送失败");
    setBusy(false);
    await refresh();
  }

  async function handoff(ticketId: string, action: "take_over" | "resolve") {
    setBusy(true);
    const response = await fetch("/api/handoff", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ ticketId, action }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) setNotice(payload.error || "操作失败");
    setBusy(false); await refresh();
  }

  async function advanceDeal(action: DealAdvanceAction) {
    if (!conversation) return;
    setBusy(true); setNotice("");
    const response = await fetch("/api/deal/advance", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ sessionId: conversation.id, action }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) setNotice(payload.error || "推进失败");
    setBusy(false); await refresh();
  }

  async function reset() {
    if (!window.confirm("确定恢复到初始演示数据吗？")) return;
    const response = await fetch("/api/reset", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ confirm: "RESET_DEMO" }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setNotice(payload.error || "重置失败");
      return;
    }
    setNotice("Demo 已重置"); await refresh();
  }

  if (!ready) return null;
  return (
    <main className={`portal ${role}`}>
      <header className="topbar">
        <div className="brand"><span className="brandMark">私</span><div><b>私域售前协同</b><small>双端界面演示 · 非官方客户端</small></div></div>
        <nav><Link className={role === "customer" ? "active" : ""} href="/customer">客户微信</Link><Link className={role === "agent" ? "active" : ""} href="/agent">客服企业微信</Link></nav>
        <div className="topUser">{user ? <>{user.role === "customer" ? <Image className="avatar customerPhoto" src="/avatars/lin.png" alt="林女士" width={30} height={30} /> : <span className="avatar">{user.avatar}</span>}<span>{user.name}</span></> : <span>演示环境</span>}</div>
      </header>
      {!user ? <Login role={role} busy={busy} login={login} notice={notice} /> : (
        <section className="workspace">
          <aside className="rail">
            {user.role === "customer" ? <Image className="railAvatar customerPhoto" src="/avatars/lin.png" alt="林女士" width={38} height={38} /> : <span className="railAvatar">{user.avatar}</span>}<span>◉</span><span>▣</span><span>⌁</span><span className="railBottom">⚙</span>
          </aside>
          <aside className="conversationList">
            <div className="search">⌕ 搜索</div>
            <h2>{role === "customer" ? "聊天" : "客户会话"} <small>{conversations.length}</small></h2>
            {conversations.map((item) => <button key={item.id} className={conversation?.id === item.id ? "conversation active" : "conversation"} onClick={() => { setPendingImage(null); setActiveId(item.id); }}>
              {role === "customer" ? <span className="contactAvatar">禾</span> : <Image className="contactAvatar customerPhoto" src="/avatars/lin.png" alt="林女士" width={42} height={42} />}<span className="contactText"><b>{role === "customer" ? "小禾健康顾问" : item.customerName}</b><small>{role === "customer" ? "为您提供商品、价格与物流咨询" : item.lastMessage}</small></span>
              <span className="meta"><time>{formatTime(item.lastMessageAt)}</time>{item.unreadCount > 0 && <i>{item.unreadCount}</i>}</span>
            </button>)}
          </aside>
          <section className="chat">
            <div className="chatHeader"><div><h1>{role === "customer" ? "小禾健康顾问" : conversation?.customerName || "客户会话"}</h1>{role === "customer" && busy && <span className="typingIndicator">正在输入…</span>}{role === "agent" && <span className={`status ${conversation?.status}`}>{conversation ? STATUS[conversation.status] : "连接中"}</span>}</div><button title="更多">•••</button></div>
            <div className="messages">
              {conversation?.messages.map((message) => message.actor === "system" ? role === "agent" && <div className="systemMessage" key={message.id}>{message.content}</div> : (
                <div key={message.id} className={`message ${message.actor === "customer" ? "fromCustomer" : "fromService"}`}>
                  {message.actor === "customer" ? <Image className="messageAvatar customerPhoto" src="/avatars/lin.png" alt="林女士" width={36} height={36} /> : <span className="messageAvatar">{role === "customer" ? "禾" : message.actor === "agent" ? "禾" : "AI"}</span>}
                  <div><label>{message.actor === "customer" ? "林女士" : role === "customer" ? "小禾健康顾问" : message.actor === "agent" ? "人工客服 · 小禾" : "智能助手"}</label>{message.contentType === "image" && message.mediaPath && <Image src={message.mediaPath} alt="图片消息" width={240} height={240} className="messageImage" unoptimized={message.mediaPath.startsWith("/api/media/")} />}{message.imageDescription && <small className="imageDescription">图片识别:{message.imageDescription}</small>}{message.content && <p>{message.content}</p>}<time>{formatTime(message.createdAt)}</time></div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={submit}>
              <div className="tools"><span>☺</span><button type="button" className="toolImageBtn" title="发送图片" disabled={role === "agent" && conversation?.status !== "human_serving"} onClick={() => fileInputRef.current?.click()}>📷</button><span>⌘</span></div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={pickImage} />
              {pendingImage && <div className="imagePreview"><Image src={pendingImage} alt="待发送图片" width={72} height={72} unoptimized /><button type="button" title="移除图片" onClick={() => setPendingImage(null)}>×</button></div>}
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={role === "agent" && conversation?.status !== "human_serving" ? "接管会话后可人工回复" : "输入消息，Enter 发送"} disabled={role === "agent" && conversation?.status !== "human_serving"} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              {notice && <div className="notice">{notice}</div>}<button disabled={busy || (!text.trim() && !pendingImage)}>发送</button>
            </form>
          </section>
          {role === "agent" && <AgentPanel conversation={conversation} busy={busy} handoff={handoff} advanceDeal={advanceDeal} reset={reset} />}
        </section>
      )}
    </main>
  );
}

function Login({ role, busy, login, notice }: { role: PortalRole; busy: boolean; login: () => void; notice: string }) {
  return <section className={`login ${role}`}>
    <div className="loginCard">
      <div className="loginIcon">{role === "customer" ? "●●" : "企"}</div>
      <h1>{role === "customer" ? "微信扫码登录" : "企业微信扫码登录"}</h1>
      <p>{role === "customer" ? "使用手机微信扫码，在手机上确认登录" : "请使用企业微信扫码，确认组织身份后登录"}</p>
      <div className="qr" aria-label="模拟二维码">{Array.from({ length: 121 }, (_, index) => <i key={index} className={(index * 7 + Math.floor(index / 11) * 3) % 5 < 2 ? "on" : ""} />)}<span>{role === "customer" ? "微" : "企"}</span></div>
      <button onClick={login} disabled={busy}>{busy ? "确认中…" : "模拟扫码并登录"}</button>
      <small>界面演示 / 模拟扫码登录，不连接微信或企业微信账号</small>
      {notice && <div className="notice">{notice}</div>}
    </div>
  </section>;
}

function AgentPanel({ conversation, busy, handoff, advanceDeal, reset }: { conversation: ConversationDetail | null; busy: boolean; handoff: (id: string, action: "take_over" | "resolve") => void; advanceDeal: (action: DealAdvanceAction) => void; reset: () => void }) {
  const decision = conversation?.decisions[0];
  const dealState = conversation?.dealState;
  const nextAction = dealState ? DEAL_ACTIONS.find((item) => item.from === dealState.stage) : undefined;
  return <aside className="inspector">
    <section><h3>客户资料</h3><div className="profile"><Image className="contactAvatar customerPhoto" src="/avatars/lin.png" alt="林女士" width={42} height={42} /><div><b>{conversation?.customer.name || "林女士"}</b><small>微信客户 · 私域咨询</small></div></div><dl><dt>客户 ID</dt><dd>{conversation?.customerId}</dd><dt>当前状态</dt><dd>{conversation ? STATUS[conversation.status] : "-"}</dd></dl></section>
    <section className="deal"><h3>当前成交进度</h3>{dealState ? <><div className="decisionTop"><strong>{DEAL_STAGE_LABELS[dealState.stage]}</strong>{dealState.trackingNo && <em>{dealState.trackingNo}</em>}</div><div className="dealActions">{DEAL_ACTIONS.map((item) => <button key={item.action} disabled={busy || item.from !== dealState.stage} onClick={() => advanceDeal(item.action)}>{item.label}</button>)}</div><small>{nextAction ? `下一步：${nextAction.label}` : "已到运输中，演示流程完成"}</small></> : <p className="empty">加载中</p>}</section>
    <section><h3>最新 AI 决策摘要</h3>{decision ? <><div className="decisionTop"><strong>{decision.intent}</strong><em>{Math.round(decision.confidence * 100)}%</em></div><p>{decision.boundaryDecision}</p><div className="tags">{decision.matchedEvidence.map((tag) => <span key={tag}>{tag}</span>)}</div><small>工具：{decision.toolName || "无"}</small></> : <p className="empty">等待客户新消息</p>}</section>
    <section className="tickets"><h3>转人工工单</h3>{conversation?.tickets.length ? conversation.tickets.map((ticket) => <article key={ticket.id}><div><b>{ticket.triggerType}</b><i className={ticket.status}>{ticket.status === "pending" ? "待接管" : ticket.status === "in_progress" ? "处理中" : "已解决"}</i></div><p>{ticket.summary}</p>{ticket.status === "pending" && <button disabled={busy} onClick={() => handoff(ticket.id, "take_over")}>接管会话</button>}{ticket.status === "in_progress" && <button disabled={busy} onClick={() => handoff(ticket.id, "resolve")}>解决并恢复 AI</button>}</article>) : <p className="empty">暂无工单</p>}</section>
    <button className="reset" onClick={reset}>重置 Demo</button>
  </aside>;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

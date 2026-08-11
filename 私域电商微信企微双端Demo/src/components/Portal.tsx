"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ConversationDetail, ConversationSummary, PortalRole, UserRecord } from "@/types";

const STATUS = { ai_serving: "AI 服务中", human_serving: "人工服务中", closed: "已关闭" };

export default function Portal({ role }: { role: PortalRole }) {
  const storageKey = `presales-demo-login-${role}`;
  const [user, setUser] = useState<UserRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [activeId, setActiveId] = useState("S-001");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const listResponse = await fetch("/api/conversations", { cache: "no-store" });
      const list = await listResponse.json() as { conversations: ConversationSummary[] };
      setConversations(list.conversations);
      const targetId = activeId || list.conversations[0]?.id;
      if (targetId) {
        const detailResponse = await fetch(`/api/conversations/${targetId}?role=${role}`, { cache: "no-store" });
        if (detailResponse.ok) {
          const detail = await detailResponse.json() as { conversation: ConversationDetail };
          setConversation(detail.conversation);
        }
      }
    } catch { setNotice("同步暂时失败，将自动重试"); }
  }, [activeId, role]);

  useEffect(() => {
    const hydrate = () => {
      const stored = localStorage.getItem(storageKey);
      if (stored) { try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem(storageKey); } }
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
    const payload = await response.json() as { user?: UserRecord; error?: string };
    setBusy(false);
    if (!response.ok || !payload.user) return setNotice(payload.error || "登录失败");
    localStorage.setItem(storageKey, JSON.stringify(payload.user));
    setUser(payload.user);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || !conversation || busy) return;
    const outgoing = text.trim();
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
          createdAt: new Date().toISOString(),
        }],
      } : current);
      setText("");
    }
    const endpoint = role === "customer" ? "/api/chat" : "/api/agent/reply";
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: conversation.id, message: outgoing }) });
    const payload = await response.json() as { error?: string };
    if (response.ok) setText(""); else setNotice(payload.error || "发送失败");
    setBusy(false);
    await refresh();
  }

  async function handoff(ticketId: string, action: "take_over" | "resolve") {
    setBusy(true);
    const response = await fetch("/api/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, action }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) setNotice(payload.error || "操作失败");
    setBusy(false); await refresh();
  }

  async function reset() {
    if (!window.confirm("确定恢复到初始演示数据吗？")) return;
    await fetch("/api/reset", { method: "POST" }); setNotice("Demo 已重置"); await refresh();
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
            {conversations.map((item) => <button key={item.id} className={conversation?.id === item.id ? "conversation active" : "conversation"} onClick={() => setActiveId(item.id)}>
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
                  <div><label>{message.actor === "customer" ? "林女士" : role === "customer" ? "小禾健康顾问" : message.actor === "agent" ? "人工客服 · 小禾" : "智能助手"}</label><p>{message.content}</p><time>{formatTime(message.createdAt)}</time></div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={submit}>
              <div className="tools">☺　▧　⌘</div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={role === "agent" && conversation?.status !== "human_serving" ? "接管会话后可人工回复" : "输入消息，Enter 发送"} disabled={role === "agent" && conversation?.status !== "human_serving"} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              {notice && <div className="notice">{notice}</div>}<button disabled={busy || !text.trim()}>发送</button>
            </form>
          </section>
          {role === "agent" && <AgentPanel conversation={conversation} busy={busy} handoff={handoff} reset={reset} />}
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

function AgentPanel({ conversation, busy, handoff, reset }: { conversation: ConversationDetail | null; busy: boolean; handoff: (id: string, action: "take_over" | "resolve") => void; reset: () => void }) {
  const decision = conversation?.decisions[0];
  return <aside className="inspector">
    <section><h3>客户资料</h3><div className="profile"><Image className="contactAvatar customerPhoto" src="/avatars/lin.png" alt="林女士" width={42} height={42} /><div><b>{conversation?.customer.name || "林女士"}</b><small>微信客户 · 私域咨询</small></div></div><dl><dt>客户 ID</dt><dd>{conversation?.customerId}</dd><dt>当前状态</dt><dd>{conversation ? STATUS[conversation.status] : "-"}</dd></dl></section>
    <section><h3>最新 AI 决策摘要</h3>{decision ? <><div className="decisionTop"><strong>{decision.intent}</strong><em>{Math.round(decision.confidence * 100)}%</em></div><p>{decision.boundaryDecision}</p><div className="tags">{decision.matchedEvidence.map((tag) => <span key={tag}>{tag}</span>)}</div><small>工具：{decision.toolName || "无"}</small></> : <p className="empty">等待客户新消息</p>}</section>
    <section className="tickets"><h3>转人工工单</h3>{conversation?.tickets.length ? conversation.tickets.map((ticket) => <article key={ticket.id}><div><b>{ticket.triggerType}</b><i className={ticket.status}>{ticket.status === "pending" ? "待接管" : ticket.status === "in_progress" ? "处理中" : "已解决"}</i></div><p>{ticket.summary}</p>{ticket.status === "pending" && <button disabled={busy} onClick={() => handoff(ticket.id, "take_over")}>接管会话</button>}{ticket.status === "in_progress" && <button disabled={busy} onClick={() => handoff(ticket.id, "resolve")}>解决并恢复 AI</button>}</article>) : <p className="empty">暂无工单</p>}</section>
    <button className="reset" onClick={reset}>重置 Demo</button>
  </aside>;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

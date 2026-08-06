"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { DecisionPanel } from "@/components/DecisionPanel";
import { DemoChatMessage, PresalesChatPanel } from "@/components/PresalesChatPanel";
import { PresalesDashboard } from "@/components/PresalesDashboard";
import { TestSuitePanel } from "@/components/TestSuitePanel";
import { presalesKnowledgeBase } from "@/lib/presalesKnowledge";
import { HandoffTicketRecord, PresalesDashboardState, PresalesDecision } from "@/types";

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

interface TestResult {
  id: string;
  scenario: string;
  passed: boolean;
  intent: string;
  needHuman: boolean;
}

export default function Home() {
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStatusLabel, setChatStatusLabel] = useState("已就绪");
  const [chatError, setChatError] = useState("");
  const [runningTests, setRunningTests] = useState(false);
  const [messages, setMessages] = useState<DemoChatMessage[]>([
    {
      id: "init",
      sender: "assistant",
      text: presalesKnowledgeBase.welcomeTemplate,
    },
  ]);
  const [decision, setDecision] = useState<PresalesDecision | null>(null);
  const [dashboard, setDashboard] = useState<PresalesDashboardState | null>(null);
  const [testSummary, setTestSummary] = useState<TestSummary | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const history = useMemo(
    () =>
      messages
        .filter((item) => item.sender !== "system")
        .map((item) => ({
          role: item.sender === "user" ? "user" : "assistant",
          content: item.text,
        })),
    [messages],
  );

  useEffect(() => {
    void refreshDashboard();
  }, []);

  async function refreshDashboard(): Promise<void> {
    const response = await fetch("/api/presales/state");
    const payload = await response.json();
    if (payload.success) {
      setDashboard(payload.data);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitMessage(chatInput.trim());
  }

  async function handleRunTests(): Promise<void> {
    setRunningTests(true);
    try {
      const response = await fetch("/api/test/run", { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.message ?? "测试执行失败");
      }
      setTestSummary(payload.summary);
      setTestResults(payload.results);
    } finally {
      setRunningTests(false);
    }
  }

  async function handleResetDemo(): Promise<void> {
    await fetch("/api/presales/reset", { method: "POST" });
    setDecision(null);
    setTestSummary(null);
    setTestResults([]);
    setChatError("");
    setChatStatusLabel("已就绪");
    setMessages([
      {
        id: "init",
        sender: "assistant",
        text: presalesKnowledgeBase.welcomeTemplate,
      },
    ]);
    await refreshDashboard();
  }

  async function handleQuickQuestion(text: string): Promise<void> {
    await submitMessage(text);
  }

  async function handleHandoff(ticket: HandoffTicketRecord, status: "taken_over" | "resolved"): Promise<void> {
    const response = await fetch("/api/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ticket.id, status }),
    });
    const payload = await response.json();
    if (payload.success) {
      setDashboard(payload.dashboard);
    }
  }

  async function submitMessage(content: string): Promise<void> {
    if (!content) {
      return;
    }

    const nextMessages = [...messages, createChatMessage("user", content)];
    const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const placeholderMessage: DemoChatMessage = {
      id: assistantMessageId,
      sender: "assistant",
      text: "专属顾问正在整理回复...",
    };
    setMessages([...nextMessages, placeholderMessage]);
    setChatInput("");
    setChatLoading(true);
    setChatError("");
    setChatStatusLabel("规则分析中");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history,
          sourceChannel: "抖音投流加粉",
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.message ?? "发送失败");
      }

      setDecision(payload.decision);
      setDashboard(payload.dashboard);
      if (payload.decision.silentIntercept) {
        setMessages((current) => current.filter((item) => item.id !== assistantMessageId));
        setChatStatusLabel("已进入人工处理队列");
      } else {
        replaceMessageText(assistantMessageId, payload.decision.reply as string, setMessages);
        setChatStatusLabel("已就绪");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "消息发送失败";
      setChatError(message);
      setMessages((current) => current.filter((item) => item.id !== assistantMessageId));
      setMessages((current) => [...current, createChatMessage("system", `系统提示：${message}`)]);
      setChatStatusLabel("处理失败");
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="demo-shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">保健品咨询</p>
          <h1>私域电商售前客服演示中心</h1>
          <p className="hero-copy">
            围绕版本咨询、价格说明、正品验真、风险咨询、物流支付等核心售前场景进行演示。
            高风险问题先补充关键信息，命中规则后再给说明；仍未命中时再进入人工转接工单。
          </p>
        </div>
        <div className="hero-actions">
          <Link className="secondary-button" href="/doc/overview">
            文档中心
          </Link>
          <button className="secondary-button" type="button" onClick={handleResetDemo}>
            重置演示状态
          </button>
          <button className="primary-button" type="button" onClick={handleRunTests} disabled={runningTests}>
            {runningTests ? "测试执行中..." : "一键回归 31 条用例"}
          </button>
        </div>
      </section>

      <section id="demo-workbench" className="content-grid">
        <div className="left-column">
          <PresalesChatPanel
            messages={messages}
            chatInput={chatInput}
            chatLoading={chatLoading}
            chatStatusLabel={chatStatusLabel}
            chatHelperText="围绕版本、价格、正品、风险、物流与付款等问题进行一对一咨询。"
            chatError={chatError}
            quickQuestions={dashboard?.quickQuestions ?? []}
            onInputChange={setChatInput}
            onSubmit={handleSendMessage}
            onQuickQuestion={handleQuickQuestion}
          />
          <DecisionPanel decision={decision} />
        </div>

        <div id="operations-panel" className="right-column">
          <PresalesDashboard
            dashboard={dashboard}
            onTakeover={handleHandoff}
          />
          <div id="test-suite">
            <TestSuitePanel summary={testSummary} results={testResults} running={runningTests} onRun={handleRunTests} />
          </div>
        </div>
      </section>
    </main>
  );
}

function createChatMessage(sender: DemoChatMessage["sender"], text: string): DemoChatMessage {
  return {
    id: `${sender}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    sender,
    text,
  };
}

function replaceMessageText(
  targetId: string,
  text: string,
  setMessages: Dispatch<SetStateAction<DemoChatMessage[]>>,
): void {
  setMessages((current) => current.map((item) => (item.id === targetId ? { ...item, text } : item)));
}

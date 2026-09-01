"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DocRenderer from "./DocRenderer";
import { TestSuitePanel } from "./TestSuitePanel";
import { ToastBanner, type ToastTone } from "./ToastBanner";
import styles from "./agentic.module.css";
import type {
  PresalesTestCaseResult,
  PresalesTestSummary,
} from "@/types";

type DocTab = {
  slug: string;
  title: string;
  description: string;
  docStyles: string;
  body: string;
  hasMermaid: boolean;
};

interface AgenticWorkspaceProps {
  docs: DocTab[];
}

export default function AgenticWorkspace({ docs }: AgenticWorkspaceProps) {
  const [testSummary, setTestSummary] = useState<PresalesTestSummary | null>(null);
  const [testResults, setTestResults] = useState<PresalesTestCaseResult[]>([]);
  const [runningTests, setRunningTests] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const pathname = usePathname();
  const activeDoc = useMemo(() => {
    const routeSlug = pathname.split("/").filter(Boolean).at(-1) ?? "";
    return docs.some((doc) => doc.slug === routeSlug) ? routeSlug : docs[0]?.slug ?? "";
  }, [docs, pathname]);
  const navItems = useMemo(() => docs.slice(0, 5), [docs]);
  const activeDocItem = useMemo(() => docs.find((doc) => doc.slug === activeDoc) ?? docs[0] ?? null, [activeDoc, docs]);
  const showTestSuite = activeDoc === "acceptance-matrix";

  async function runTests(): Promise<void> {
    setRunningTests(true);
    try {
      const loginResponse = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "agent" }),
      });
      const loginPayload = await loginResponse.json();
      if (!loginResponse.ok) {
        throw new Error(loginPayload.error ?? "登录失败");
      }

      const response = await fetch("/api/test/run", {
        method: "POST",
        headers: { "X-Demo-Identity": loginPayload.token },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "测试执行失败");
      }
      setTestSummary(payload.summary);
      setTestResults(payload.results);
      pushToast("success", `测试完成：${payload.summary.passed}/${payload.summary.total}`);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "测试执行失败");
    } finally {
      setRunningTests(false);
    }
  }

  function pushToast(tone: ToastTone, message: string): void {
    setToast({ tone, message });
  }

  return (
    <main className={styles.container}>
      {toast ? <ToastBanner tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} /> : null}

      <section className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>文档中心</p>
          <h1>售前客服文档中心</h1>
          <p className={styles.subtitle}>集中查看业务本体、验收矩阵、部署说明与测试套件，并在验收矩阵文档页执行自动化验证。</p>
        </div>
      </section>

      <section className={styles.panelCard + " " + styles.docSection}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>文档导航</p>
            <h2>本体设计 · 验收矩阵 · 用例集</h2>
            <p className={styles.helperCopy}>自动化验证仅在验收矩阵文档页内展示。</p>
          </div>
        </div>

        <div className={styles.tabBar}>
          {navItems.map((doc) => (
            <Link
              key={doc.slug}
              href={`/agentic/${doc.slug}`}
              className={styles.tabButton}
            >
              {doc.title}
            </Link>
          ))}
        </div>

        {activeDocItem ? (
          <div>
            <p className={styles.helperCopy}>{activeDocItem.description}</p>
            <DocRenderer docStyles={activeDocItem.docStyles} body={activeDocItem.body} hasMermaid={activeDocItem.hasMermaid} />
            {showTestSuite ? <TestSuitePanel summary={testSummary} results={testResults} running={runningTests} onRun={() => void runTests()} /> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

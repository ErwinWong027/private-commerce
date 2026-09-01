import type { Metadata } from "next";
import styles from "../../components/agentic/agentic.module.css";

export const metadata: Metadata = {
  title: "售前客服文档中心 · 私域售前客服 AI",
  description: "售前客服业务文档导航、验收矩阵与测试执行入口。",
};

export default function AgenticLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.page}>{children}</div>;
}

import type { Metadata } from "next";
import styles from "./plans.module.css";

export const metadata: Metadata = {
  title: "规划路径导航 · 私域售前客服 AI",
  description: "12 项规划产物的阅读路径与逻辑链",
};

export default function PlansLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.page}>{children}</div>;
}

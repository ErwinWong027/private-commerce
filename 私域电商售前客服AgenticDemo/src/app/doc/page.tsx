import { getDocEntries } from "@/lib/docRegistry";
import Link from "next/link";
import styles from "./doc.module.css";

export default async function DocPage() {
  const entries = await getDocEntries();
  if (entries.length === 0) {
    return <div style={{ padding: 20 }}>暂无文档已注册</div>;
  }

  return (
    <section
      style={{
        padding: "8px 20px 24px",
        overflow: "auto",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(96, 120, 156, 0.12)",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 14px 40px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, color: "#5f6f8b", fontSize: 13, fontWeight: 600 }}>文档中心</p>
          <h1 style={{ margin: "8px 0 10px", fontSize: 28, color: "#12203a" }}>核心文档导航</h1>
          <p style={{ margin: 0, color: "#5f6f8b", lineHeight: 1.8 }}>
            按业务优先级整理总览、验收、部署、本体与测试相关文档，直接从这里进入对应内容。
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {entries.map((entry, index) => (
            <article
              key={entry.slug}
              style={{
                border: "1px solid rgba(96, 120, 156, 0.14)",
                borderRadius: 18,
                padding: 18,
                background: "#fff",
              }}
            >
              <p style={{ margin: 0, color: "#214fda", fontSize: 13, fontWeight: 700 }}>0{index + 1}</p>
              <h2 style={{ margin: "10px 0 8px", fontSize: 20, color: "#12203a" }}>{entry.title}</h2>
              <p style={{ margin: "0 0 14px", color: "#5f6f8b", lineHeight: 1.8 }}>{entry.description}</p>
              <Link href={`/doc/${entry.slug}`} className={styles.backButton}>
                查看文档
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import styles from "./home.module.css";

export default function Home() {
  return (
    <div className={styles.landing}>
      <div className={styles.inner}>
        <h1 className={styles.title}>保健品私域电商售前客服 AI · 演示入口</h1>
        <p className={styles.lead}>
          左侧是规划路径：从业务现状到产品画布的 12 项交付物，说明「为什么做、做哪一段」。
          右侧是售前客服文档中心：集中呈现业务设计、验收标准与测试执行，说明「如何设计、如何验收」。
        </p>

        <div className={styles.entryGrid}>
          <Link className={styles.entryCard} href="/plans">
            <span className={`${styles.entryTag} ${styles.tagPlans}`}>入口一 · 规划</span>
            <h2>12 项规划路径导航</h2>
            <p>
              业务现状分析、OSM 战略地图、业务流程、服务蓝图、AI 机会场景地图、优先级矩阵、里程碑计划、产品画布，
              以及数据清单、业务本体设计、测试用例集、问答 Demo 四份附录。每项含 HTML 报告与 YAML 源。
            </p>
            <span className={styles.entryMeta}>22 个静态产物 · 阅读逻辑链 ①→⑧</span>
            <span className={styles.entryCta}>查看规划 →</span>
          </Link>

          <Link className={styles.entryCard} href="/agentic">
            <span className={`${styles.entryTag} ${styles.tagAgentic}`}>入口二 · 可运行</span>
            <h2>售前客服文档中心</h2>
            <p>
              集中查看售前客服 Agent 的业务本体、验收矩阵、部署说明与测试套件，保留文档导航与测试执行能力。
              自动化验证仅在验收矩阵文档页内展示。
            </p>
            <span className={styles.entryMeta}>文档导航 + 验收矩阵 + 测试执行</span>
            <span className={styles.entryCta}>进入文档中心 →</span>
          </Link>
        </div>

        <div className={styles.portalSection}>
          <h3>企微双端形态（原有入口，行为不变）</h3>
          <p>模拟客户端微信与客服端企业微信的双侧界面，用于观察同一会话在两端的呈现差异。</p>
          <div className={styles.portalRow}>
            <Link className={styles.portalLink} href="/customer">
              客户端 · 微信
            </Link>
            <Link className={`${styles.portalLink} ${styles.agentSide}`} href="/agent">
              客服端 · 企业微信
            </Link>
          </div>
        </div>

        <div className={styles.footNote}>
          演示环境说明：数据落 SQLite 本地库，图片与运单均为演示素材；价格、时效、正品凭据一律由确定性规则给出，
          不由模型自由生成。
        </div>
      </div>
    </div>
  );
}

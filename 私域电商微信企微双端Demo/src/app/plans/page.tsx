import Link from "next/link";
import styles from "./plans.module.css";

type PlanCard = {
  num: string;
  phase: string;
  level: "biz" | "proj";
  title: string;
  href: string;
  yaml?: string;
  role: string;
  takeaway: string;
  linkLabel: string;
};

const CARDS: PlanCard[] = [
  {
    num: "1",
    phase: "调研 · 事实基座",
    level: "biz",
    title: "业务现状分析（含 SWOT）",
    href: "/plans/01-业务现状分析.html",
    yaml: "/plans/01-业务现状分析.yaml",
    role: "先扫描整体业务价值链 5 环节（引流→售前→下单→履约→复购）现状与痛点，定位售前客服 critical×4 最集中，三个结构性约束是分析结论而非前提。含企微生态成熟度、FDE 接入方案、SWOT。",
    takeaway: "经 5 环节扫描 → 售前客服痛点最集中 → AI 第一切入点；北极星为业务级 LTV（非售前客服转化率）。",
    linkLabel: "打开报告",
  },
  {
    num: "2",
    phase: "战略 · NSM",
    level: "biz",
    title: "北极星 OSM 分析",
    href: "/plans/02-OSM战略地图.html",
    yaml: "/plans/02-OSM战略地图.yaml",
    role: "NSM = 私域客户 LTV（稳健增长 ≥15%）；三层拆解：获客引流效率（加粉转化 15%→25%）/ 售前转化降本（首单转化率 ≥10%、RAG 自动接待率 ≥80%）/ 复购运营增量（复购率 35%→45%）。",
    takeaway: "LTV 综合体现获客×售前×复购×合规；售前客服的 10% 首单转化率是支撑指标（守护基线），非北极星。",
    linkLabel: "打开战略地图",
  },
  {
    num: "3",
    phase: "分析 · 流程解剖",
    level: "biz",
    title: "业务流程深度分析",
    href: "/plans/03-业务流程.html",
    yaml: "/plans/03-业务流程.yaml",
    role: "整体 L1 价值流 × 5 环节（引流→售前→下单→履约→复购）× L2 流程，售前客服为 L1-2 阶段（AI 聚焦），痛点定位到流程级。",
    takeaway: "critical×4 集中在售前客服阶段；其他环节痛点为 high / medium，根因均指向知识未结构化。",
    linkLabel: "打开流程分析",
  },
  {
    num: "4",
    phase: "分析 · 触点体验",
    level: "biz",
    title: "全链路服务蓝图",
    href: "/plans/04-服务蓝图.html",
    yaml: "/plans/04-服务蓝图.yaml",
    role: "业务级 5 环节三层泳道（客户 / 前台 / 后台）：引流获客→售前客服咨询→下单支付→物流履约→复购运营，标注每个触点的认知负荷与期望落差。",
    takeaway: "售前客服环节认知负荷 critical×2（需求澄清 / 促销算账）；夜间时段整段流程无人接待；复购环节缺预测模型。",
    linkLabel: "打开蓝图",
  },
  {
    num: "5",
    phase: "分析 · 价值落点",
    level: "biz",
    title: "全链路 AI 场景地图",
    href: "/plans/05-AI机会场景地图.html",
    yaml: "/plans/05-AI机会场景地图.yaml",
    role: "业务级 5 环节 4 个独立价值 AI 机会（O1-O4）：RAG 自动接待含合规护栏 + 持续调优（O1）、支付承接（O2）、物流查询（O3）、复购预测（O4）。引流获客环节无 AI 机会。",
    takeaway: "4 个机会覆盖 LTV 全链路；价格 / 时效 / 功效三类高风险环节禁止大模型独立决策。",
    linkLabel: "打开地图",
  },
  {
    num: "6",
    phase: "分析 · 优先级排序",
    level: "biz",
    title: "全链路 AI 优先级矩阵",
    href: "/plans/06-优先级矩阵.html",
    yaml: "/plans/06-优先级矩阵.yaml",
    role: "4 个独立机会按收益（覆盖×频次×价值）÷ 成本（数据 + 设计 + 集成 + 知识）评分。O1 合并合规护栏与持续调优后成本升高（6.58），但作为核心立项须最先具备。",
    takeaway: "第一梯队 = O1 RAG 自动接待（含合规护栏同批）；O4 复购预测是 LTV 主体增量（远期）。",
    linkLabel: "打开矩阵",
  },
  {
    num: "7",
    phase: "落地 · 业务级排期",
    level: "biz",
    title: "全链路 AI 里程碑计划",
    href: "/plans/07-里程碑计划.html",
    yaml: "/plans/07-里程碑计划.yaml",
    role: "业务级整体 AI 里程碑——覆盖 5 环节 4 个机会，9 个月三阶段、6 条工作流 18 项任务。阶段一（M1-M3）售前 AI 化地基；阶段二（M4-M6）全链路扩面 + 体验提质；阶段三（M7-M9）LTV 增量。",
    takeaway: "M3 售前 AI 化地基上线 → M6 全链路扩面 → M9 复购预测 LTV 增量；被依赖者前置。",
    linkLabel: "打开甘特图",
  },
  {
    num: "8",
    phase: "项目级 · 产品落地",
    level: "proj",
    title: "售前客服 AI 助手产品画布",
    href: "/plans/08-产品画布.html",
    yaml: "/plans/08-产品画布.yaml",
    role: "项目级产品画布——从业务级⑥⑦中选取售前客服环节（O1 RAG 自动接待含合规护栏 module）展开。能完成售前转化业务闭环的最小演示产品：首响→正品→算账→转人工兜底→转化守护。",
    takeaway: "Demo 只做「接得住 + 答得准 + 算得清 + 转得顺 + 守得住」；O2/O3/O4 属其他环节不纳入。",
    linkLabel: "打开画布",
  },
  {
    num: "⊕",
    phase: "项目级附录 · 数据底稿",
    level: "proj",
    title: "政策规则数据清单",
    href: "/plans/09-政策规则数据清单.html",
    role: "售前客服 AI 助手的知识库和规则库装什么：版本包装、正品验真、16 档价格、支付发货四大口径的结构化数据包。",
    takeaway: "孟版 6 档 + 日版 6 档 + 珠峰 4 档全规格落库；浮动报价与表价冲突需上线前统一口径。",
    linkLabel: "打开数据清单",
  },
  {
    num: "⊕",
    phase: "项目级附录 · 语义结构",
    level: "proj",
    title: "业务本体设计",
    href: "/plans/10-业务本体设计.html",
    yaml: "/plans/10-业务本体设计.yaml",
    role: "售前客服 Agent 怎么稳定理解业务、安全执行动作：13 实体对象关系、13 条关系依赖、7 个行动边界、3 条执行流状态迁移，可注入 System Prompt。",
    takeaway: "价格只走规则表、凭据只来自知识库、状态推进只由确定性规则控制；转人工是设计内兜底路径。",
    linkLabel: "打开本体设计",
  },
  {
    num: "⊕",
    phase: "项目级附录 · 测试用例",
    level: "proj",
    title: "测试用例集",
    href: "/plans/11-测试用例集.html",
    yaml: "/plans/11-测试用例集.yaml",
    role: "售前客服 AI 助手的验证集：覆盖正品 / 版本 / 价格 / 促销 / 合规 / 转人工等场景，41 条用例（Golden 20 / Hard 13 / Edge 8）。",
    takeaway: "41 条用例按 Golden 49% / Hard 32% / Edge 20% 配比，保障价格、缺货、合规转人工场景的稳定表现。",
    linkLabel: "打开测试用例",
  },
  {
    num: "⊕",
    phase: "项目级附录 · 可运行交付",
    level: "proj",
    title: "售前问答 Demo（可运行）",
    href: "/agentic",
    role: "从静态问答页升级为双端可运行 agentic demo：左侧会话、右侧透明面板展示命中意图 / 置信度 / 知识证据 / 行动边界 / 是否转人工，同页内嵌本体设计与用例集。",
    takeaway: "规划 → 可运行 demo 闭环入口；静态版仍保留在 /plans/12-售前问答Demo.html 作为备份。",
    linkLabel: "进入可运行 Demo",
  },
];

const CHAIN = [
  { level: "biz", title: "① 业务现状分析", desc: "5 环节扫描 → 售前最痛 → 三约束是结论非前提" },
  { level: "biz", title: "② 北极星 OSM", desc: "NSM=LTV≥15%，三层拆解：获客 / 售前 / 复购" },
  { level: "biz", title: "③ 业务流程", desc: "5 环节 L1 价值流解剖到 L2 级，痛点长在哪个节点" },
  { level: "biz", title: "④ 服务蓝图", desc: "5 环节三层泳道：断点与认知负荷" },
  { level: "biz", title: "⑤ AI 场景地图", desc: "5 环节 4 个独立价值机会 O1-O4" },
  { level: "biz", title: "⑥ 优先级矩阵", desc: "4 个机会收益 ÷ 成本评分：先做哪个" },
  { level: "biz", title: "⑦ 里程碑计划", desc: "9 个月三阶段全链路 AI 排期" },
  { level: "proj", title: "⑧ 产品画布", desc: "选取售前客服 O1 展开为项目级 Demo" },
] as const;

export default function PlansPage() {
  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1>保健品私域电商 AI 规划 · 路径导航</h1>
          <div className={styles.subtitle}>
            100~1000 元中客单价瘦身保健品 · 抖音直播 → 企微私域 1v1 · 全链路 5 环节 4 个独立 AI 机会 · 售前客服 AI 助手项目级交付
          </div>
        </div>
        <div className={styles.genInfo}>
          <Link className={styles.backHome} href="/">
            ← 返回入口
          </Link>
          <br />
          双端集成版 · 2026-08
        </div>
      </div>

      <div className={styles.heroCard}>
        <b>一句话读懂本规划：</b>分析对象为<b>「瘦身减肥类保健品私域电商」整体业务</b>（引流→售前→下单→履约→复购），
        <b>售前客服是其中一个关键子流程（L1-2），也是 AI 赋能的第一切入点</b>。北极星指标为
        <b>业务级私域客户 LTV（稳健增长 ≥15%）</b>。步骤①-⑦为<b>业务级分析</b>，步骤⑧产品画布为<b>项目级交付</b>。
        标品信任逻辑：客户只问<b>是不是正品 / 什么版本 / 渠道可不可信</b>，功效认知已在直播间完成。
      </div>

      <div className={styles.levelBanner}>
        <b>业务级与项目级的分界：</b>业务级分析覆盖全链路 5 环节，项目级交付只聚焦售前客服环节的最小可演示闭环。
        <div className={styles.levelSplit}>
          <div className={`${styles.blk} ${styles.bizBlk}`}>
            <b>业务级（①-⑦）：</b>分析对象 = 保健品私域电商整体业务（5 环节）。④服务蓝图覆盖全链路三层泳道；⑤AI
            场景覆盖 4 个独立机会 O1-O4（引流获客环节无 AI 机会）；⑥优先级矩阵对 4 个机会打分；⑦里程碑覆盖 9 个月三阶段排期。
          </div>
          <div className={`${styles.blk} ${styles.projBlk}`}>
            <b>项目级（⑧+附录）：</b>从⑥⑦中选取售前客服环节（O1 RAG 自动接待含合规护栏 module）展开为产品画布。
            附录（数据清单 / 本体设计 / 测试用例集 / 可运行 Demo）均为项目级售前客服 AI 助手的交付物。
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>方法论四段 × 七步业务级 + 一步项目级落地</h2>
        <div className={styles.methodRow}>
          <div className={`${styles.m} ${styles.mResearch}`}>调研（①）</div>
          <div className={`${styles.m} ${styles.mStrategy}`}>战略（②）</div>
          <div className={`${styles.m} ${styles.mAnalysis}`}>业务级分析（③ ④ ⑤ ⑥ ⑦）</div>
          <div className={`${styles.m} ${styles.mLanding}`}>项目级落地（⑧ + 附录）</div>
        </div>

        <div className={styles.stepGrid}>
          {CARDS.map((card) => {
            const isDemo = card.href.startsWith("/agentic");
            return (
              <div
                key={card.title}
                className={card.num === "⊕" ? `${styles.stepCard} ${styles.appendixCard}` : styles.stepCard}
              >
                <div className={styles.stepNum}>{card.num}</div>
                <div className={styles.stepPhase}>{card.phase}</div>
                <span
                  className={`${styles.levelTag} ${card.level === "biz" ? styles.levelBiz : styles.levelProj}`}
                >
                  {card.level === "biz" ? "业务级" : "项目级"}
                </span>
                <h3>
                  {isDemo ? (
                    <Link href={card.href}>{card.title}</Link>
                  ) : (
                    <a href={card.href} target="_blank" rel="noreferrer">
                      {card.title}
                    </a>
                  )}
                </h3>
                <div className={styles.roleText}>{card.role}</div>
                <div className={styles.takeaway}>
                  <b>关键结论：</b>
                  {card.takeaway}
                </div>
                <div className={styles.linkRow}>
                  {isDemo ? (
                    <Link className={styles.demoLink} href={card.href}>
                      {card.linkLabel}
                    </Link>
                  ) : (
                    <a href={card.href} target="_blank" rel="noreferrer">
                      {card.linkLabel}
                    </a>
                  )}
                  {card.yaml ? (
                    <a className={styles.yamlLink} href={card.yaml} target="_blank" rel="noreferrer">
                      YAML 源
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.panel}>
        <h2>阅读逻辑链（为什么是这个顺序）</h2>
        <div className={styles.chainRow}>
          {CHAIN.map((node) => (
            <div
              key={node.title}
              className={`${styles.chainNode} ${node.level === "biz" ? styles.chainBiz : styles.chainProj}`}
            >
              <b>{node.title}</b>
              {node.desc}
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.pageFooter}>
        保健品私域电商 AI 规划 · 路径导航 · 双端集成版 · 12 项规划产物（22 个静态文件）
      </footer>
    </div>
  );
}

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
inject_nav.py — 为「私域电商售前客服AI规划」12 份 HTML 交付物注入统一导航栏（7 步 + 产品画布 + 数据清单 + 本体设计 + 测试用例集 + 问答Demo）
  · 顶部：步骤进度条（索引入口 + 步骤 pill，当前步高亮）
  · 底部：上一步 / 下一步逻辑卡（说明前承后启关系）
幂等设计：以 <!-- ai4pm-nav --> 标记包裹，重复运行会先移除旧导航再注入，
编译脚本（build_osm/build_process/build_blueprint/compiler/compile/build_milestone/build_canvas）重新生成 HTML 后重跑本脚本即可。
用法：python3 inject_nav.py
"""
import os
import re

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "私域电商售前客服AI规划")
INDEX = "私域电商售前客服-导航索引.html"

# (文件名, 短标题, 阶段, 本页定位一句话)
PAGES = [
    ("私域电商售前客服-业务现状分析.html", "① 业务现状分析", "调研",
     "现状基线/生态成熟度/接入方案三合一 + SWOT，锚定三约束与 10% 守护基线"),
    ("私域电商售前客服-OSM战略地图.html", "② 北极星OSM", "战略",
     "NSM=首单转化率护城河（稳健维持 ≥10%），三层拆解：底线维持/效率降本/增量捞回"),
    ("私域电商售前客服-业务流程.html", "③ 业务流程", "分析",
     "L1 价值流×5 阶段×L2 流程解剖人工售前全链路，定位 11 个痛点（critical×4）"),
    ("私域电商售前客服-服务蓝图.html", "④ 服务蓝图", "分析",
     "三层泳道解剖 As-Is 人工售前 5 阶段，定位认知负荷 critical 的痛点节点"),
    ("私域电商售前客服-AI机会场景地图.html", "⑤ AI场景地图", "分析",
     "把流程痛点转成 16 个 RAG 自动回复价值落点，并划定兜底与守护边界"),
    ("私域电商售前客服-优先级矩阵.html", "⑥ 优先级矩阵", "排序",
     "16 个机会按收益×成本评分排序，识别 Quick Win 与依赖根节点"),
    ("私域电商售前客服-里程碑计划.html", "⑦ 里程碑计划", "落地",
     "依赖驱动排期：被依赖机会前置，6 个月三阶段 FDE 交付甘特图"),
    ("私域电商售前客服-产品画布.html", "⊕ 产品画布", "附录",
     "最小售前转化闭环 Demo：首响 + 正品信任 + 促销算账 + 转人工兜底 + 转化守护"),
    ("私域电商售前客服-政策规则数据清单.html", "⊕ 数据清单", "附录",
     "真实业务数据底稿：19 位客户语料 + 16 档全规格价格 + 验真/物流/支付口径"),
    ("私域电商售前客服-业务本体设计.html", "⊕ 本体设计", "附录",
     "Agent 三层本体：10 实体对象关系 + 5 个行动边界 + 3 条执行流状态迁移"),
    ("私域电商售前客服-测试用例集.html", "⊕ 测试用例", "附录",
     "三层三类 MVP 验证集：30 条用例（Golden 50% / Hard 30% / Edge 20%）+ 本体遗漏检查"),
    ("私域电商售前客服-售前问答Demo.html", "⊕ 问答Demo", "附录",
     "确定性问答引擎可运行 Demo：左侧会话气泡 + 右侧透明面板（意图/置信度/知识证据/行动边界/转人工），镜像 answer_engine 规则"),
]

NAV_CSS = """
<style>
.ai4pm-nav{font-family:"MiSans","Microsoft YaHei","Inter",Arial,sans-serif;width:85%;margin:0 auto;}
.ai4pm-nav-top{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:14px 18px;margin:16px auto 8px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;box-shadow:0 2px 8px rgba(16,33,62,.06);}
.ai4pm-nav-top .idx{font-size:12.5px;font-weight:700;color:#fff;background:#10213E;border-radius:6px;padding:5px 12px;text-decoration:none;white-space:nowrap;}
.ai4pm-nav-top .idx:hover{background:#1B2B47;}
.ai4pm-nav-top .sep{color:#E2E8F0;}
.ai4pm-nav-top .pill{font-size:12px;color:#64748B;background:#F5F5F6;border:1px solid #E2E8F0;border-radius:20px;padding:4px 12px;text-decoration:none;white-space:nowrap;}
.ai4pm-nav-top .pill:hover{border-color:#5DB2E2;color:#10213E;}
.ai4pm-nav-top .pill.cur{background:#5DB2E2;border-color:#5DB2E2;color:#fff;font-weight:700;}
.ai4pm-nav-top .arrow{color:#CBD5E1;font-size:11px;}
.ai4pm-nav-bottom{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px auto 28px;}
.ai4pm-nav-bottom .navcard{display:block;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:14px 18px;text-decoration:none;transition:box-shadow .2s,border-color .2s;}
.ai4pm-nav-bottom .navcard:hover{border-color:#5DB2E2;box-shadow:0 4px 12px rgba(16,33,62,.12);}
.ai4pm-nav-bottom .navcard .dir{font-size:11px;font-weight:700;letter-spacing:.05em;color:#625D9C;margin-bottom:4px;}
.ai4pm-nav-bottom .navcard .t{font-size:14px;font-weight:700;color:#10213E;margin-bottom:4px;}
.ai4pm-nav-bottom .navcard .d{font-size:12px;color:#64748B;line-height:1.6;}
.ai4pm-nav-bottom .navcard.next{text-align:right;border-top:3px solid #5DB2E2;}
.ai4pm-nav-bottom .navcard.prev{border-top:3px solid #E2E8F0;}
.ai4pm-nav-bottom .navcard.single{grid-column:span 2;}
@media (max-width:768px){.ai4pm-nav-top{overflow-x:auto;}.ai4pm-nav-bottom{grid-template-columns:1fr;}.ai4pm-nav-bottom .navcard.single{grid-column:span 1;}}
</style>
"""

def top_nav(cur: int) -> str:
    pills = []
    for i, (fn, short, _, _) in enumerate(PAGES):
        cls = "pill cur" if i == cur else "pill"
        pills.append(f'<a class="{cls}" href="{fn}">{short}</a>')
        if i < len(PAGES) - 1:
            pills.append('<span class="arrow">›</span>')
    return (
        '<div class="ai4pm-nav"><div class="ai4pm-nav-top">'
        f'<a class="idx" href="{INDEX}">☰ 导航索引</a><span class="sep">|</span>'
        + "".join(pills)
        + "</div></div>"
    )

def bottom_nav(cur: int) -> str:
    cards = []
    if cur > 0:
        fn, short, phase, role = PAGES[cur - 1]
        cards.append(
            f'<a class="navcard prev" href="{fn}"><div class="dir">← 上一步 · {phase}</div>'
            f'<div class="t">{short}</div><div class="d">前承：{role}</div></a>'
        )
    else:
        cards.append(
            f'<a class="navcard prev" href="{INDEX}"><div class="dir">← 返回</div>'
            f'<div class="t">导航索引</div><div class="d">本页是第 1 步：全部结论以本页基线数据为出发点</div></a>'
        )
    if cur < len(PAGES) - 1:
        fn, short, phase, role = PAGES[cur + 1]
        cards.append(
            f'<a class="navcard next" href="{fn}"><div class="dir">下一步 · {phase} →</div>'
            f'<div class="t">{short}</div><div class="d">后启：{role}</div></a>'
        )
    else:
        cards.append(
            f'<a class="navcard next" href="{INDEX}"><div class="dir">规划终点 →</div>'
            f'<div class="t">返回导航索引</div><div class="d">七步闭环完成：现状→战略→流程→蓝图→场景→优先级→里程碑（+单场景产品画布）</div></a>'
        )
    return '<div class="ai4pm-nav"><div class="ai4pm-nav-bottom">' + "".join(cards) + "</div></div>"

TOP_MARK_S, TOP_MARK_E = "<!-- ai4pm-nav-top-start -->", "<!-- ai4pm-nav-top-end -->"
BOT_MARK_S, BOT_MARK_E = "<!-- ai4pm-nav-bottom-start -->", "<!-- ai4pm-nav-bottom-end -->"

def inject(path: str, cur: int) -> None:
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    # 幂等：先移除旧导航块
    html = re.sub(re.escape(TOP_MARK_S) + r".*?" + re.escape(TOP_MARK_E), "", html, flags=re.S)
    html = re.sub(re.escape(BOT_MARK_S) + r".*?" + re.escape(BOT_MARK_E), "", html, flags=re.S)

    top_block = f"{TOP_MARK_S}{NAV_CSS}{top_nav(cur)}{TOP_MARK_E}"
    bot_block = f"{BOT_MARK_S}{bottom_nav(cur)}{BOT_MARK_E}"

    # 顶部导航：插在 <body...> 之后
    m = re.search(r"<body[^>]*>", html)
    if not m:
        raise RuntimeError(f"未找到 <body>: {path}")
    html = html[: m.end()] + "\n" + top_block + html[m.end():]
    # 底部导航：插在 </body> 之前
    idx = html.rfind("</body>")
    if idx == -1:
        raise RuntimeError(f"未找到 </body>: {path}")
    html = html[:idx] + bot_block + "\n" + html[idx:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ 导航已注入 [第{cur+1}步] {os.path.basename(path)}")

def main():
    for i, (fn, _, _, _) in enumerate(PAGES):
        path = os.path.join(DIR, fn)
        if not os.path.exists(path):
            print(f"⚠️  缺失文件，跳过: {fn}")
            continue
        inject(path, i)

if __name__ == "__main__":
    main()

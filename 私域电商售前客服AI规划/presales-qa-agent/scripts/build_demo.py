#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_demo.py — 知识库 YAML → 交互式 HTML Demo（presales-qa-agent）

读取售前问答知识库 YAML，将其转为 JSON 注入 Jinja2 模板，产出一个
**无后端、离线可演示**的交互式聊天 Demo：
  · 左侧：客户 / AI 聊天气泡对话
  · 右侧：透明面板（命中意图 + 置信度、命中知识条目/规则、行动边界决策、是否转人工及摘要）
  · 顶部：取自测试用例的快捷提问 chips

浏览器内的 JS 引擎（模板中的 ENGINE）**镜像 answer_engine.py 的路由与查表规则**，
读注入的知识库 JSON 现场作答，价格零幻觉。

用法：
  python3 build_demo.py <kb.yaml> <output.html>
  python3 build_demo.py <kb.yaml> <output.html> --title "私域电商售前客服"
"""
import sys
import os
import json
import argparse
from datetime import datetime

try:
    import yaml
except ImportError:
    print("需要 PyYAML：pip install pyyaml")
    sys.exit(1)

try:
    from jinja2 import Environment, FileSystemLoader
except ImportError:
    print("需要 Jinja2：pip install jinja2")
    sys.exit(1)

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates")
TEMPLATE_NAME = "qa_demo_layout.html"

# 快捷提问 chips —— 取自测试用例集的高信号场景（覆盖冲突/议价/红线/缺货/正常）
DEFAULT_CHIPS = [
    {"label": "在吗？（首响）", "text": "在吗？想了解一下"},
    {"label": "孟版 5.0 多少钱", "text": "孟版 5.0 多少钱一支？"},
    {"label": "日版 2.5 报价（C-016 双口径）", "text": "日版 2.5 多少钱一盒？"},
    {"label": "议价（C-017）", "text": "上次你们客服给我优惠了 10，这次也一样吧？1200 的能不能 80 拿？"},
    {"label": "治疗红线（C-026）", "text": "我有糖尿病，这个能降血糖吗？能不能代替我在吃的药？"},
    {"label": "日版 15 缺货（C-015）", "text": "日版 15 的有货吗？多少钱？"},
    {"label": "珠峰 12.5（无此档）", "text": "珠峰 12.5 多少钱？"},
    {"label": "正品验真", "text": "怎么验证是不是正品？"},
    {"label": "发货运费", "text": "从哪发货？运费怎么算？"},
    {"label": "点名人工", "text": "我要转人工"},
]


def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build(kb_path, out_path, title=None):
    kb = load_yaml(kb_path)
    meta = kb.get("meta", {})
    demo_title = title or meta.get("title", "私域售前问答 Demo")
    product_name = meta.get("product_name", "AI 售前助手")

    env = Environment(
        loader=FileSystemLoader(os.path.normpath(TEMPLATE_DIR)),
        autoescape=False,  # 我们注入的是受控 JSON / 结构化文本
    )
    template = env.get_template(TEMPLATE_NAME)

    html = template.render(
        title=demo_title,
        product_name=product_name,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
        kb_json=json.dumps(kb, ensure_ascii=False),
        chips_json=json.dumps(DEFAULT_CHIPS, ensure_ascii=False),
    )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ Demo 已生成：{out_path}")
    print(f"   知识库：{kb_path}")
    print(f"   SKU 档位：{len(kb.get('sku_prices', []))} 条 / 版本：{len(kb.get('product_versions', []))} 个")


def main():
    ap = argparse.ArgumentParser(description="知识库 YAML → 交互式 HTML Demo")
    ap.add_argument("kb", help="知识库 YAML 路径")
    ap.add_argument("out", help="输出 HTML 路径")
    ap.add_argument("--title", help="Demo 标题（默认取 meta.title）")
    args = ap.parse_args()
    build(args.kb, args.out, args.title)


if __name__ == "__main__":
    main()

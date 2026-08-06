#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
answer_engine.py — 售前问答确定性工具集

本引擎不做意图识别，不生成话术。只提供确定性工具函数供 LLM 调用：
  1. get_price(version, dose)          → 价格/库存/单位
  2. calc_promo(version, dose, qty)    → 促销优惠/到手价
  3. check_compliance(msg)             → 合规风险判定（白名单/禁忌人群）
  4. check_manual_promo(msg)           → 人工议价口径检测
  5. get_authenticity_proof()          → 验真路径/退款承诺
  6. get_fulfillment_info()            → 支付/物流口径
  7. get_product_info(version)         → 商品版本详情
  8. get_all_products()                → 全部在售商品概览

LLM 负责：语义理解、意图识别、话术生成（不需要穷举关键词）。
引擎负责：价格查表、合规判定、库存查询（高风险确定性决策，零幻觉）。

用法：
  python3 answer_engine.py kb.yaml --tool price --version 日版 --dose 2.5
  python3 answer_engine.py kb.yaml --tool promo --version 孟版 --dose 5.0
  python3 answer_engine.py kb.yaml --tool compliance --msg "能降血糖吗"
  python3 answer_engine.py kb.yaml --tool product --version 日版
  python3 answer_engine.py kb.yaml --tool authenticity
  python3 answer_engine.py kb.yaml --tool fulfillment
  python3 answer_engine.py kb.yaml --tool manual_promo --msg "优惠10"
  python3 answer_engine.py kb.yaml --tool all_products
  python3 answer_engine.py kb.yaml --replay test_cases.yaml
"""

import sys
import json
import re
import argparse
import yaml

# ── 有效剂量档位白名单 ──────────────────────────────────────────
VALID_DOSES = {"2.5", "5.0", "7.5", "10", "12.5", "15"}


# ════════════════════════════════════════════════════════════════
# 基础工具
# ════════════════════════════════════════════════════════════════
def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def normalize_dose(raw):
    """归一剂量写法：5 → 5.0，10 → 10。"""
    if raw is None:
        return None
    raw = str(raw).strip()
    if raw in ("5", "5.0"):
        return "5.0"
    if raw in ("10", "10.0"):
        return "10"
    if raw in ("15", "15.0"):
        return "15"
    if raw in ("2.5", "7.5", "12.5"):
        return raw
    return raw


def find_version(kb, query):
    """按 name/aliases 命中版本；返回版本 dict 或 None。"""
    for v in kb.get("product_versions", []):
        names = [v.get("name", "")] + list(v.get("aliases", []))
        for n in names:
            if n and n in query:
                return v
    return None


def find_sku(kb, version_name, dose):
    dose = normalize_dose(dose)
    for s in kb.get("sku_prices", []):
        if s.get("version") == version_name and str(s.get("dose")) == str(dose):
            return s
    return None


# ════════════════════════════════════════════════════════════════
# 工具 1：价格查询
# ════════════════════════════════════════════════════════════════
def get_price(kb, version_query, dose):
    """给定版本+剂量，返回价格/库存/单位。LLM 用此工具获取确定性价格。"""
    version = find_version(kb, version_query)
    if not version:
        return {
            "error": f"未找到版本：{version_query}",
            "available_versions": [v["name"] for v in kb.get("product_versions", [])],
        }

    dose = normalize_dose(dose)
    if dose not in VALID_DOSES:
        return {
            "error": f"无效剂量：{dose}",
            "valid_doses": sorted(VALID_DOSES),
        }

    sku = find_sku(kb, version["name"], dose)
    if not sku:
        return {
            "error": f"未找到规格：{version['name']} × {dose}",
            "version": version["name"],
            "available_doses": version.get("doses", []),
        }

    return {
        "version": version["name"],
        "dose": dose,
        "list_price": sku.get("list_price"),
        "stock": sku.get("stock"),
        "unit": sku.get("unit"),
        "integral_only": version.get("integral_only", False),
        "package_desc": version.get("package_desc"),
        "product_form": version.get("product_form"),
    }


# ════════════════════════════════════════════════════════════════
# 工具 2：促销计算
# ════════════════════════════════════════════════════════════════
def calc_promo(kb, version_query, dose, quantity=1):
    """给定版本+剂量+数量，返回促销优惠和到手价。到手价只能由此工具算出。"""
    price_info = get_price(kb, version_query, dose)
    if "error" in price_info:
        return price_info

    list_price = price_info.get("list_price")
    if list_price is None:
        return {**price_info, "error": "该档位缺货，无法计算价格"}

    # 查找匹配的生效促销规则
    matched = None
    for promo in kb.get("promo_rules", []):
        if promo.get("validity") != "active":
            continue
        if promo.get("version") != price_info["version"]:
            continue
        matched = promo
        break

    if matched:
        discount = matched.get("discount", 0)
        final_price = list_price - discount
        return {
            "version": price_info["version"],
            "dose": price_info["dose"],
            "list_price": list_price,
            "promo_name": matched.get("name"),
            "discount": discount,
            "final_price": final_price,
            "unit": price_info["unit"],
            "stock": price_info["stock"],
        }

    return {
        "version": price_info["version"],
        "dose": price_info["dose"],
        "list_price": list_price,
        "promo_name": None,
        "discount": 0,
        "final_price": list_price,
        "unit": price_info["unit"],
        "stock": price_info["stock"],
    }


# ════════════════════════════════════════════════════════════════
# 工具 3：合规检查
# ════════════════════════════════════════════════════════════════
def check_compliance(kb, msg):
    """检查消息是否命中合规白名单触发词或禁忌人群。返回判定结果，不生成话术。"""
    # 优先检查禁忌人群（最高优先级，命中即不推进成交）
    contra = kb.get("contraindications", {})
    for group in contra.get("groups", []):
        if group in msg:
            return {
                "hit": True,
                "type": "contraindication",
                "matched_group": group,
                "need_human": True,
                "reply_skeleton": contra.get("reply", ""),
                "rule": "禁忌人群不推进成交",
            }

    # 检查合规白名单
    for item in kb.get("compliance_whitelist", []):
        for trigger in item.get("trigger_words", []):
            if trigger in msg:
                return {
                    "hit": True,
                    "type": "compliance_whitelist",
                    "intent": item.get("intent"),
                    "response_mode": item.get("response_mode"),
                    "need_human": item.get("response_mode") == "transfer",
                    "reply_skeleton": item.get("reply", ""),
                }

    return {"hit": False, "need_human": False}


# ════════════════════════════════════════════════════════════════
# 工具 4：人工议价口径检测
# ════════════════════════════════════════════════════════════════
def check_manual_promo(kb, msg):
    """检查消息是否命中人工议价口径（未结构化，不能自动执行，须转人工）。"""
    for promo in kb.get("manual_only_promos", []):
        # 提取关键词进行匹配
        keywords = re.findall(r"[\d]+", promo)
        for kw in keywords:
            if kw in msg:
                return {
                    "hit": True,
                    "matched": promo,
                    "need_human": True,
                    "rule": "人工议价口径未结构化，禁止AI自动执行",
                }
    # 检查议价意图（优惠/便宜/打折/减/送等）
    bargain_words = ["优惠", "便宜", "打折", "减", "送", "能不能便宜", "便宜点"]
    if any(w in msg for w in bargain_words):
        # 检查是否在促销规则库内
        for promo in kb.get("promo_rules", []):
            if promo.get("validity") != "active":
                continue
            if promo.get("version", "") in msg or "618" in msg:
                return {"hit": False, "need_human": False}
        return {
            "hit": True,
            "matched": "规则库外议价",
            "need_human": True,
            "rule": "规则库外议价/组合优惠，不承诺减免",
        }
    return {"hit": False, "need_human": False}


# ════════════════════════════════════════════════════════════════
# 工具 5：正品凭据
# ════════════════════════════════════════════════════════════════
def get_authenticity_proof(kb):
    """返回验真路径和退款承诺。LLM 基于此生成正品应答话术。"""
    proofs = kb.get("authenticity_proofs", {})
    return {
        "verify_steps": proofs.get("verify_steps", []),
        "packaging": proofs.get("packaging", []),
        "refund_promise": proofs.get("refund_promise", ""),
        "forbidden": proofs.get("forbidden", []),
    }


# ════════════════════════════════════════════════════════════════
# 工具 6：物流支付口径
# ════════════════════════════════════════════════════════════════
def get_fulfillment_info(kb):
    """返回支付方式和物流口径。"""
    fp = kb.get("fulfillment_payment", {})
    return {
        "payment_methods": fp.get("payment_methods", []),
        "payment_unavailable": fp.get("payment_unavailable", ""),
        "shipping_origin": fp.get("shipping_origin", ""),
        "ship_time": fp.get("ship_time", ""),
        "delivery_time": fp.get("delivery_time", ""),
        "freight": fp.get("freight", ""),
        "screenshot_handoff": fp.get("screenshot_handoff", ""),
    }


# ════════════════════════════════════════════════════════════════
# 工具 7：商品版本信息
# ════════════════════════════════════════════════════════════════
def get_product_info(kb, version_query):
    """返回商品版本详情（包装/剂型/使用/保存/剂量档位）。"""
    version = find_version(kb, version_query)
    if not version:
        return {
            "error": f"未找到版本：{version_query}",
            "available_versions": [v["name"] for v in kb.get("product_versions", [])],
        }
    return {
        "name": version.get("name"),
        "aliases": version.get("aliases", []),
        "package_desc": version.get("package_desc"),
        "product_form": version.get("product_form"),
        "usage_desc": version.get("usage_desc"),
        "storage_desc": version.get("storage_desc"),
        "compare_note": version.get("compare_note"),
        "integral_only": version.get("integral_only", False),
        "doses": version.get("doses", []),
    }


# ════════════════════════════════════════════════════════════════
# 工具 8：全部在售商品概览
# ════════════════════════════════════════════════════════════════
def get_all_products(kb):
    """返回全部在售商品概览（LLM 首次加载时调用一次，理解商品体系）。"""
    versions = []
    for v in kb.get("product_versions", []):
        versions.append({
            "name": v.get("name"),
            "aliases": v.get("aliases", []),
            "package_desc": v.get("package_desc"),
            "product_form": v.get("product_form"),
            "usage_desc": v.get("usage_desc"),
            "storage_desc": v.get("storage_desc"),
            "compare_note": v.get("compare_note"),
            "integral_only": v.get("integral_only", False),
            "doses": v.get("doses", []),
        })
    # 不在售商品
    not_in_scope = []
    for item in kb.get("not_in_scope", []):
        not_in_scope.append({
            "item": item.get("item"),
            "aliases": item.get("aliases", []),
            "reply": item.get("reply"),
        })
    return {
        "versions": versions,
        "not_in_scope": not_in_scope,
        "synonyms_note": kb.get("synonyms_note", ""),
        "sku_count": len(kb.get("sku_prices", [])),
    }


# ════════════════════════════════════════════════════════════════
# 回归测试（只验证工具函数确定性数据，不验证话术）
# ════════════════════════════════════════════════════════════════
def extract_customer_msg(raw_input):
    """从测试用例的 input 字段中提取客户消息。"""
    if not isinstance(raw_input, str):
        return str(raw_input)
    lines = raw_input.strip().split("\n")
    for l in lines:
        l = l.strip()
        if l.startswith("客户:"):
            return l[3:].strip().strip('"').strip()
    return raw_input.strip().strip('"').strip()


def replay(kb, test_cases_path):
    """
    回归测试：只验证工具函数的确定性数据（价格/库存/合规判定）。
    不验证意图识别和话术文本（那些由 LLM 负责，无法纯脚本测试）。
    """
    data = load_yaml(test_cases_path)
    cases = data.get("test_cases", []) if isinstance(data, dict) else data
    total = len(cases)
    passed = 0
    skipped = 0

    print(f"\n{'=' * 72}")
    print(f"回归测试：共 {total} 条用例（只验证工具函数确定性数据）")
    print(f"{'=' * 72}")

    for case in cases:
        cid = case.get("id", "?")
        scenario = case.get("scenario", "")[:35]
        msg = extract_customer_msg(case.get("input", ""))
        exp_out = str(case.get("expected_output", ""))
        exp_mid = str(case.get("expected_intermediate", ""))
        checks = []
        ok = True
        has_check = False

        # ── 检查 1：价格类——验证价格数字 ──
        price_match = re.search(r"表价\s*(\d+)", exp_mid)
        if not price_match:
            price_match = re.search(r"(\d+)\s*元", exp_out)
        if price_match:
            has_check = True
            version_name = None
            for v in kb.get("product_versions", []):
                names = [v["name"]] + v.get("aliases", [])
                for n in names:
                    if n and n in msg:
                        version_name = v["name"]
                        break
                if version_name:
                    break
            dose_match = re.search(r"(\d+\.?\d*)", msg)
            if version_name and dose_match:
                dose = normalize_dose(dose_match.group(1))
                if dose in VALID_DOSES:
                    price_info = get_price(kb, version_name, dose)
                    expected_price = int(price_match.group(1))
                    actual_price = price_info.get("list_price")
                    c = actual_price == expected_price
                    checks.append(("price", c, f"期望={expected_price} 实际={actual_price}"))
                    ok = ok and c

        # ── 检查 2：缺货类——验证库存状态 ──
        if "缺货" in exp_out or "out_of_stock" in exp_mid:
            has_check = True
            version_name = None
            for v in kb.get("product_versions", []):
                names = [v["name"]] + v.get("aliases", [])
                for n in names:
                    if n and n in msg:
                        version_name = v["name"]
                        break
                if version_name:
                    break
            dose_match = re.search(r"(\d+\.?\d*)", msg)
            if version_name and dose_match:
                dose = normalize_dose(dose_match.group(1))
                if dose in VALID_DOSES:
                    price_info = get_price(kb, version_name, dose)
                    c = price_info.get("stock") == "out_of_stock"
                    checks.append(("stock", c, f"stock={price_info.get('stock')}"))
                    ok = ok and c

        # ── 检查 3：合规类——验证合规判定 ──
        if "白名单" in exp_mid or "transfer" in exp_mid or "safe_reply" in exp_mid or "禁忌" in exp_mid:
            has_check = True
            comp = check_compliance(kb, msg)
            if "transfer" in exp_mid or "禁忌" in exp_mid:
                c = comp.get("need_human") is True
                checks.append(("compliance", c, f"need_human={comp.get('need_human')}"))
                ok = ok and c
            elif "safe_reply" in exp_mid:
                c = comp.get("hit") is True
                checks.append(("compliance", c, f"hit={comp.get('hit')}"))
                ok = ok and c

        # ── 检查 4：人工议价类 ──
        if "人工议价" in exp_mid or "优惠10" in msg or "1200" in msg or "买三送一" in msg:
            has_check = True
            mp = check_manual_promo(kb, msg)
            c = mp.get("need_human") is True
            checks.append(("manual_promo", c, f"hit={mp.get('hit')}"))
            ok = ok and c

        # ── 输出结果 ──
        if not has_check:
            skipped += 1
            print(f"[{cid}] ⏭ SKIP  {scenario}  （非工具可验证用例，需LLM测试）")
        elif ok:
            passed += 1
            detail = " | ".join(f"{n}:{'✓' if c else '✗'}({d})" for n, c, d in checks)
            print(f"[{cid}] ✅ PASS  {scenario}  {detail}")
        else:
            detail = " | ".join(f"{n}:{'✓' if c else '✗'}({d})" for n, c, d in checks)
            print(f"[{cid}] ❌ FAIL  {scenario}  {detail}")

    print(f"\n{'=' * 72}")
    print(f"工具函数验证：{passed}/{passed + (total - passed - skipped)} = "
          f"{passed / max(1, passed + (total - passed - skipped)) * 100:.1f}%")
    print(f"需 LLM 测试：{skipped} 条（意图识别/话术生成/版本对比等）")
    print(f"{'=' * 72}")


# ════════════════════════════════════════════════════════════════
# CLI 入口
# ════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(
        description="售前问答确定性工具集（供 LLM 调用）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
可用工具：
  price         查询价格/库存    --version 日版 --dose 2.5
  promo         计算促销到手价    --version 孟版 --dose 5.0 --quantity 1
  compliance    合规风险判定      --msg "能降血糖吗"
  manual_promo  人工议价检测      --msg "优惠10"
  authenticity  正品验真凭据      （无需参数）
  fulfillment   物流支付口径      （无需参数）
  product       商品版本详情      --version 日版
  all_products  全部商品概览      （无需参数）
  replay        回归测试          --replay test_cases.yaml
        """,
    )
    ap.add_argument("kb", help="知识库 YAML 路径")
    ap.add_argument("--tool", help="工具名称")
    ap.add_argument("--version", help="版本名（日版/孟版/珠峰）")
    ap.add_argument("--dose", help="剂量档位")
    ap.add_argument("--quantity", type=int, default=1, help="购买数量")
    ap.add_argument("--msg", help="客户消息（用于合规检查）")
    ap.add_argument("--replay", help="测试用例集 YAML 路径")
    args = ap.parse_args()

    kb = load_yaml(args.kb)

    if args.tool:
        tool_map = {
            "price": lambda: get_price(kb, args.version, args.dose),
            "promo": lambda: calc_promo(kb, args.version, args.dose, args.quantity),
            "compliance": lambda: check_compliance(kb, args.msg),
            "manual_promo": lambda: check_manual_promo(kb, args.msg),
            "authenticity": lambda: get_authenticity_proof(kb),
            "fulfillment": lambda: get_fulfillment_info(kb),
            "product": lambda: get_product_info(kb, args.version),
            "all_products": lambda: get_all_products(kb),
        }
        func = tool_map.get(args.tool)
        if func:
            result = func()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"未知工具：{args.tool}")
            print(f"可用工具：{', '.join(tool_map.keys())}")
            sys.exit(1)

    elif args.replay:
        replay(kb, args.replay)

    else:
        ap.print_help()


if __name__ == "__main__":
    main()

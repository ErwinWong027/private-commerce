#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
answer_engine.py — 私域售前问答确定性引擎（presales-qa-agent）

五阶段确定性流水线（每阶段对应一个行动边界，可解释、可回归）：
  1. 意图路由          （inquiry_intent）
  2. 合规红线闸        （ab_risk_compliance）
  3. 转人工判定        （handoff_ticket）
  4. 确定性价格查表    （ab_deterministic_pricing）
  5. 知识应答          （ab_authenticity_reply / ab_order_handoff 等）

护栏：价格只查表、凭据只来自知识库、敏感功效只走白名单，命中不足/风险/点名一律转人工。

用法：
  python3 answer_engine.py <kb.yaml> --ask "日版 2.5 多少钱？"
  python3 answer_engine.py <kb.yaml> --replay <test_cases.yaml>
"""
import sys
import re
import argparse

try:
    import yaml
except ImportError:
    print("需要 PyYAML：pip install pyyaml")
    sys.exit(1)

# 意图优先级（数字越小优先级越高）
INTENT_PRIORITY = ["handoff", "risk", "fulfillment_payment", "pricing", "authenticity", "version"]
DOSE_PATTERN = re.compile(r"(\d+\.?\d*)")
# 打招呼/首响触发词（无意图命中且命中此表 → 走欢迎语，而非转人工）
GREETINGS = ["在吗", "在么", "在不在", "你好", "您好", "哈喽", "hi", "hello", "有人吗", "咨询下", "想了解", "了解一下"]


# ----------------------------- 基础工具 -----------------------------
def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def normalize_dose(raw):
    """把用户输入的剂量数字归一到知识库档位写法：5 -> 5.0，10 -> 10。"""
    if raw is None:
        return None
    raw = raw.strip()
    if raw in ("5", "5.0"):
        return "5.0"
    if raw in ("10", "10.0"):
        return "10"
    if raw in ("15", "15.0"):
        return "15"
    if raw in ("2.5", "7.5", "12.5"):
        return raw
    return raw


def detect_version(msg, kb):
    """按 name/aliases 命中版本；返回版本 dict。"""
    for v in kb.get("product_versions", []):
        names = [v.get("name", "")] + list(v.get("aliases", []))
        for n in names:
            if n and n in msg:
                return v
    return None


def detect_doses(msg):
    """从消息中抽取所有剂量档写法。"""
    doses = []
    for m in DOSE_PATTERN.findall(msg):
        d = normalize_dose(m)
        if d and d not in doses:
            doses.append(d)
    return doses


def find_sku(kb, version_name, dose):
    for s in kb.get("sku_prices", []):
        if s.get("version") == version_name and str(s.get("dose")) == str(dose):
            return s
    return None


# ----------------------------- 阶段 1：意图路由 -----------------------------
def classify(msg, kb):
    routing = kb.get("routing", {})
    kwmap = routing.get("intent_keywords", {})
    scores, hits = {}, {}
    for intent, words in kwmap.items():
        s, h = 0, []
        for w in words:
            if w and w in msg:
                s += 1
                h.append(w)
        if intent == "risk":
            s = s * 1.5
        scores[intent] = s
        hits[intent] = h

    # handoff 命中无条件优先；risk 命中则强制 risk（风险优先级最高）
    if scores.get("handoff", 0) > 0:
        chosen = "handoff"
    elif scores.get("risk", 0) > 0:
        chosen = "risk"
    else:
        ranked = sorted(kwmap.keys(),
                        key=lambda i: (-scores.get(i, 0), INTENT_PRIORITY.index(i)))
        chosen = ranked[0] if ranked and scores.get(ranked[0], 0) > 0 else None

    raw = scores.get(chosen, 0) if chosen else 0
    confidence = min(1.0, raw / 2.0)
    return chosen, round(confidence, 2), (hits.get(chosen, []) if chosen else [])


# ----------------------------- 阶段 2/3：合规 + 转人工摘要 -----------------------------
def make_summary(concern, answered, unresolved):
    return (f"【客户关注点】{concern}\n"
            f"【已答内容】{answered}\n"
            f"【未解决问题】{unresolved}")


def handle_risk(msg, kb):
    """合规红线闸：先查禁忌人群与治疗类（transfer），再查 safe_reply 白名单。"""
    contra = kb.get("contraindications", {}) or {}
    for g in contra.get("groups", []):
        if g and g in msg:
            reply = contra.get("reply", "该情况属于禁忌/慎用人群，需遵医嘱，不便直接推进购买。")
            return {
                "boundary_decision": "ab_risk_compliance → 禁忌人群命中，不推进成交（transfer）",
                "need_human": True,
                "matched_evidence": [f"contraindications.groups: {g}"],
                "handoff_summary": make_summary(
                    f"自述属禁忌人群「{g}」仍希望购买",
                    "已按固定口径说明该人群为禁忌/慎用",
                    "是否可购买需人工按医嘱判断，不由 AI 推进成交"),
                "reply": reply,
            }
    for item in kb.get("compliance_whitelist", []):
        for w in item.get("trigger_words", []):
            if w and w in msg:
                mode = item.get("response_mode", "safe_reply")
                if mode == "transfer":
                    return {
                        "boundary_decision": f"ab_risk_compliance → 白名单「{item['intent']}」response_mode=transfer",
                        "need_human": True,
                        "matched_evidence": [f"compliance_whitelist[{item['intent']}] trigger={w}"],
                        "handoff_summary": make_summary(
                            f"涉及「{item['intent']}」（触发词：{w}）",
                            "已按白名单输出保守话术，不回应治疗/功效",
                            "治疗/功效类问题超出白名单，需人工承接"),
                        "reply": item.get("reply", ""),
                    }
                return {
                    "boundary_decision": f"ab_risk_compliance → 白名单「{item['intent']}」safe_reply",
                    "need_human": False,
                    "matched_evidence": [f"compliance_whitelist[{item['intent']}] trigger={w}"],
                    "handoff_summary": "",
                    "reply": item.get("reply", ""),
                }
    # 风险意图但白名单未覆盖 → 保守 + 转人工
    return {
        "boundary_decision": "ab_risk_compliance → 白名单未覆盖，保守答复并转人工",
        "need_human": True,
        "matched_evidence": ["compliance_whitelist: 无命中"],
        "handoff_summary": make_summary("风险类问题（白名单未覆盖）",
                                        "未即兴作答", "需人工按合规口径处理"),
        "reply": "这个问题我不方便直接下结论，帮您转人工进一步说明。",
    }


# ----------------------------- 阶段 4：确定性价格 -----------------------------
def handle_pricing(msg, kb):
    version = detect_version(msg, kb)
    # 不在售商品优先拦截
    for ni in kb.get("not_in_scope", []):
        names = [ni.get("item", "")] + list(ni.get("aliases", []))
        if any(n and n in msg for n in names):
            return {
                "boundary_decision": "ab_deterministic_pricing → 命中 not_in_scope，不报价",
                "need_human": False,
                "matched_evidence": [f"not_in_scope: {ni.get('item')}"],
                "handoff_summary": "",
                "reply": ni.get("reply", "该商品不在本店销售范围，不便报价。"),
            }
    if not version:
        return {
            "boundary_decision": "ab_deterministic_pricing → 未识别版本，请客户澄清",
            "need_human": False,
            "matched_evidence": [],
            "handoff_summary": "",
            "reply": "请问您想了解哪个版本（日版礼来 / 孟版杰西卡 / 珠峰）的价格呢？",
        }

    vname = version["name"]
    doses = detect_doses(msg)
    valid_doses = [d for d in doses if d in [str(x) for x in version.get("doses", [])]]
    ask_promo = any(k in msg for k in ["优惠", "活动", "到手", "减", "便宜", "折扣", "618"])

    # 抽到了剂量数字但该版本无此档 → 纠正认知，不虚构价格
    if doses and not valid_doses:
        avail = "/".join(str(x) for x in version.get("doses", []))
        return {
            "boundary_decision": f"ab_deterministic_pricing → {vname} 无 {doses[0]} 档，纠正认知不虚构价格",
            "need_human": False,
            "matched_evidence": [f"sku_prices: {vname}×{doses[0]} 不存在"],
            "handoff_summary": "",
            "reply": f"{vname}没有 {doses[0]} 这个档位哦，实际只有 {avail} 档，需要我帮您看哪一档？",
        }

    # 有明确单一档位
    if len(valid_doses) == 1:
        dose = valid_doses[0]
        sku = find_sku(kb, vname, dose)
        if not sku:
            avail = "/".join(str(x) for x in version.get("doses", []))
            return {
                "boundary_decision": f"ab_deterministic_pricing → {vname} 无 {dose} 档，纠正认知不虚构价格",
                "need_human": False,
                "matched_evidence": [f"sku_prices: {vname}×{dose} 不存在"],
                "handoff_summary": "",
                "reply": f"{vname}没有 {dose} 这个档位哦，实际只有 {avail} 档，需要我帮您看哪一档？",
            }
        if sku.get("conflict"):
            return {
                "boundary_decision": "ab_deterministic_pricing → 命中口径冲突档，保守话术 + 口径冲突工单",
                "need_human": True,
                "matched_evidence": [
                    f"sku_prices: {vname}×{dose} 表价 {sku.get('list_price')} / 会话口径 {sku.get('session_price')}（conflict）"],
                "handoff_summary": make_summary(
                    f"询问 {vname} {dose} 价格",
                    "未直接二选一报价（避免错价）",
                    f"该档存在表价 {sku.get('list_price')} 与会话口径 {sku.get('session_price')} 双口径，需运营统一后报价"),
                "reply": "这个档位的价格我需要和运营核对统一后再回复您，稍等帮您转人工确认，避免报错价格。",
            }
        if sku.get("stock") == "out_of_stock":
            return {
                "boundary_decision": "ab_deterministic_pricing → 缺货档，不报价不引导成交",
                "need_human": False,
                "matched_evidence": [f"sku_prices: {vname}×{dose} stock=out_of_stock"],
                "handoff_summary": "",
                "reply": f"{vname} {dose} 这个档位目前暂时缺货，没法下单哦，需要的话我帮您看其他有货档位。",
            }
        price = sku.get("list_price")
        unit = sku.get("unit", "件")
        reply = f"{vname} {dose} 表价 {price} 元/{unit}（价格以规则表为准）。"
        evidence = [f"sku_prices: {vname}×{dose} list_price={price}"]
        if ask_promo:
            promo = _match_promo(kb, vname)
            if promo:
                final = price - promo["discount"]
                reply += f" 当前「{promo['name']}」{promo['discount']} 元优惠，到手 {final} 元/{unit}。"
                evidence.append(f"promo_rules: {promo['id']} -{promo['discount']}")
        if version.get("integral_only"):
            reply += " （该版本只能整盒购买，不拆卖。）"
        return {
            "boundary_decision": "ab_deterministic_pricing → 单档查表命中",
            "need_human": False, "matched_evidence": evidence,
            "handoff_summary": "", "reply": reply,
        }

    # 版本已知、无明确档位 → 输出该版本价目表（确定性，不心算）
    rows, has_conflict = [], False
    for s in kb.get("sku_prices", []):
        if s.get("version") != vname:
            continue
        if s.get("stock") == "out_of_stock":
            rows.append(f"{s['dose']}：暂缺货")
        elif s.get("conflict"):
            rows.append(f"{s['dose']}：价格待运营统一")
            has_conflict = True
        else:
            rows.append(f"{s['dose']}：{s['list_price']} 元/{s.get('unit', '件')}")
    table = "；".join(rows)
    reply = f"{vname}各档位价格如下——{table}。"
    evidence = [f"sku_prices: {vname} 全档位"]
    if ask_promo:
        promo = _match_promo(kb, vname)
        if promo:
            reply += f" 另有「{promo['name']}」{promo['discount']} 元优惠。"
            evidence.append(f"promo_rules: {promo['id']}")
    if version.get("integral_only"):
        reply += " 该版本只能整盒购买，不拆卖。"
    return {
        "boundary_decision": "ab_deterministic_pricing → 版本价目表查表",
        "need_human": False, "matched_evidence": evidence,
        "handoff_summary": "", "reply": reply,
    }


def _match_promo(kb, vname):
    for p in kb.get("promo_rules", []):
        if p.get("validity") != "active":
            continue
        if p.get("version") in (None, vname):
            return p
    return None


def detect_manual_promo(msg):
    """识别规则库外的议价/组合优惠诉求。"""
    kws = ["优惠10", "优惠 10", "便宜点", "少点", "抹零", "送一", "买三", "打折",
           "能不能便宜", "再便宜", "议价", "1200", "80拿", "80 拿"]
    return any(k in msg for k in kws)


# ----------------------------- 阶段 5：知识应答 -----------------------------
def handle_authenticity(msg, kb):
    proofs = kb.get("authenticity_proofs", {}) or {}
    # 售后验真失败（异常路径）
    if any(k in msg for k in ["验不出", "验不了", "扫不出", "扫码根本", "货收到", "收到货", "验到是假", "是假的"]):
        return {
            "boundary_decision": "ab_authenticity_reply → 已收货验真失败异常，按退款承诺 + 转人工售后",
            "need_human": True,
            "matched_evidence": ["authenticity_proofs.refund_promise"],
            "handoff_summary": make_summary("收货后扫码验真失败，质疑真假",
                                            f"已告知退款承诺：{proofs.get('refund_promise', '')}",
                                            "需人工核实验真结果并处理退款/售后"),
            "reply": f"别急，按我们承诺——{proofs.get('refund_promise', '验出问题可退')}。我马上帮您转人工核实处理。",
        }
    # 索要监管凭据（禁止伪造）
    if any(k in msg for k in ["蓝帽子", "批准文号", "注册证", "质检"]):
        steps = "、".join(proofs.get("verify_steps", []))
        return {
            "boundary_decision": "ab_authenticity_reply → 监管凭据不可伪造，仅给可验证路径 + 转人工",
            "need_human": True,
            "matched_evidence": ["authenticity_proofs.forbidden"],
            "handoff_summary": make_summary("索要蓝帽子编号/批准文号等监管凭据",
                                            f"已提供可自行验证路径：{steps}",
                                            "监管编号类凭据不能由 AI 提供，需人工按合规口径对接"),
            "reply": f"这类编号我这边不能随便提供，但您可以自行验证：{steps}。其他需要我帮您转人工进一步说明。",
        }
    steps = "、".join(proofs.get("verify_steps", []))
    pack = "、".join(proofs.get("packaging", []))
    reply = f"可以放心，支持自行验真：{steps}。"
    if pack:
        reply += f"包装为{pack}。"
    if proofs.get("refund_promise"):
        reply += f"{proofs['refund_promise']}。"
    return {
        "boundary_decision": "ab_authenticity_reply → 正品说明（验真路径 + 退款承诺）",
        "need_human": False,
        "matched_evidence": ["authenticity_proofs.verify_steps"],
        "handoff_summary": "", "reply": reply,
    }


def handle_version(msg, kb):
    us = kb.get("usage_storage", {}) or {}
    # 使用口径问答
    if any(k in msg for k in ["打几次", "用多久", "几次", "怎么用", "用法", "多久用", "频率", "一针"]):
        return _wrap_version("使用口径（固定口径，不给个体化剂量建议）",
                             ["usage_storage.usage"], us.get("usage", ""))
    # 保存口径问答
    if any(k in msg for k in ["放冰箱", "冰箱", "冷藏", "保存", "存放", "冷冻", "保质"]):
        reply = f"{us.get('storage_unopened', '')}；{us.get('storage_opened', '')}"
        return _wrap_version("保存口径（未开封/已开封两段式）",
                             ["usage_storage.storage_unopened", "usage_storage.storage_opened"], reply)
    for ni in kb.get("not_in_scope", []):
        names = [ni.get("item", "")] + list(ni.get("aliases", []))
        if any(n and n in msg for n in names):
            return _wrap_version("命中 not_in_scope，不报价不引导代购",
                                 [f"not_in_scope: {ni.get('item')}"], ni.get("reply", ""))
    syn = kb.get("synonyms_note")
    if syn and any(k in msg for k in ["替c", "替C", "替尔", "泊肽", "成分", "一个东西", "替西帕肽"]):
        return _wrap_version("同义词归一", ["synonyms_note"], syn)
    # 珠峰定位
    for v in kb.get("product_versions", []):
        if v["name"] in msg and v.get("compare_note") and v["name"] == "珠峰":
            doses = "/".join(str(x) for x in v.get("doses", []))
            return _wrap_version("珠峰版本定位",
                                 [f"product_versions: {v['name']}"],
                                 f"{v['compare_note']}，仅有 {doses} 四档。")
    if any(k in msg for k in ["只买一支", "单买", "拆", "太多"]):
        return _wrap_version("拆盒诉求处理",
                             ["product_versions.integral_only"],
                             "日版礼来是一盒两支、不拆卖；如果想要一盒一支，可以考虑孟版杰西卡或珠峰。")
    # 版本对比
    lines = []
    for v in kb.get("product_versions", []):
        lines.append(f"{v['name']}（{v.get('package_desc', '')}/{v.get('product_form', '')}）")
    return _wrap_version("版本对比（不做疗效优劣断言）",
                         ["product_versions: 全部"],
                         "、".join(lines) + "。区别主要在包装、剂型和价格带，按您的预算和使用习惯选择即可。")


def _wrap_version(decision, evidence, reply):
    return {"boundary_decision": f"ab_authenticity_reply(版本) → {decision}",
            "need_human": False, "matched_evidence": evidence,
            "handoff_summary": "", "reply": reply}


def handle_fulfillment(msg, kb):
    fp = kb.get("fulfillment_payment", {}) or {}
    # 收到付款截图 / 承接超时
    if any(k in msg for k in ["截图", "付好了", "付款了", "已付", "付了"]):
        stalled = any(k in msg for k in ["没人", "没人理", "多久了", "40 分钟", "怎么没", "骗子"])
        if stalled:
            return {
                "boundary_decision": "ab_order_handoff → 承接超时 recovery，安抚 + 升级值班，不确认收款",
                "need_human": True,
                "matched_evidence": ["fulfillment_payment.screenshot_handoff"],
                "handoff_summary": make_summary("已付款但迟迟无人接管，情绪不满",
                                                "已安抚并说明客服正在加急处理",
                                                "需值班客服立即补接管并核对订单，AI 不能确认收款成功"),
                "reply": "非常抱歉让您久等，您的付款信息已收到，客服正在加急为您处理，马上安排接单核对，请再稍等一下～",
            }
        return {
            "boundary_decision": "ab_order_handoff → 收到付款截图，转人工复述核对（不确认收款）",
            "need_human": True,
            "matched_evidence": ["fulfillment_payment.screenshot_handoff"],
            "handoff_summary": make_summary("已发付款截图及收货信息",
                                            "已告知将由客服人工复述订单要素核对",
                                            "需人工核对姓名/电话/地址并确认收款，AI 不确认订单生效"),
            "reply": "已经收到您的付款信息啦～稍后客服会跟您复述一遍订单信息核对，确认无误后安排发货，请稍等。",
        }
    parts = []
    if any(k in msg for k in ["付款", "支付", "怎么付", "转账", "微信", "支付宝", "红包"]):
        parts.append(f"支持{('、'.join(fp.get('payment_methods', [])))}；{fp.get('payment_unavailable', '')}")
    if any(k in msg for k in ["从哪发", "发货", "多久到", "几天到", "快递", "物流", "多久"]):
        parts.append(f"{fp.get('shipping_origin', '')}发货，{fp.get('ship_time', '')}，{fp.get('delivery_time', '')}")
    if any(k in msg for k in ["运费", "包邮", "邮费", "冷链"]):
        parts.append(f"{fp.get('freight', '')}")
    if not parts:
        parts.append(f"{fp.get('shipping_origin', '')}发货，{fp.get('ship_time', '')}，{fp.get('delivery_time', '')}；{fp.get('freight', '')}")
    return {
        "boundary_decision": "ab_order_handoff → 支付/发货口径说明（不承诺具体到货日）",
        "need_human": False,
        "matched_evidence": ["fulfillment_payment"],
        "handoff_summary": "", "reply": "；".join(p for p in parts if p) + "。",
    }


# ----------------------------- 主流程 -----------------------------
def answer(msg, kb):
    intent, confidence, hits = classify(msg, kb)
    threshold = kb.get("routing", {}).get("confidence_threshold", 0.34)
    base = {"intent": intent, "confidence": confidence, "matched_keywords": hits}

    # 首响承接：无意图命中但为打招呼 → 欢迎语（ab_first_response，不转人工）
    if intent is None and any(g in msg for g in GREETINGS):
        base.update({
            "boundary_decision": "ab_first_response → 秒级欢迎语首响承接",
            "need_human": False,
            "matched_evidence": ["welcome_template"],
            "handoff_summary": "",
            "reply": kb.get("welcome_template", "您好，欢迎咨询～"),
        })
        return base

    # 低置信/未识别 → 转人工兜底
    if intent is None or confidence < threshold:
        base.update({
            "boundary_decision": "意图路由 → 低置信/知识盲区，保守答复并转人工",
            "need_human": True,
            "matched_evidence": [f"confidence={confidence} < {threshold}"],
            "handoff_summary": make_summary("问题超出当前知识库覆盖范围",
                                            "未硬答", "需人工确认后回复"),
            "reply": "这个问题我这边暂时没法准确回答，帮您转人工进一步确认，请稍等。",
        })
        return base

    if intent == "handoff":
        base.update({
            "boundary_decision": "handoff → 客户点名人工，停止实质作答并附摘要转接",
            "need_human": True,
            "matched_evidence": [f"handoff 关键词：{hits}"],
            "handoff_summary": make_summary("客户明确要求转人工/表达不信任",
                                            "已确认为其转接人工",
                                            "需人工尽快接管承接后续咨询"),
            "reply": "好的，已经帮您转接人工客服，马上为您跟进，请稍等～",
        })
        return base

    if intent == "risk":
        base.update(handle_risk(msg, kb)); return base

    if intent == "pricing":
        if detect_manual_promo(msg):
            base.update({
                "boundary_decision": "ab_deterministic_pricing → 规则库外议价/组合优惠，不承诺减免转人工",
                "need_human": True,
                "matched_evidence": ["promo_rules: 无匹配 / manual_only_promos"],
                "handoff_summary": make_summary("提出规则库外的议价或组合优惠诉求",
                                                "已说明当前有效活动口径，未承诺额外减免",
                                                "是否额外优惠需人工客服决定"),
                "reply": "额外的优惠我这边不能自己做主哦，当前活动是规则表内的口径，其他优惠帮您转人工由客服确认。",
            })
            return base
        base.update(handle_pricing(msg, kb)); return base

    if intent == "authenticity":
        base.update(handle_authenticity(msg, kb)); return base
    if intent == "version":
        base.update(handle_version(msg, kb)); return base
    if intent == "fulfillment_payment":
        base.update(handle_fulfillment(msg, kb)); return base

    base.update({"boundary_decision": "未路由", "need_human": True,
                 "matched_evidence": [], "handoff_summary": "", "reply": "帮您转人工。"})
    return base


def extract_customer_msg(raw_input):
    """从测试用例 input 中抽取客户可见文本（含上下文关键词）。"""
    lines = [l.strip() for l in str(raw_input).splitlines() if l.strip()]
    kept = []
    for l in lines:
        for prefix in ("客户:", "客户：", "上下文:", "上下文：", "渠道:", "渠道："):
            if l.startswith(prefix):
                l = l[len(prefix):].strip()
                break
        kept.append(l)
    return " ".join(kept)


# ----------------------------- 回归 -----------------------------
HUMAN_KWS = ["转人工", "转接", "工单", "人工复述", "人工客服", "值班客服", "升级", "转人工处理", "handoff", "transfer"]


def expects_human(case):
    text = (str(case.get("expected_output", "")) + " " + str(case.get("expected_intermediate", "")))
    return any(k in text for k in HUMAN_KWS)


def replay(kb, cases):
    total = len(cases)
    passed = 0
    print(f"\n{'='*72}\n回归测试：共 {total} 条用例\n{'='*72}")
    for case in cases:
        cid = case.get("id", "?")
        msg = extract_customer_msg(case.get("input", ""))
        res = answer(msg, kb)
        checks, ok = [], True

        # 断言 1：转人工判定与预期一致（核心行为契约）
        exp_h = expects_human(case)
        c1 = (res["need_human"] == exp_h)
        checks.append(("need_human", c1, f"期望={exp_h} 实际={res['need_human']}"))
        ok = ok and c1

        exp_out = str(case.get("expected_output", ""))
        exp_mid = str(case.get("expected_intermediate", ""))

        # 断言 2：缺货类必须说明缺货、不报价
        if "缺货" in exp_out or "缺货" in exp_mid:
            c2 = "缺货" in res["reply"]
            checks.append(("缺货说明", c2, res["reply"][:30]))
            ok = ok and c2

        # 断言 3：价格类单档命中，回复须含规则表价格数字
        if res["intent"] == "pricing" and res["boundary_decision"].endswith("单档查表命中"):
            num = re.search(r"表价 (\d+)", res["reply"])
            c3 = num is not None
            checks.append(("价格数字", c3, res["reply"][:40]))
            ok = ok and c3

        # 断言 4：risk 类 transfer / safe_reply 模式与预期一致
        if res["intent"] == "risk":
            if "transfer" in exp_mid:
                c4 = res["need_human"] is True
                checks.append(("risk=transfer", c4, res["boundary_decision"][:50]))
                ok = ok and c4
            elif "safe_reply" in exp_mid:
                c4 = res["need_human"] is False
                checks.append(("risk=safe_reply", c4, res["boundary_decision"][:50]))
                ok = ok and c4

        status = "✅ PASS" if ok else "❌ FAIL"
        if ok:
            passed += 1
        print(f"\n[{cid}] {status}  {case.get('scenario', '')}")
        print(f"    Q: {msg[:60]}")
        print(f"    → intent={res['intent']} conf={res['confidence']} need_human={res['need_human']}")
        print(f"    → {res['boundary_decision']}")
        if not ok:
            for name, passed_c, detail in checks:
                if not passed_c:
                    print(f"    ✗ 断言[{name}] 失败：{detail}")
    rate = passed / total * 100 if total else 0
    print(f"\n{'='*72}")
    print(f"通过率：{passed}/{total} = {rate:.1f}%")
    print(f"{'='*72}\n")
    return passed, total


# ----------------------------- CLI -----------------------------
def main():
    ap = argparse.ArgumentParser(description="私域售前问答确定性引擎")
    ap.add_argument("kb", help="知识库 YAML 路径")
    ap.add_argument("--ask", help="单问作答")
    ap.add_argument("--replay", help="测试用例集 YAML 路径")
    args = ap.parse_args()

    kb = load_yaml(args.kb)

    if args.ask:
        res = answer(args.ask, kb)
        print(f"\nQ: {args.ask}")
        print(f"intent          : {res['intent']} (conf={res['confidence']})")
        print(f"matched_keywords: {res.get('matched_keywords')}")
        print(f"matched_evidence: {res['matched_evidence']}")
        print(f"boundary_decision: {res['boundary_decision']}")
        print(f"need_human      : {res['need_human']}")
        if res["handoff_summary"]:
            print(f"handoff_summary :\n{res['handoff_summary']}")
        print(f"\nreply           : {res['reply']}\n")
    elif args.replay:
        data = load_yaml(args.replay)
        cases = data.get("test_cases", []) if isinstance(data, dict) else data
        replay(kb, cases)
    else:
        print("请提供 --ask 或 --replay")


if __name__ == "__main__":
    main()

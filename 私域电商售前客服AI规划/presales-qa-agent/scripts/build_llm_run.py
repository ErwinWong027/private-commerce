#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_llm_run.py — LLM 真实运行记录 → HTML

本脚本由 LLM 在 IDE 内驱动：
  1. LLM 已对 15 个代表性场景完成语义识别 + 话术生成（话术硬编码在 SCENES 中）
  2. 脚本实时调用 answer_engine.py 的工具函数，获取确定性数据（价格/合规/库存）
  3. 生成 HTML，展示每轮的：客户消息 → LLM语义识别 → 工具调用+返回JSON → LLM话术

浏览器看到的是 LLM 真实输出 + 工具真实返回，非 JS 模拟。

用法：
  python3 build_llm_run.py <kb.yaml> <output.html>
"""
import sys
import os
import json
import argparse
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import answer_engine as ae


# ════════════════════════════════════════════════════════════════
# 场景数据：LLM 已完成语义识别 + 话术生成
#   tool / tool_params 不为 None 时，脚本实时调用工具函数获取返回值
#   reply 为 LLM 基于工具返回值生成的真实话术
# ════════════════════════════════════════════════════════════════
SCENES = [
    {
        "customer": "在吗？",
        "intent": "greeting",
        "reasoning": "客户打招呼首响，语义为问候/确认在线",
        "tool": None, "tool_params": None,
        "reply": "哈喽～欢迎添加，专注替西帕肽正品渠道，规格齐全、价优靠谱，支持一对一用量指导，有需要随时滴滴我～",
        "need_human": False, "summary": "",
    },
    {
        "customer": "你是机器人吗？",
        "intent": "identity",
        "reasoning": "客户询问身份，语义指向'是否机器人'，客户视角=真人客服",
        "tool": None, "tool_params": None,
        "reply": "我是您的专属客服，专注替西帕肽正品渠道，规格齐全、价优靠谱，有什么可以帮您的吗？",
        "need_human": False, "summary": "",
    },
    {
        "customer": "日版 2.5 多少钱一盒？",
        "intent": "pricing",
        "reasoning": "客户询问价格，语义识别到版本=日版礼来、剂量=2.5",
        "tool": "price", "tool_params": {"version": "日版", "dose": "2.5"},
        "reply": "日版2.5是498元一盒哦～这个版本是一盒两支、整盒销售的，不拆卖。需要帮您看其他档位吗？",
        "need_human": False, "summary": "",
    },
    {
        "customer": "孟版 5.0 有活动吗？到手多少？",
        "intent": "pricing",
        "reasoning": "客户询问价格+优惠，识别到版本=孟版杰西卡、剂量=5.0、问优惠→调promo工具",
        "tool": "promo", "tool_params": {"version": "孟版", "dose": "5.0", "quantity": 1},
        "reply": "孟版5.0现在表价270元一支，618活动减20，到手250元一支哦～需要帮您看其他档位吗？",
        "need_human": False, "summary": "",
    },
    {
        "customer": "上次你们客服给我优惠了10，这次也一样吧？",
        "intent": "pricing",
        "reasoning": "客户引用人工历史优惠要求同样优惠，属议价诉求→先调manual_promo检测",
        "tool": "manual_promo", "tool_params": {"msg": "优惠了10"},
        "reply": "额外的优惠我这边不能自己做主哦，当前活动是规则表内的口径，其他优惠我帮您确认一下，请稍等。",
        "need_human": True,
        "summary": "【客户关注点】引用人工历史优惠10要求同样优惠\n【已答内容】已说明当前活动口径，未承诺额外减免\n【未解决问题】是否额外优惠需人工客服决定",
    },
    {
        "customer": "日版 15 的有货吗？多少钱？",
        "intent": "pricing",
        "reasoning": "客户询问价格+库存，识别到版本=日版礼来、剂量=15→调price工具",
        "tool": "price", "tool_params": {"version": "日版", "dose": "15"},
        "reply": "日版15这个档位目前暂时缺货，没法下单哦，需要的话我帮您看其他有货档位。",
        "need_human": False, "summary": "",
    },
    {
        "customer": "珠峰 12.5 多少钱？",
        "intent": "pricing",
        "reasoning": "客户询问价格，识别到版本=珠峰、剂量=12.5→调price工具",
        "tool": "price", "tool_params": {"version": "珠峰", "dose": "12.5"},
        "reply": "珠峰没有12.5这个档位哦，实际只有2.5/5.0/7.5/10四档，需要我帮您看哪一档？",
        "need_human": False, "summary": "",
    },
    {
        "customer": "打这个一个月能瘦多少斤？保证有效吗？",
        "intent": "risk",
        "reasoning": "涉及效果承诺（瘦多少/保证有效），风险优先级最高→调compliance工具",
        "tool": "compliance", "tool_params": {"msg": "一个月能瘦多少斤保证有效吗"},
        "reply": "每个人的情况不一样，没办法承诺具体能瘦多少或多久见效，效果因人而异，具体以产品说明和个人使用情况为准哦。",
        "need_human": False, "summary": "",
    },
    {
        "customer": "我有糖尿病，这个能降血糖吗？能不能代替我在吃的药？",
        "intent": "risk",
        "reasoning": "涉及疾病治疗（降血糖/替代药物），风险优先级最高→调compliance工具",
        "tool": "compliance", "tool_params": {"msg": "能降血糖吗能代替药吗"},
        "reply": "这类和疾病、用药相关的问题我不能直接给结论，建议您遵医嘱哦。我帮您确认一下，稍等～",
        "need_human": True,
        "summary": "【客户关注点】涉及疾病治疗（降血糖/替代药物）\n【已答内容】已建议遵医嘱，未回应治疗功能\n【未解决问题】需人工按合规口径对接疾病治疗类咨询",
    },
    {
        "customer": "我怀孕三个月，也想用这个减重，怎么买？",
        "intent": "risk",
        "reasoning": "客户自述孕期，命中禁忌人群，风险优先级最高→调compliance工具",
        "tool": "compliance", "tool_params": {"msg": "我怀孕了能用吗"},
        "reply": "您提到正在孕期，这种情况属于禁忌/慎用人群，不建议自行使用哦，需要遵医嘱。我帮您确认一下具体情况，稍等～",
        "need_human": True,
        "summary": "【客户关注点】自述属禁忌人群「怀孕」仍希望购买\n【已答内容】已按固定口径说明该人群为禁忌/慎用\n【未解决问题】是否可购买需人工按医嘱判断，不由AI推进成交",
    },
    {
        "customer": "你们这个是正品吗？怎么验？",
        "intent": "authentic
---
title: 私域售前业务本体与状态流
description: 依据业务本体设计抽取出的核心实体、边界与工作流定义，口径与双端 Demo 实现对齐。
category: 设计文档
doc_type: 设计文档
---

# 私域售前业务本体与状态流

> 本文是本体的正本，口径以双端 Demo（`私域电商微信企微双端Demo`）的实际实现为准。
> 标注「规划中」的条目表示本体已定义、代码尚未落地。

## 核心实体

| 实体 | 作用 | 实现对应 |
| --- | --- | --- |
| `customer_session` | 客户在企微中的 1v1 咨询会话 | `sessions` 表 |
| `inquiry_intent` | 每轮消息的意图分类与分流结果 | `IntentPlan` / `decisions` 表 |
| `product_version` | 日版礼来、孟版杰西卡、珠峰三大版本 | 知识库 YAML |
| `sku_spec` | 版本 x 剂量 x 价格 x 库存的确定性规则表 | 知识库 YAML |
| `promo_rule` | 618 等结构化促销规则 | 知识库 YAML |
| `authenticity_proof` | 正品凭据与验真路径 | 知识库 YAML |
| `compliance_whitelist` | 敏感风险白名单话术 | 知识库 YAML |
| `handoff_ticket` | 转人工与付款承接工单 | `handoff_tickets` 表 |
| `order_intake` | 付款截图后的人工作业承接流 | `deal_states` 表 + 企微侧推进按钮 |
| `deal_state` | 单会话的成交进度与模拟运单号 | `deal_states` 表 |
| `agent_operator` | 人工客服「小禾」`U-AGENT-001`，是所有事实性确认动作的唯一执行者 | `users` 表 role=agent |
| `pilot_metric` | 消息量、AI 回复量、转人工量等演示指标 | `metrics` 表 |
| `media_asset` | 语音/图片素材的来源、类型、识别文本、置信度、是否已人工确认（规划中） | 待建 `media_assets` 表 |

### `customer_session` 状态枚举

`ai_serving | human_serving | closed`

### `inquiry_intent` 分流维度

| 维度 | 取值 | 说明 |
| --- | --- | --- |
| `intent` | greeting / identity / handoff / risk / fulfillment_payment / pricing / authenticity / version / unknown | 主意图 |
| `subIntent` | 如 `payment_methods` / `payment_completed` / `delivery_time` / `shipping_origin` | 决定工具参数与阶段推进 |
| `sentenceType` | question / non_question | 非疑问句不触发转人工 |
| `hasQuestionSignal` | 确定性兜底 | 消息含疑问信号时把 `non_question` **只升不降**地升格为 `question` |
| 风险维度 | `RiskContextAnalysis` 的已知/缺失维度 | 仅 compliance 工具命中时计算 |

### `pilot_metric` 口径

当前 `metrics` 表只有三个累计计数：`total_messages`、`ai_replies`、`handoffs`。

派生指标为**演示口径**，分子分母量纲不同，不可作为业务结论：

- `handoffRate` = `handoffs` / `total_messages`（工单数 ÷ 消息数）
- `conversionRate` = 已核对订单数 ÷ 消息数

正式口径应改为会话级分母（工单数 ÷ 会话数、成交会话数 ÷ 会话数）。

### `authenticity_proof` 与 `order_intake` 的证据来源

两者的证据可来自 `media_asset`（如付款截图 OCR、商品图识别），但**确认动作仍归 `agent_operator`**，识别结果本身不构成事实。

## 行动边界

### `ab_first_response`
- 客户进线必须秒级首响
- 首轮欢迎语不得即兴承诺优惠或效果

### `ab_authenticity_reply`
- 只能输出知识库内的验真路径
- 禁止编造蓝帽子编号、批准文号、注册证书等监管信息

### `ab_deterministic_pricing`
- 所有价格与活动必须由规则表和促销规则计算
- 规则库外议价只能转人工

### `ab_risk_compliance`
- 敏感功效问题只能输出白名单话术
- 治疗、替代药物、禁忌自述直接收口并转人工

### `ab_order_handoff`
- 收到付款截图只代表待核对，不代表订单成立
- 人工复述核对后才进入发货承接

### `ab_stage_discipline`
- 话术中的既成事实措辞必须与 `deal_state.stage` 匹配，由 `enforceReplyDiscipline` 硬校验
- 三条红线：`payment_confirmed`（收款成功类）不得早于「待出单」；`shipment_declared`（已发货/单号已出类）不得早于「待揽收」；`pickup_declared`（已揽收/已取件类）不得早于「已揽收」
- 发货与时效类提问一律按当前真实阶段改写话术（T02 防跳步），不允许模型自由表达
- 命中红线时用阶段安全话术整段覆盖，只承接、不宣布任何未发生的事实

### `ab_media_extraction`（规划中）
- 只产出提取结果与提示，**不产出成交事实、不推进 `dealStage`**
- 识别文本落在人工可见区，不直接回给客户
- 付款截图的金额/时间提取结果必须由 `agent_operator` 确认后才生效

## 工作流

### 售前应答流 `ws_presales_reply`

`s_media_normalize（规划中） -> s_incoming -> s_intent_routing -> s_kb_answering -> s_stage_gate -> s_answered`

对应 `presalesGraph.ts` 的 `START → orchestrate → (humanBranch | stageGate) → END`：

| 步骤 | 说明 |
| --- | --- |
| `s_media_normalize` | 非文本消息先归一化为文本 + 结构化字段（规划中） |
| `s_incoming` | 消息入库、历史截取最近 6 轮 |
| `s_intent_routing` | LLM 产出 `IntentPlan`，叠加确定性兜底 |
| `s_kb_answering` | 跨进程调用 `answer_engine.py` 取确定性事实，再受约束生成话术 |
| `s_stage_gate` | 阶段校验与红线拦截，计算客户侧确定性推进 |
| `s_answered` | 落库决策与 trace |

人工诉求（`needHuman`）分流到 `s_handoff`；该分支不改写话术，但进度推进仍走同一套确定性规则。

### 下单承接流 `ws_order_intake`

7 态，与 `DEAL_STAGE_ORDER` 一致：

| 阶段 | 中文 | 推进权归属 |
| --- | --- | --- |
| `consulting` | 咨询中 | AI 可推进 |
| `awaiting_payment` | 待付款 | AI 可推进（`subIntent=payment_methods`） |
| `awaiting_review` | 待核对 | AI 可推进（`subIntent=payment_completed`），**AI 推进上限** |
| `awaiting_shipment` | 待出单 | 仅人工（`confirm_review`） |
| `awaiting_pickup` | 待揽收 | 仅人工（`generate_tracking`） |
| `picked_up` | 已揽收 | 仅人工（`simulate_pickup`） |
| `in_transit` | 运输中 | 仅人工（`simulate_transit`） |

两条硬规则：

1. `nextStageFromCustomer` 仅在 `fulfillment` 工具命中时推进，且只能前进、上限锁在 `awaiting_review`
2. 其后的每一步必须由 `applyManualAdvance` 执行，且严格按顺序，跨阶段一律拒绝

异常恢复：`o_intake_stalled -> awaiting_review`（付款后无人接管时触发安抚与升级）

### 试点守护流 `ws_pilot_guard`

`p_piloting -> p_scale_up / p_rollback`

## 本期补强项

为了覆盖测试集中已出现的复杂情况，Demo 额外补了三个能力：

1. 售后外溢兜底：扫码验真失败时按退款承诺处理
2. 健康自述承接：禁忌人群信息在跨轮场景下继续生效
3. 承接超时恢复：付款后无人接管时触发安抚与升级

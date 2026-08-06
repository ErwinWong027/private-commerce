---
title: 私域售前业务本体与状态流
description: 依据业务本体设计抽取出的核心实体、边界与工作流定义。
category: 设计文档
doc_type: 设计文档
---

# 私域售前业务本体与状态流

## 核心实体

| 实体 | 作用 |
| --- | --- |
| `customer_session` | 客户在企微中的 1v1 咨询会话 |
| `inquiry_intent` | 每轮消息的意图分类结果 |
| `product_version` | 日版礼来、孟版杰西卡、珠峰三大版本 |
| `sku_spec` | 版本 x 剂量 x 价格 x 库存的确定性规则表 |
| `promo_rule` | 618 等结构化促销规则 |
| `authenticity_proof` | 正品凭据与验真路径 |
| `compliance_whitelist` | 敏感风险白名单话术 |
| `handoff_ticket` | 转人工与付款承接工单 |
| `order_intake` | 付款截图后的人工作业承接流 |
| `pilot_metric` | 自动接待率、转人工率、错价等指标 |

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

## 工作流

### 售前应答流 `ws_presales_reply`

`s_incoming -> s_intent_routing -> s_kb_answering -> s_answered`

异常时进入：

`s_handoff`

### 下单承接流 `ws_order_intake`

`o_price_confirmed -> o_awaiting_payment -> o_screenshot_received -> o_manual_verified`

异常恢复：

`o_intake_stalled -> o_manual_verified`

### 试点守护流 `ws_pilot_guard`

`p_piloting -> p_scale_up / p_rollback`

## 本期补强项

为了覆盖测试集中已出现的复杂情况，Demo 额外补了三个能力：

1. 售后外溢兜底：扫码验真失败时按退款承诺处理
2. 健康自述承接：禁忌人群信息在跨轮场景下继续生效
3. 承接超时恢复：付款后无人接管时触发安抚与升级


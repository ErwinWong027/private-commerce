# 六类意图路由规则

意图路由是五阶段流水线的第一阶段。引擎按下述词典对客户消息判类，命中词条累加得到置信度；**风险类命中时置信度加权，优先级高于其他所有意图**。

## 路由优先级（从高到低）

```
1. handoff   （点名人工/投诉）—— 直接转人工
2. risk      （效果/治疗/副作用/禁忌）—— 走合规红线闸
3. fulfillment_payment（付款截图/支付/发货）
4. pricing   （价格/优惠/运费）
5. authenticity（正品/验真）
6. version   （版本/成分）
```

> 规则：当一条消息同时命中 `risk` 与其他意图时，**一律按 `risk` 处理**（例如"孟版 5.0 能治糖尿病吗"既像 pricing 又是 risk，判为 risk）。当命中 `handoff` 关键词时，无条件转人工。

## 关键词词典

| 意图 | 关键词（子串匹配） |
|------|-------------------|
| `handoff` | 转人工、人工、真人、客服接、投诉、不放心、骗子、别发自动 |
| `risk` | 瘦多少、瘦几斤、多久见效、保证、效果、有没有用、治疗、治病、降血糖、血糖、代替药、替代药、副作用、恶心、孕妇、备孕、怀孕、哺乳、甲状腺、胰岛素、禁忌、能不能用 |
| `fulfillment_payment` | 付款、支付、怎么付、转账、微信、支付宝、红包、发货、从哪发、多久到、几天到、快递、物流、运费、包邮、邮费、付好了、截图、下单、地址 |
| `pricing` | 多少钱、价格、几块、什么价、报价、优惠、活动、便宜、折扣、减、到手、一支多少、一盒多少、买几、几支、几盒 |
| `authenticity` | 正品、真的假的、真假、验、验真、扫码、假货、退款、退货、蓝帽子、批准文号、注册证 |
| `version` | 版本、日版、孟版、珠峰、区别、哪个好、成分、替尔、替C、替西帕肽、泊肽、原研、仿制、自动笔、针剂、拆、整盒、穆峰达、国版 |

## 置信度计算

- 每命中一个关键词计 `+1` 命中分。
- `risk` 类命中权重 `×1.5`（确保风险优先抢占）。
- 归一化 `confidence = min(1.0, 命中分 / 2.0)`。
- 若最高分意图的 `confidence < 0.34`（约等于一个弱命中），判为**低置信 → 转人工**。
- 全部未命中：判为低置信，转人工兜底。

## 与行动边界的映射

| 意图 | 对应行动边界 | 关键约束 |
|------|-------------|----------|
| `version` | ab_authenticity_reply（版本对比部分） | 不做疗效优劣断言 |
| `authenticity` | ab_authenticity_reply | 凭据只来自知识库，禁伪造监管编号 |
| `pricing` | ab_deterministic_pricing | 只查表，缺货/冲突转人工 |
| `risk` | ab_risk_compliance | 白名单 safe_reply / transfer |
| `fulfillment_payment` | ab_order_handoff | 收截图转人工，不越权确认 |
| `handoff` | （直接触发 handoff_ticket） | 附三段式摘要 |
| `unknown + non_question` | ab_kb_fallback（轻承接分支） | 轻承接 + 引导回业务，不触发转人工 |

## sentenceType 分流（疑问句 vs 非疑问句）

意图识别同时输出 `sentenceType`（`question` / `non_question`），用于区分"真疑问句的知识盲区"与"确认/闲聊/无效输入"，避免把非疑问句一律当低置信转人工：

| sentenceType | 语义 | 未命中工具时的处理 | need_human |
|---|---|---|---|
| `question` | 提问、求证、咨询（含省略式提问、反问） | 保守答复 + 转人工（知识盲区兜底） | true |
| `non_question` | 陈述、确认（"好的/可以滴"）、闲聊、情绪宣泄、无意义输入 | 轻承接 + 引导回业务（知识库 `chitchat_non_question_reply` 口径） | false |

**确定性疑问信号兜底（只升不降）**：编排层对 LLM 的 `sentenceType` 做确定性校验——若判为 `non_question` 但消息含 `?？` 或疑问词（吗/嘛/呢/怎么/怎样/多少/几个/几支/几盒/几天/啥时候/为什么/为啥/能不能/可不可以/是不是/有没有/好不好/行不行/要不要/哪里/哪个/哪种/哪年/哪天/哪位），则升格为 `question`。该兜底只会让处理更保守，不会放过真疑问句。

**与优先级规则的关系**：sentenceType 不改变意图路由优先级（handoff > risk > fulfillment_payment > pricing > authenticity > version）；handoff/risk 命中时无论 sentenceType 一律按对应边界处理。sentenceType 只在"无明确业务意图（unknown）或工具未成功调用"的兜底路径上生效。

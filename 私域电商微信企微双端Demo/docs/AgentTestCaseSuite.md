# 私域售前 Demo 测试套件说明

## 实际路径与执行方式

自动化售前回归用例的实际源文件与执行入口为：

- 用例定义：`src/server/presalesTestCases.ts`（当前 41 条，C-001~C-040，含 C-013A）
- 一键回归 API：`src/app/api/test/run/route.ts`，页面 `/agentic` 调用该入口并逐条走 `runPresalesGraph`
- 命令行集成测试：`tests/*.test.ts`
- 测试报告输出：`tests/reports/presales-demo-report.md`（运行一键回归后生成）

不要再使用已失效的 `src/lib/presalesTestCases.ts` 或 `src/lib/presalesEngine.test.ts` 路径；它们属于旧版单端实现的路径。

在 `私域电商微信企微双端Demo` 目录执行：

```bash
npm test
```

`npm test` 实际执行 `tsx --test tests/**/*.test.ts`，覆盖 API、仓储、人工接管、交易阶段、多模态图片/语音与媒体安全等集成测试；它不会调用需要身份令牌的 `/api/test/run`，也不会自动执行 `presalesTestCases.ts` 的 41 条售前回归。售前用例回归请登录 Demo 后点击“**一键回归 41 条用例**”，或由已认证客户端调用 `POST /api/test/run`。

## 覆盖范围

- 首响欢迎语、身份确认、版本对比与商品范围边界
- 正品验真与退款承诺、SKU 报价与活动算价
- 发货、支付、运费、付款截图承接与人工接管
- 敏感功效、治疗、禁忌人群与监管凭据红线
- 知识盲区、缺货/不存在规格、支付边界与承接超时
- 图片/语音上传、签名媒体 URL、图片识别安全回退
- 客户/客服身份鉴权与非法请求拒绝

## 用例分布

| 类型 | 条数 | 占比 |
| --- | ---: | ---: |
| Golden Path | 20 | 49% |
| Hard Case | 13 | 32% |
| Edge Case | 8 | 20% |
| 合计 | 41 | 100% |

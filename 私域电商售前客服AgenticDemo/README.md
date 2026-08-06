# 私域电商售前客服 Agentic Demo

这是基于 `AgenticAITemplate-main` 重构出的私域电商售前客服完整演示项目，核心目标是把以下 5 类业务材料收敛为一套可运行 Demo：

- 测试用例集
- 产品画布
- 原售前问答 Demo
- 售前问答知识库 YAML
- 业务本体设计

## 项目特点

- 保留“价格只走规则表、合规只走白名单”的硬约束
- 支持版本对比、正品验真、促销算价、支付履约、付款承接
- 支持点名人工、禁忌人群、治疗问题、监管编号诱导等高风险场景
- 内置 31 条自动化回归测试
- 文档中心可直接预览架构、业务本体、验收矩阵和测试报告

## 本地启动

```bash
npm install
npm run dev
```

打开：

`http://localhost:3000`

## DeepSeek 接入说明

项目已支持通过服务端代理接入 DeepSeek 流式对话，默认读取本地环境变量：

```bash
FOUNDATION_MODEL_PROVIDER=deepseek
FOUNDATION_MODEL_API_KEY=你的密钥
FOUNDATION_MODEL_BASE_URL=https://api-gateway.openagents.org/v1
FOUNDATION_MODEL_NAME=deepseek-v4-pro
```

- 建议把以上配置写入 `.env.local`
- 前端不会直接暴露 API 密钥
- 页面中的“**DeepSeek 实时对话**”区域会调用 `/api/model-chat` 并逐段渲染流式回复
- 现有售前问答主链路仍由规则引擎兜底，避免价格、合规等确定性逻辑被模型越权覆盖

## 自动化测试

方式一：在页面点击“**一键回归 31 条用例**”

方式二：

```bash
curl -X POST http://localhost:3000/api/test/run
```

测试结果会落到：

`tests/reports/presales-demo-report.md`

## 目录说明

- `src/app/page.tsx`：Demo 首页
- `src/app/api/chat/route.ts`：对话编排接口
- `src/lib/presalesKnowledge.ts`：结构化知识库常量
- `src/lib/presalesEngine.ts`：售前规则引擎
- `src/lib/presalesStore.ts`：内存态演示存储
- `src/lib/presalesTestCases.ts`：31 条自动化测试用例
- `docs/`：沉淀后的产品、架构、验收与部署文档

## 当前限制

- 当前是本地 Demo 方案，状态存储使用内存
- 未接真实企微 API、真实支付、真实库存系统
- 大模型已接入实时对话能力，但正式生产环境仍建议补充调用审计、限流与敏感场景兜底

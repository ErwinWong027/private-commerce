# 私域电商微信 / 企业微信双端 Demo

独立的 Next.js 16 + React 19 + TypeScript 演示项目。它提供客户微信风格桌面端与客服企业微信风格工作台，共享 SQLite 会话、AI 决策和转人工工单。所有登录与客户端界面均为模拟演示，不是微信或企业微信官方客户端，也不连接真实账号。

## 启动

要求 Node.js 26（使用内置 `node:sqlite`）和可运行 `answer_engine.py` 的 Python 3 环境。Python 需已安装 PyYAML。

```bash
npm install
cp .env.example .env.local
# 填写 FOUNDATION_MODEL_API_KEY
npm run dev
```

默认地址为 `http://localhost:3001`。`/` 会跳转至 `/customer`，客服端为 `/agent`。

环境变量：

- `FOUNDATION_MODEL_PROVIDER`：`google`、`openai`、`deepseek` 或 `moonshot`
- `FOUNDATION_MODEL_API_KEY`：模型密钥（必填；缺失时 API 返回明确配置提示）
- `FOUNDATION_MODEL_BASE_URL`：OpenAI 兼容接口基址
- `FOUNDATION_MODEL_NAME`：模型名称

仓库不包含 `.env.local` 或任何密钥。

## 架构

- `src/app`：双端页面及 REST API
- `src/components/Portal.tsx`：角色隔离的模拟登录、1 秒轮询、聊天和工单交互
- `src/server/repository.ts`：SQLite schema、seed、参数绑定查询和事务写入
- `src/server/conversationService.ts`：会话服务和 AI / 人工模式路由
- `src/server/presalesOrchestrator.ts`：LLM 意图识别 → Python 确定性工具 → TypeScript 边界判定 → 受约束话术

SQLite 文件位于 `data/presales-demo.db`，运行时文件已加入 `.gitignore`。预置客户为“林女士”，客服为“小禾”，初始会话为 `S-001`。

编排器只读调用相邻规划项目中的单一事实源：

- `../私域电商售前客服AI规划/presales-qa-agent/scripts/answer_engine.py`
- `../私域电商售前客服AI规划/私域电商售前客服-售前问答知识库.yaml`

本项目与 `私域电商售前客服AgenticDemo`、`私域电商售前客服AI规划` 隔离，不修改它们的文件。

## 双端演示流程

1. 在“客户微信”模拟扫码登录并发送咨询；AI 服务会保存客户消息、决策、回复与必要工单。
2. 在“客服企业微信”以独立登录状态进入，可查看客户资料、决策摘要和工单。
3. 接管工单后会话进入 `human_serving`，客户消息只持久化、不调用 AI；客服可人工回复。
4. 解决工单后恢复 `ai_serving`，后续客户消息重新进入 Agentic 链路。
5. 客服侧“重置 Demo”可恢复 seed 数据。

## 验证

```bash
npm run lint
npm test
npm run build
```

测试覆盖 repository 初始化、消息顺序、事务性决策/工单写入、接管恢复，以及登录 API 的输入边界。

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
- `PRESALES_UPLOAD_DIR`：图片上传目录（可选，默认 `data/uploads`；相对路径在启动时解析为绝对路径并缓存）
- `PRESALES_DB_PATH`：SQLite 文件路径（可选，默认 `data/presales-demo.db`）
- `PRESALES_SESSION_SECRET`：身份令牌签名密钥（生产环境必填，缺失时启动即报错；开发环境回退到内置默认值）
- `FOUNDATION_VISION_MODEL_NAME` / `FOUNDATION_VISION_API_KEY` / `FOUNDATION_VISION_BASE_URL`：视觉模型（可选，留空则复用基础模型凭据）
- `PRESALES_SKILL_ROOT` / `PRESALES_KNOWLEDGE_BASE`：售前技能与知识库路径（可选，见下文「架构」）

仓库不包含 `.env.local` 或任何密钥。

## 架构

- `src/app`：双端页面及 REST API
- `src/components/Portal.tsx`：角色隔离的模拟登录、1 秒轮询、聊天、工单与「当前成交进度」交互
- `src/server/repository.ts`：SQLite schema、seed、参数绑定查询和事务写入（含按会话保存的轻量成交状态）
- `src/server/conversationService.ts`：会话服务和 AI / 人工模式路由
- `src/server/presalesGraph.ts`：真实的 TypeScript LangGraph 编排（`@langchain/langgraph`），把现有售前编排作为可复用节点，串联「售前编排 → 阶段校验 → 正常回复 / 人工分支」
- `src/server/presalesOrchestrator.ts`：LLM 意图识别 → Python 确定性工具 → TypeScript 边界判定 → 受约束话术
- `src/server/dealStage.ts`：轻量成交进度状态机、话术红线与 T02 防跳步校验（纯逻辑，不依赖大模型）

成交进度仅供 Demo 演示，非真实订单 / 物流系统，阶段为：`咨询中 → 待付款 → 待核对 → 待出单 → 待揽收 → 已揽收 → 运输中`。客户消息最多把进度自动推进到「待核对」，其余靠客服侧按钮推进；付款、出单、揽收等既成事实一律由固定规则控制，大模型不能自行宣布。

SQLite 文件位于 `data/presales-demo.db`，上传图片位于 `data/uploads/`，两者均为运行时产物且已加入 `.gitignore`。预置客户为“林女士”，客服为“小禾”，初始会话为 `S-001`。

编排器只读调用规划项目中的单一事实源，路径由环境变量提供（留空则回退到相邻的 `../私域电商售前客服AI规划`）：

- `PRESALES_SKILL_ROOT`：技能根目录，内含 `references/agent_system_prompt.md` 与 `scripts/answer_engine.py`
- `PRESALES_KNOWLEDGE_BASE`：售前问答知识库 YAML 文件

三者任一缺失时，首次进入 AI 链路会直接抛出「售前技能资源缺失」并列出实际解析到的绝对路径，不再静默 ENOENT。

本项目与 `私域电商售前客服AgenticDemo`、`私域电商售前客服AI规划` 隔离，不修改它们的文件。

## 双端演示流程

1. 在“客户微信”模拟扫码登录并发送咨询；AI 服务会保存客户消息、决策、回复与必要工单。
2. 在“客服企业微信”以独立登录状态进入，可查看客户资料、决策摘要和工单。
3. 接管工单后会话进入 `human_serving`，客户消息只持久化、不调用 AI；客服可人工回复。
4. 解决工单后恢复 `ai_serving`，后续客户消息重新进入 Agentic 链路。
5. 客服侧“重置 Demo”可恢复 seed 数据。

## 发送图片

- 客户微信与客服企业微信的输入区均有 📷 按钮，可上传 PNG / JPEG / WebP / GIF（≤5MB），纯图片或“图片 + 文字”均可发送；客服侧图片同样需要在人工接管后可发。
- 上传的图片保存到运行时目录 `data/uploads/`，并通过 `GET /api/media/<文件名>?sig=<签名>` 读取；文件名由服务端生成（UUID），签名由服务端用 `PRESALES_SESSION_SECRET` 派生，签名不匹配返回 403，仅允许从该目录读取。上传接口按 `Content-Length`、实际字节数与文件魔数三级校验，不信任客户端声明的 MIME。
- 客户发送图片时，服务端先调用视觉模型生成图片描述并落库（`image_description`），再把「文字 +（图片内容：…）」或「`[图片] 描述`」作为大模型输入进入 LangGraph 链路；识图失败时退化为 `[图片]`，不阻断回复。图片描述仅用于意图理解，付款金额、单号等既成事实仍由确定性规则控制；纯图片（无文字说明）不会推进成交阶段，阶段推进只来自客户文字确认或客服手动操作。会话列表的最后一条消息对纯图片显示为 `[图片]`。
- 消息表通过 `content_type`（`text`/`image`）、`media_path` 与 `image_description` 字段保存图片，旧数据库启动时自动升级。

## 5 分钟演示脚本

演示主路径：咨询报价 → 付款 → 人工核对 → 出单 → 揽收 → 运输中。客服端右侧「当前成交进度」区展示阶段、模拟运单号，并提供 4 个推进按钮（按钮仅在到达对应阶段时可点）。

1. **咨询与防跳步（T02 核心）**：客户端问“大概多久能到 / 从哪发货”。此时进度仍在「咨询中」，AI 回复只会说“还没到发货环节，揽收后一般 1-3 天到”，**不会**跳说“已揽收 / 已发货”。
2. **付款推进**：客户端表示“怎么付款 / 已付款”，进度自动推进到「待付款 →待核对」（客户消息最多到「待核对」，不会自行跳到出单/揽收）。
3. **人工核对**：客服端点「确认核对」→ 进度到「待出单」。此前若 AI 试图说“收款成功”，会被话术红线覆盖为安全话术。
4. **生成模拟单号**：客服端点「生成模拟单号」→ 进度到「待揽收」，生成 `SF` 开头的模拟运单号。此时客户再问物流，AI 会说“运单已生成、待揽收”，仍不跳步。
5. **揽收与运输**：客服端依次点「模拟揽收」「模拟运输」→ 进度到「已揽收 → 运输中」。到此阶段客户问物流，AI 才会说“已揽收 / 运输中，凭单号跟踪”。
6. **人工接管保持可用**：命中转人工的会话进入 `human_serving`，AI 不改写人工话术。`POST /api/deal/advance` 仅限客服身份调用（人工服务中仍可继续推进进度），会话关闭后不再允许推进。

一键重置：客服端右下角「重置 Demo」（或 `POST /api/reset`）会清空会话、决策、工单与成交状态，并恢复到初始 seed（`S-001` 为「咨询中」、无运单号）。

## 验证

```bash
npm run lint
npm test
npm run build
```

测试覆盖 repository 初始化、消息顺序、事务性决策/工单写入、接管恢复、成交状态持久化与 reset 恢复；`dealStage` 的 T02 防跳步、未核款/未揽收话术红线、按钮顺序约束；以及登录与成交推进 API 的输入边界（非法 action、跨阶段 409、会话不存在 404）。

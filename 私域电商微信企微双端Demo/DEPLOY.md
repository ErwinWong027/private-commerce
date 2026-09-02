# 双端 Demo 容器化一键部署

把「私域电商微信企微双端Demo」打包为可一键启动的容器：Node 26 + Python 3 + PyYAML，
只读引用「私域电商售前客服AI规划」的技能/知识库，数据落持久卷。

## 前置
- 安装 Docker + Docker Compose v2
- 确认 `.env` 已填 `FOUNDATION_MODEL_API_KEY` 与 `PRESALES_SESSION_SECRET`（仓库已内置一套可直接用）

## 一键启动

```bash
cd 私域电商微信企微双端Demo
docker compose up -d --build
```

## 访问
- 客户微信端：http://localhost:3001/customer
- 客服企业微信端：http://localhost:3001/agent
- 换端口：在 `.env` 设 `HOST_PORT=8080` 后 `docker compose up -d`

## 数据持久化
- 命名卷 `presales-data` → 容器 `/app/data`（SQLite `presales-demo.db` + `uploads/`），跨重启/重建保留。
- 重置 Demo：界面「重置」或 `POST /api/reset`（需客服登录态）。

## 常用命令

```bash
docker compose logs -f      # 跟踪日志
docker compose ps           # 查看状态/健康
docker compose down         # 停止（数据保留在卷）
docker compose down -v      # 停止并清空数据卷
docker compose up -d --build  # 代码改动后重建镜像并重启
```

## 架构要点
- 多阶段构建：`node:26` 构建 `.next`，`node:26-slim` + Python 运行。
- 技能资源 COPY 到 `/opt/presales`（只读），由容器内 `PRESALES_SKILL_ROOT` / `PRESALES_KNOWLEDGE_BASE` 指向。
- 更新知识库/技能：改「私域电商售前客服AI规划」源文件后 `docker compose up -d --build` 重新 COPY 进镜像即可。

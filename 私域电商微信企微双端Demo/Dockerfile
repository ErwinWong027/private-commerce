# syntax=docker/dockerfile:1

# ============================================================
# 私域电商微信 / 企微双端 Demo —— 生产容器
# 依赖: Node 26 (内置 node:sqlite) + Python 3 + PyYAML
# 说明: 只读引用「私域电商售前客服AI规划」的技能/知识库资源，
#       不修改其文件；数据落 /app/data（挂持久卷）。
# ============================================================

# ---------- 阶段 1: 安装依赖 + 构建 Next.js ----------
FROM node:26-bookworm AS builder
WORKDIR /app

# 先拷依赖清单，命中层缓存
COPY 私域电商微信企微双端Demo/package.json 私域电商微信企微双端Demo/package-lock.json ./
RUN npm ci

# 拷源码（node_modules / .next / data / .env 已被 .dockerignore 排除）
COPY 私域电商微信企微双端Demo/ ./
RUN npm run build

# ---------- 阶段 2: 运行时 ----------
FROM node:26-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Python 3 + PyYAML（answer_engine.py 仅依赖 stdlib + yaml）+ 证书
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-yaml ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 仅生产依赖（next start 所需）
COPY 私域电商微信企微双端Demo/package.json 私域电商微信企微双端Demo/package-lock.json ./
RUN npm ci --omit=dev

# Next.js 构建产物 + 静态资源 + 运行时配置
# 注意: 目标必须显式写 /app/.next —— 写成 ./ 会把 .next 的内容摊平到 /app 根目录，
# 且 .next 内置的 package.json({"type":"commonjs"}) 会覆盖项目 package.json 导致 npm start 失败
COPY --from=builder /app/.next /app/.next
COPY 私域电商微信企微双端Demo/public ./public
COPY 私域电商微信企微双端Demo/next.config.ts ./next.config.ts

# 售前技能资源（只读引用，固定容器内路径；留空 env 会触发不存在的本地回退）
COPY 私域电商售前客服AI规划/presales-qa-agent /opt/presales/skill
COPY 私域电商售前客服AI规划/私域电商售前客服-售前问答知识库.yaml /opt/presales/kb/presales-kb.yaml

# 运行时数据目录（SQLite + 上传），挂持久卷
RUN mkdir -p /app/data/uploads
VOLUME ["/app/data"]

# 容器内绝对路径，覆盖源码的本地回退逻辑
ENV PRESALES_SKILL_ROOT=/opt/presales/skill \
    PRESALES_KNOWLEDGE_BASE=/opt/presales/kb/presales-kb.yaml \
    PRESALES_DB_PATH=/app/data/presales-demo.db \
    PRESALES_UPLOAD_DIR=/app/data/uploads \
    PORT=3001

EXPOSE 3001

# 生产可改为 USER node（注意卷属主）；此处保持 root 以保证一键启动稳定
CMD ["npm", "run", "start"]

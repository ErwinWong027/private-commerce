---
title: 私域售前 Demo 部署说明
description: 本地启动、测试执行与演示建议。
category: 设计文档
doc_type: 设计文档
---

# 私域售前 Demo 部署说明

## 1. 安装依赖

```bash
npm install
```

## 2. 启动本地服务

先在项目根目录准备 `.env.local`，至少包含以下配置：

```bash
FOUNDATION_MODEL_PROVIDER=deepseek
FOUNDATION_MODEL_API_KEY=你的密钥
FOUNDATION_MODEL_BASE_URL=https://api-gateway.openagents.org/v1
FOUNDATION_MODEL_NAME=deepseek-v4-pro
```

然后启动本地服务：

```bash
npm run dev
```

默认访问：

`http://localhost:3000`

## 3. 运行自动化测试

页面右上角点击“**一键回归 31 条用例**”，或者直接请求：

```bash
curl -X POST http://localhost:3000/api/test/run
```

测试报告会输出到：

`tests/reports/presales-demo-report.md`

## 4. 演示建议路径

1. 先演示首响与快捷问题
2. 再演示版本、正品、价格、活动
3. 切到风险拦截与点名人工
4. 最后演示付款截图与承接超时恢复

## 5. 当前存储方式

- 会话状态：本地内存
- 转人工工单：本地内存
- 承接状态：本地内存
- 文档：`docs/`
- 测试报告：`tests/reports/`

这意味着当前版本适合本地 Demo 和方案评审，不是生产数据库方案。

## 6. DeepSeek 流式验证

1. 启动本地服务后，打开首页中的“**DeepSeek 实时对话**”区域
2. 输入 `Hello!` 或业务问题并点击发送
3. 页面会通过 `/api/model-chat` 发起服务端代理请求
4. 如果密钥无效、参数错误、请求限流或网络异常，页面会展示中文错误提示

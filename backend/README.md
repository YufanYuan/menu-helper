# Cloudflare Worker Backend (OpenRouter Proxy)

该目录实现了面向微信小程序的 Cloudflare Workers 后端 MVP：

- `POST /api/chat/completions`
- 基于 `wechat_code` 调用微信 `code2Session` 获取用户 `openid`
- 转发 OpenRouter chat completions（当前仅支持 `stream: false`）
- 将 usage/cost/地区/状态/时延写入 Cloudflare Analytics Engine

## 目录结构

```text
src/
  index.ts
  routes/
    chatCompletions.ts
  services/
    wechat.ts
    openrouter.ts
    analytics.ts
  types/
    api.ts
    env.ts
```

## 环境变量

通过 `wrangler secret put` 注入：

- `OPENROUTER_API_KEY`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

`wrangler.toml` 中默认配置了：

- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `USAGE_DATASET` Analytics Engine binding

## 本地开发

```bash
cd backend
npm install
npm run dev
```

## 部署

```bash
cd backend
npm run deploy
```

## Analytics Engine 字段映射

- `blobs`
  1. event_type
  2. openid
  3. model
  4. request_country
  5. request_city
  6. request_region
  7. request_timezone
  8. request_colo
  9. created_at
  10. request_id
- `doubles`
  1. prompt_tokens
  2. completion_tokens
  3. reasoning_tokens
  4. total_tokens
  5. cost_usd_estimate
  6. status_code
  7. latency_ms
  8. stream (0/1)
- `indexes`
  1. request_id

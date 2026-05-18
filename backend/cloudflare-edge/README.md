# Cloudflare Edge Backend (OpenRouter Proxy)

该目录实现了面向微信小程序的后端 MVP，业务逻辑默认走通用 Web Fetch 接口，平台能力按 runtime 注入：

- `POST /api/chat/completions`
- `GET /ws/rooms` WebSocket room endpoint for shared menu ordering
- 基于 `wechat_code` 调用微信 `code2Session` 获取用户 `openid`
- 转发 OpenRouter chat completions（当前仅支持 `stream: false`）
- 使用 Durable Object 托管国际版点餐房间状态
- 在 Cloudflare Worker 环境中，自动启用 Analytics Engine 并写入 usage/cost/地区/状态/时延，并关联 `session_id` / `client_request_id`
- 在非 Cloudflare 环境中，可复用同一套 handler，并按需注入自己的 analytics/logger/storage 能力
- 该接口当前仅服务国际流量；中国大陆/俄罗斯用户由小程序端直接请求火山引擎豆包模型

## 目录结构

```text
src/
  app.ts
  index.ts
  durableObjects/
    menuRoom.ts
  routes/
    chatCompletions.ts
    rooms.ts
  services/
    wechat.ts
    openrouter.ts
    analytics.ts
    runtime.ts
  types/
    api.ts
    env.ts
    runtime.ts
```

## 环境变量

通过 `wrangler secret put` 注入：

- `OPENROUTER_API_KEY`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

`wrangler.toml` 中当前默认配置了 Cloudflare Worker 部署参数：

- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `MENU_ROOM_OBJECT` Durable Object binding
- `USAGE_DATASET` Analytics Engine binding（可选，仅 Cloudflare runtime 使用）

`/ws/rooms` 只通过 WebSocket 工作。创建房间时直接连接该路径并发送 `create_room`；加入房间时连接同一路径并附加 `?roomId=...`，首条消息仍需发送 `join_room` 完成微信 code 校验。

## 本地开发

```bash
pnpm install
pnpm --filter @menu-helper/cloudflare-edge dev
```

## 部署

```bash
pnpm --filter @menu-helper/cloudflare-edge deploy
```

## Runtime 设计

- `src/app.ts` 暴露通用的 `handleRequest(request, env, runtimeContext)`，可被不同平台复用
- `src/services/runtime.ts` 负责从具体平台提取能力并组装 `runtimeContext`
- 当前已内置 Cloudflare Worker 适配：
  - 发现 `request.cf` 或 `USAGE_DATASET` 时，标记为 `cloudflare-worker`
  - 有 `USAGE_DATASET` 时启用 Analytics Engine writer
  - 无对应能力时自动降级，不影响主链路

## Analytics Engine 字段映射

- `blobs`
  1. event_type
  2. openid
  3. model
  4. session_id
  5. client_request_id
  6. request_country
  7. request_city
  8. request_region
  9. request_timezone
  10. request_colo
  11. created_at
  12. request_id
  13. failed_stage
  14. error_message
- `doubles`
  1. prompt_tokens
  2. completion_tokens
  3. reasoning_tokens
  4. total_tokens
  5. cost_usd_estimate
  6. status_code
  7. latency_ms
  8. stream (0/1)
  9. is_success (0/1)
- `indexes`
  1. request_id

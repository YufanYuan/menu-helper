# CN Backend

FastAPI service for China-region API traffic.

## Runtime Config

Required for WebSocket ordering rooms:

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `REDIS_URL` (defaults to `redis://localhost:6379/0`)

Optional socket URL overrides returned by `/api/config`:

- `ROOMS_SOCKET_URL`
- `ROOMS_CN_SOCKET_URL`
- `ROOMS_CLOUDFLARE_SOCKET_URL`

The room endpoint is `GET /ws/rooms` as a WebSocket upgrade. The first message must be `create_room` or `join_room`; room state is shared through Redis and expires 2 hours after the last active connection leaves.

## Local Development

Run from the repository root:

```bash
uv sync --all-packages
uv run --package menu-helper-cn-backend uvicorn menu_helper_cn_backend.main:app --reload --host 0.0.0.0 --port 8000
```

## Docker

Run from the repository root:

```bash
docker build -f backend/cn-backend/Dockerfile -t menu-helper-cn-backend .
docker run --rm --env-file .env -p 8000:8000 menu-helper-cn-backend
```

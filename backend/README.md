# Backend Workspace

`backend/` is the backend ownership area.

```text
backend/
  cloudflare-edge/  Cloudflare Worker proxy for international traffic
  cn-backend/       China-region service, managed by uv
```

## Cloudflare Edge

```bash
pnpm --filter @menu-helper/cloudflare-edge dev
pnpm --filter @menu-helper/cloudflare-edge deploy
```

## CN Backend

```bash
uv sync --all-packages
uv run --package menu-helper-cn-backend uvicorn menu_helper_cn_backend.main:app --host 0.0.0.0 --port 8000
```

Docker:

```bash
docker build -f backend/cn-backend/Dockerfile -t menu-helper-cn-backend .
docker run --rm --env-file .env -p 8000:8000 menu-helper-cn-backend
```

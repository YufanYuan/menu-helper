# CN Backend

FastAPI service for China-region API traffic.

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
docker run --rm -p 8000:8000 menu-helper-cn-backend
```

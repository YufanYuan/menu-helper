# Menu Helper Monorepo

This repository is organized as a multi-language monorepo.

```text
backend/
  cloudflare-edge/  Cloudflare Worker OpenRouter proxy, managed by pnpm
  cn-backend/       China-region backend service, managed by uv
frontend/
  menu-helper/      WeChat mini program source, not managed by pnpm
  frontend/         Personal homepage, Vite + React + TanStack Router, managed by pnpm
.github/           GitHub Actions workflows
ci/                CI notes and local conventions
aisetup/           Agent and AI-coding setup notes
```

## Package Managers

- Node workspaces use `pnpm` from the repository root.
- Python backend workspaces use `uv` from the repository root.
- The mini program in `frontend/menu-helper` remains a standalone mini program project.

## Common Commands

```bash
pnpm install
pnpm dev:site
pnpm dev:edge
pnpm typecheck
```

```bash
uv sync --all-packages
uv run --package menu-helper-cn-backend uvicorn menu_helper_cn_backend.main:app --host 0.0.0.0 --port 8000
```

Open the WeChat DevTools project at `frontend/menu-helper`.

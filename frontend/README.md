# Frontend Workspace

```text
frontend/
  menu-helper/  WeChat mini program source, standalone
  frontend/     Personal homepage, managed by pnpm
```

## Mini Program

Open `frontend/menu-helper` in WeChat DevTools.

## Personal Homepage

```bash
pnpm --filter @menu-helper/frontend dev
pnpm --filter @menu-helper/frontend build
```

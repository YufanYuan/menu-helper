# Personal Homepage

Vite + React + TanStack Router app for the personal homepage.

```bash
pnpm --filter @menu-helper/frontend dev
pnpm --filter @menu-helper/frontend build
```

Docker:

```bash
docker build -t menu-helper-frontend frontend/frontend
docker run --rm -p 8080:80 menu-helper-frontend
```

# CI

GitHub Actions workflows live in `.github/workflows`.

The default CI shape is:

- install pnpm and build/typecheck Node workspaces
- install uv and validate Python backend packages
- keep the mini program outside pnpm so WeChat DevTools can open it directly

# CI

GitHub Actions workflows live in `.github/workflows`.

The default CI shape is:

- install pnpm and build/typecheck Node workspaces
- install uv and validate Python backend packages
- keep the mini program outside pnpm so WeChat DevTools can open it directly

Container publishing lives in `.github/workflows/containers.yml`.

- stage 1 builds and pushes the China-region backend and frontend blog images to GHCR
- stage 2 waits for stage 1 to finish, then uses a `self-hosted` runner to pull the pushed SHA-tagged images from GHCR

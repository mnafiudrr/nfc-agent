# Task 001 — Project Setup & Tooling

> Depends on: —
> References: [rules/README.md](../rules/README.md) · [rules/general.md](../rules/general.md) · [rules/code-style.md](../rules/code-style.md) · [rules/dependency-policy.md](../rules/dependency-policy.md) · [../plans/architecture.md](../plans/architecture.md)

## Goal

Scaffold the TypeScript Node.js project skeleton so later milestones build on a consistent, linted, tested foundation.

## Steps

1. Initialize `package.json`:
   - `"type": "module"`, `"main": "dist/index.js"`, scripts: `build`, `start`, `dev`, `test`, `lint`, `format`.
   - Minimal runtime deps: `nfc-pcsc`, `ws`.
   - Dev deps: `typescript`, `eslint`, `prettier`, and a test runner.
2. Add `tsconfig.json` (ESM, Node 18+, strict, outDir `dist`).
3. Add `eslint.config.*` and `.prettierrc`; wire `lint`/`format` scripts.
4. Add `.gitignore` (node_modules, dist, .env, *.log).
5. Create `src/` structure per [architecture.md §3](../plans/architecture.md) with placeholder modules.
6. Implement `src/logger.ts` (levels DEBUG/INFO/WARN/ERROR; `LOG_LEVEL` gate; optional debug).
7. Implement `src/config.ts` (env: `WS_HOST`, `WS_PORT`, `LOG_LEVEL` with defaults).
8. Implement `src/index.ts` bootstrap with a minimal start/stop and placeholder `ReaderManager` interface; log "Agent started".
9. Add a first trivial unit test (e.g. logger) and verify `npm test`, `npm run lint`, `npm run build` all pass.

## Checklist

- [ ] `npm run build` succeeds
- [ ] `npm run lint` succeeds
- [ ] `npm test` passes
- [ ] `npm run dev` prints "Agent started" and exits cleanly on SIGINT

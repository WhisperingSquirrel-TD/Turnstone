---
name: Run the whole static-checks script before a push
description: Root `typecheck` skips e2e and tests; CI's static-checks also runs typecheck:tests, format:check and test:build.
---

CI's static-checks job runs, in order: `pnpm run typecheck`,
`pnpm run typecheck:tests`, `pnpm run lint`, `pnpm run format:check`,
`pnpm run test:build` (see `.github/workflows/verify.yml`). The root
`typecheck` does not cover `e2e/` or `tests/`; only `typecheck:tests` does.
Run all five before every push, even for a test-only change. Verify #331 went
red because an e2e edit was checked with `typecheck` alone (a narrowed
`gameId` used inside an `expect.poll` closure loses its narrowing; capture it
in a `const` first).

Local browser suite: run it as CI does,
`pnpm exec playwright test --grep-invert @rehearsal-live`, and the rehearsal
specs separately with `--config=playwright.rehearsal.config.ts` (needs
`DATABASE_URL` and `SESSION_SECRET`). Without the grep-invert the rehearsal
specs run in the browser config and fail on the missing database, which is
noise, not a regression.

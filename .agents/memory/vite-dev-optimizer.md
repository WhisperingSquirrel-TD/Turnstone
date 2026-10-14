---
name: Vite dev optimizer reload
description: Avoid page-wide dev-server reloads when lazy route imports are first discovered.
---

When a statically rendered marketing shell and lazily loaded game route share a Vite development server, its startup scan may not traverse every route import. The first visit to a game route can discover dependencies and trigger a delayed optimisation reload across open pages. In Playwright this can destroy a test page's execution context.

**Why:** This caused a GitHub desktop Chromium smoke failure and was reproduced locally on a cold Vite cache; explicitly pre-optimising the route dependencies eliminated the reload.

**How to apply:** Add dependencies used only by lazy game routes to Vite `optimizeDeps.include` and keep a cold-cache Playwright regression that opens the route while the home page remains open.

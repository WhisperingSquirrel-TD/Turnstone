---
name: Vite dev optimizer reload
description: Avoid page-wide dev-server reloads when lazy route imports are first discovered.
---

When a statically rendered marketing shell and lazily loaded game route share a Vite development server, its startup scan may not traverse every route import. The first visit to a game route can discover dependencies and trigger a delayed optimisation reload across open pages. In Playwright this can destroy a test page's execution context. Under strict pnpm resolution, an optimizer include for a dependency owned only by a linked workspace package may resolve on a long-lived local install but fail after a clean CI install; use Vite's nested include syntax through that workspace package.

**Why:** GitHub CI reported that a bare transitive dependency include could not be resolved, leaving the reload unfixed even though the local cold-cache run passed. Referencing the dependency through its linked workspace package made the cold-cache browser smoke pass.

**How to apply:** Add direct lazy-route dependencies to Vite `optimizeDeps.include`; for a transitive dependency of a linked workspace package, use the nested `workspace-package > dependency` form. Keep a cold-cache Playwright regression that opens the route while the home page remains open.

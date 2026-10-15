---
name: HTTP timeout environment
description: CodeExecution's impure fetch environment does not necessarily expose AbortSignal.
---

Do not assume all Node web globals are present alongside `fetch` in
CodeExecution's impure environment.

**Why:** A public CI status request failed because `AbortSignal` was undefined,
even inside the impure function. The workspace's Node shell provided both
`fetch` and `AbortSignal.timeout`.

**How to apply:** Prefer the configured connector for service calls. If it has a
temporary gateway failure and a public status endpoint is available, use a
workspace Node command with an explicit request timeout. Do not inspect or
expose credentials to work around either failure.

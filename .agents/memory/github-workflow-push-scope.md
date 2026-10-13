---
name: GitHub workflow push scope
description: Replit GitHub OAuth was observed rejecting pushes that update GitHub Actions workflow files.
---

As of 13 October 2026, Replit's GitHub OAuth source-control connection rejected pushes that create or update `.github/workflows/` because it lacked the GitHub `workflow` permission.

**Why:** This permission boundary is external to the repository and repeating the same push cannot repair it.

**How to apply:** Before pushing commits that touch GitHub Actions, verify that the active Replit Git connection has workflow-file write permission. Recheck the connection state because the owner may later reauthorize it.

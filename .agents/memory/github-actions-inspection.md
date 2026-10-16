---
name: GitHub Actions inspection
description: Inspect run status, annotations and job logs when public API access is constrained.
---

When unauthenticated GitHub REST calls hit shared-IP rate limits or direct job-log downloads return 403, use the configured GitHub App connection's `proxyFetch` to inspect workflow runs, jobs, check-run annotations and logs. Filter output to the relevant failure lines and redact credential-like text before surfacing it.

**Why:** Public API access from the workspace is shared and can be exhausted; the connected GitHub App successfully retrieved the same CI details without exposing token values.

**How to apply:** After each push, use the GitHub connection to inspect run status, job conclusions and annotations. Use it for job logs if direct public downloads are denied.

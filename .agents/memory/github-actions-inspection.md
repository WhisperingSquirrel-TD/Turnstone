---
name: GitHub Actions inspection
description: Inspect run status, annotations and job logs when public API access is constrained.
---

When unauthenticated GitHub REST calls hit shared-IP rate limits or direct job-log downloads return 403, use the configured GitHub App connection's `proxyFetch` to inspect workflow runs, jobs, check-run annotations and logs. Filter output to the relevant failure lines and redact credential-like text before surfacing it.

**Why:** Public API access from the workspace is shared and can be exhausted; the connected GitHub App successfully retrieved the same CI details without exposing token values.

**How to apply:** After each push, use the GitHub connection to inspect run status, job conclusions and annotations. Use it for job logs if direct public downloads are denied.

For cancelled browser jobs, inspect setup timestamps and check-run annotations
before treating cancellation as a product failure.

**Why:** Ubuntu package downloads from the runner's mirror have taken seven to
nine minutes, consuming most of a ten-minute job budget before tests start.
An unchanged-commit rerun can pass without any test or timeout changes.

**How to apply:** Distinguish dependency-install delays from actual test
timeouts. Do not count cancellation as green or weaken limits; retain evidence
and use a bounded rerun when infrastructure delay is confirmed.

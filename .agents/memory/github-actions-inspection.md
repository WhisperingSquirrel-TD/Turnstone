---
name: GitHub Actions inspection
description: Inspect run status, annotations and job logs when public API access is constrained.
---

When unauthenticated GitHub REST calls hit shared-IP rate limits or direct job-log downloads return 403, use the configured GitHub App connection's `proxyFetch` to inspect workflow runs, jobs, check-run annotations and logs. Filter output to the relevant failure lines and redact credential-like text before surfacing it.

**Why:** Public API access from the workspace is shared and can be exhausted; the connected GitHub App successfully retrieved the same CI details without exposing token values.

**How to apply:** After each push, use the GitHub connection to inspect run status, job conclusions and annotations. Use it for job logs if direct public downloads are denied.

Status reads through the connection can be stale, including returning queued
after an earlier in-progress response. Use a fresh query parameter and
`Cache-Control: no-cache` for mutable run/latest-run reads; confirm the head and
completed job conclusions before declaring green or pushing again.

**Why:** A cached queued response concealed an already completed failed run.

**How to apply:** Cache-bust each status check, not just the first one. Completed
job logs are immutable and do not need repeated downloads.

For cancelled browser jobs, inspect setup timestamps and check-run annotations
before treating cancellation as a product failure.

**Why:** Ubuntu package downloads from the runner's mirror have taken seven to
nine minutes, consuming most of a ten-minute job budget before tests start.
An unchanged-commit rerun can pass without any test or timeout changes.

**How to apply:** Distinguish dependency-install delays from actual test
timeouts. Do not count cancellation as green or weaken limits; retain evidence
and use a bounded rerun when infrastructure delay is confirmed.

Browser jobs use Playwright's `github` reporter in CI, so each failing test
appears as a check-run annotation (`/check-runs/<job id>/annotations`) even
when the job log host is unreachable.

**Why:** Verify #354's log could not be downloaded from a Claude Code cloud
session (blob log host blocked), leaving only "exit code 1".

**How to apply:** Read annotations first; keep the `github` reporter in both
Playwright configs (`tests/pipeline.test.ts` requires it). Keep each browser
test to a few full page loads: under the Vite dev server one load costs about
1 s on Chromium and more on WebKit, so a loop of 24 loads sat at its 30 s limit.

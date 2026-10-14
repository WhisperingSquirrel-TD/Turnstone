---
name: Deadline test clock isolation
description: DB-backed deadline tests can race the live managed scheduler when fake timestamps are already due in wall-clock time.
---

When running deadline integration tests against the shared development PostgreSQL database, use absolute test times well ahead of the real clock. The managed API workflow runs a live durable deadline poller, which can claim rows created with epoch-scale or otherwise past fake deadlines.

**Why:** A paused-deadline restart test was intermittently advanced by the live scheduler before its fake-clock scheduler could exercise the intended boundary.

**How to apply:** Keep simulated deadline sequences internally deterministic but safely in the future, and retain explicit cleanup so the production-like poller cannot steal the test's due event.

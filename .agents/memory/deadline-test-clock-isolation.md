---
name: Deadline test clock isolation
description: DB-backed deadline tests can race the live managed scheduler when fake timestamps are already due in wall-clock time.
---

When running deadline integration tests against the shared development PostgreSQL database, use absolute test times well ahead of the real clock. The managed API workflow runs a live durable deadline poller, which can claim rows created with epoch-scale or otherwise past fake deadlines.

**Why:** A paused-deadline restart test was intermittently advanced by the live scheduler before its fake-clock scheduler could exercise the intended boundary.

**How to apply:** Keep simulated deadline sequences internally deterministic but safely in the future, and retain explicit cleanup so the production-like poller cannot steal the test's due event.

Use that same simulated clock for the fixture's real PostgreSQL rate limiter.
Future-clock scheduler housekeeping can otherwise prune another parallel test's
wall-clock buckets, resetting its counts during a request burst. Inject a wrapper
around the real limiter with the fixture clock, not a permissive fake limiter.
Assert the persisted bucket timestamps use that clock; keep production defaults
unchanged.

Serialize integration files that share this database. Future timestamps alone
cannot isolate them: an existing fake scheduler jumps 60 days ahead, claims all
due games and globally prunes rate-limit buckets. Concurrent clients within an
individual test remain concurrent; only file-level execution is serial. Prefer
separate databases per worker if parallel file execution is needed later.

---
name: Playwright database pool lifetime
description: Shared database teardown belongs to the worker, not an individual test file.
---

Close a module-cached database pool only at Playwright worker teardown.

**Why:** Playwright reuses a worker across spec files. A file-scoped afterAll
closed the shared pool and broke the following rehearsal, although each file
passed when run alone.

**How to apply:** Share a worker-scoped fixture across real-server specs and
verify the complete multi-file configuration when changing resource cleanup.

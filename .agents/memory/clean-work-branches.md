---
name: Clean working branches
description: Preserve recent remote fixes and exclude unrelated local history when preparing pushes.
---

Fetch current main before integrating backlog work. Preserve local work, but never push a branch whose ancestry includes unrelated attachments or generated test outputs.

**Why:** A stale local working branch made already-shipped video and retry fixes appear missing; its local history also contained unrelated files that the owner prohibited from pushes.

**How to apply:** Inspect ancestry and the full outgoing diff, not only the dirty-file list. Integrate intended changes onto the fetched remote base without rewriting shared history.

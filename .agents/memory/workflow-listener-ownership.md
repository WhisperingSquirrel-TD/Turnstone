---
name: Workflow listener ownership
description: A healthy endpoint can belong to an old process after a managed restart.
---

Verify the new workflow's startup log and listener ownership, not merely an HTTP 200 after a restart.

**Why:** A managed restart reported success while an older development process still held the API port and the new process had failed to bind. In this Nix environment Node's process name can be `MainThread`, so filtering only for the name `node` misses real listeners.

**How to apply:** Identify the exact application process before terminating an orphan; never kill all Node processes or change routing to conceal an occupied port. Preserve game data and confirm the newly started instance actually listens.

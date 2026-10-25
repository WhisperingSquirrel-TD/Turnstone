---
name: Nix filesystem test contention
description: Strict filesystem test deadlines can fail under concurrent browser load in this workspace.
---

Keep filesystem-heavy unit verification separate from large browser batches when
diagnosing a strict local wall-clock failure.

**Why:** concurrent browser/unit runs repeatedly exhausted a branding filesystem
guard's unchanged five-second budget, while it passed alone in roughly 350ms;
the entire unit suite passed with one worker without concurrent browser load.
This is evidence of local contention, not permission to assume every timeout is
harmless or to change the CI gate.

**How to apply:** inspect the actual failure first, reproduce without browser
load, and retain every file checked and the existing timeout. CI remains the
authority; investigate any CI failure on its own evidence.

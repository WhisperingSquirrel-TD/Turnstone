---
name: Harness step identity
description: Phase names alone cannot identify automatic night-window transitions.
---

Capture phase, round and slot before a virtual-player action batch; organiser
waiting must return to player actions if any of them changes.

**Why:** A completed night window automatically advanced to another SHADOW window.
Waiting only for a new phase name left the new choices unsubmitted and wrongly
reported the correctly disabled organiser control as a stuck game.

**How to apply:** Use the full public step identity for harness progress and
pre-click checks. Do not bypass pending-action gates or increase waits to mask it.

---
name: Snapshot replay compatibility
description: Preserve active games when persisted state snapshots predate additive engine fields.
---

When game-state fields are added, older persisted snapshots may not contain them. Normalize an absent additive field during replay, while rejecting a present field with an invalid shape; do not rewrite or discard the stored game.

**Why:** active rehearsal snapshots survived an engine update without the newer `shadowPicks` array, causing the deadline scheduler to fail when it replayed the next shadow choice.

**How to apply:** when adding fields to persisted engine state, update snapshot replay normalization and add a regression test that replays a real event from a legacy-shaped snapshot.

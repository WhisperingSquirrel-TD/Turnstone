---
name: Scenario bots read the event version
description: An extra event per step shifts every later bot choice and changes golden outcomes.
---

Non-random scenario bots pick targets with `(state.version + seatIndex) % count`
(`scripts/src/scenarios/simulate.ts`). Any new event emitted on an existing path
moves every later version, so golden scenarios change outcome even when the
rule behind the event is off.

**Why:** D120's first draft emitted a separate `OrganiserMovedOn` event; the
golden `day-no-murder` finished with 4 alive instead of 2.

**How to apply:** carry new facts on an event the path already emits (D120 put
`movedOn` on `PhaseChanged`), or accept and record the golden change. A new
pairwise factor in `RULE_FACTORS` also changes pinned counts and hashes in
`tests/scenario-ci-sharding.test.ts` and `tests/scenario-planning-performance.test.ts`.
Scenario workers need Node 24 locally (CI uses 24).

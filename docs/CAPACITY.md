# Capacity measurements

Status: reduced-scale engineering checks only. These results are not a
production capacity claim and do not authorise launch or paid hosting.

## Measurements available in Milestone 4

- A 15-seat player view serialises to **1,045 bytes** in the local reduced-scale
  view-budget check, below the 2 KB typical-update limit.
- The database-backed realtime integration check exercises two independent
  Socket.IO server instances and a viewer connected to one instance while the
  other publishes. One local run measured **5.0 ms** from publish to receipt
  for one connected viewer. The check requires delivery in under one second;
  this single sample is not a p95 or a capacity result.
- A separate integration test verifies fresh projected-view delivery for
  5-client and 40-client groups across independent Socket.IO instances, with a
  one-second pass/fail ceiling. It does not establish measured p95 latency.
- The API requires `MAX_ACTIVE_GAMES` in production and refuses new games only
  when the active count is above 80% of that configured value. Existing game
  commands are not subject to this admission check. The value must be based on
  a separately measured host capacity; it is not inferred here.

## Not measured

No representative host CPU or memory capacity, concurrent-game ceiling,
15,000-player load, 5,000-join/minute storm, 12-hour soak, or production
database throughput has been measured. This workspace is staying on the free
tier; do not extrapolate the local checks to a production VM or database. Full
capacity tests and a measured `MAX_ACTIVE_GAMES` value remain launch work.

## Reproduction

```sh
pnpm exec vitest run tests/capacity.test.ts
CAPACITY_REPORT=1 pnpm exec vitest run tests/database.integration.test.ts --reporter=verbose --silent=false
```

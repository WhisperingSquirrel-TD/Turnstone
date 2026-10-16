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

## Reduced-scale PIN join storm (16 October 2026)

The integration check sends **32 concurrent joins** through the real late-join
HTTP endpoint, creates and verifies each salted, peppered scrypt PIN hash, and
checks the persisted hashes against all 32 submitted PINs. The rate-limit
callback is bypassed only in this test so it measures admission and hashing
throughput rather than the intentional per-client quota. It also measures 32
direct PIN hashes separately to distinguish crypto throughput from full
request/database overhead. The new-seat path no longer verifies its just-created
hash a second time; if another request won the insert race, or an access row
already exists, the submitted PIN is still verified normally.

Three sequential samples on the Replit development container (Node v24.13.0,
8 available cores; cgroup quota 8 CPUs) produced these medians:

| `UV_THREADPOOL_SIZE` | Real join requests / second | Joins / second / core | Direct PIN hashes / second | Hashes / second / core |
| -------------------: | --------------------------: | --------------------: | -------------------------: | ---------------------: |
|                    4 |                       56.87 |                  7.11 |                      99.57 |                  12.45 |
|                    8 |                       66.82 |                  8.35 |                     157.67 |                  19.71 |

The API start command now defaults to `UV_THREADPOOL_SIZE=8`, matching the
measured container's available cores; an explicitly configured environment
value overrides it. At roughly 16 MB of scrypt working memory per active job,
eight simultaneous jobs can use about 128 MB. This local sample is not a
production benchmark. Direct hashing exceeded the 5,000-joins/minute target in
this environment, while full HTTP joins did not; therefore it does not show
that scrypt alone is the current bottleneck, and it does not prove the full
target. Keep the scrypt cost unchanged. If representative pre-launch
measurements identify hashing as the bottleneck, get the owner's decision
before choosing more cores, a tuned scrypt cost while retaining the pepper, or
hashing PINs only on device recovery.

## Not measured

No representative host CPU or memory capacity, concurrent-game ceiling,
15,000-player load, 5,000-join/minute storm, 12-hour soak, or production
database throughput has been measured. Do not extrapolate the local checks to
a production VM or database. Production capacity tests, paid resources,
publishing and deployment require explicit owner approval; a measured
`MAX_ACTIVE_GAMES` value remains launch work.

## Reproduction

```sh
pnpm exec vitest run tests/capacity.test.ts
CAPACITY_REPORT=1 pnpm exec vitest run tests/database.integration.test.ts --reporter=verbose --silent=false
for size in 4 8; do
  UV_THREADPOOL_SIZE=$size CAPACITY_REPORT=1 pnpm exec vitest run \
    tests/late-invites.integration.test.ts --no-file-parallelism \
    --reporter=verbose --silent=false -t "reduced real-HTTP join storm"
done
```

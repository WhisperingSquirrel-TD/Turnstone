# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-22T17:32:12.841Z
Duration: 450095 ms

## Executed

- Exhaustive core sweep cells: 942
- Sweep games: 942
- Covering-array rows: 788 (three-way)
- Covering-array games: 788
- High-seat pairwise rows: 792 (30–40 seats)
- High-seat pairwise games: 792
- Deterministic fault-fuzz games: 32
- YAML golden games: 18
- Coverage rows verified: 2522

## Shard timings

- not sharded

## Engine game profile

Per-seat-count timings include deterministic decision logic, projections, replay checks and the independent oracle.

- 5 seats: 359 games, 10 ms/game (0.40 ms/player²; max 54.50924499996472 ms)
- 6 seats: 18 games, 10 ms/game (0.26 ms/player²; max 35.313876000000164 ms)
- 7 seats: 21 games, 11 ms/game (0.23 ms/player²; max 42.952648999984376 ms)
- 8 seats: 24 games, 18 ms/game (0.28 ms/player²; max 47.10487899999134 ms)
- 9 seats: 27 games, 33 ms/game (0.40 ms/player²; max 110.12095900002168 ms)
- 10 seats: 27 games, 37 ms/game (0.37 ms/player²; max 119.51156999997329 ms)
- 11 seats: 27 games, 35 ms/game (0.29 ms/player²; max 187.03043599997181 ms)
- 12 seats: 27 games, 42 ms/game (0.29 ms/player²; max 185.14666199998464 ms)
- 13 seats: 27 games, 60 ms/game (0.35 ms/player²; max 266.5373409999884 ms)
- 14 seats: 27 games, 75 ms/game (0.38 ms/player²; max 303.95988799998304 ms)
- 15 seats: 356 games, 174 ms/game (0.77 ms/player²; max 1006.1825550000067 ms)
- 16 seats: 27 games, 111 ms/game (0.43 ms/player²; max 608.7344980000053 ms)
- 17 seats: 27 games, 117 ms/game (0.41 ms/player²; max 601.9430579999462 ms)
- 18 seats: 27 games, 150 ms/game (0.46 ms/player²; max 646.2579759999644 ms)
- 19 seats: 27 games, 165 ms/game (0.46 ms/player²; max 758.3607130000019 ms)
- 20 seats: 27 games, 197 ms/game (0.49 ms/player²; max 875.9727450000355 ms)
- 21 seats: 27 games, 240 ms/game (0.54 ms/player²; max 1025.2842860000092 ms)
- 22 seats: 27 games, 273 ms/game (0.57 ms/player²; max 1198.467697999964 ms)
- 23 seats: 27 games, 344 ms/game (0.65 ms/player²; max 1447.740214999998 ms)
- 24 seats: 27 games, 423 ms/game (0.73 ms/player²; max 2019.8470569999772 ms)
- 25 seats: 27 games, 451 ms/game (0.72 ms/player²; max 1993.6695450000116 ms)
- 26 seats: 27 games, 523 ms/game (0.77 ms/player²; max 2332.898045000038 ms)
- 27 seats: 27 games, 618 ms/game (0.85 ms/player²; max 2838.6175519999815 ms)
- 28 seats: 27 games, 719 ms/game (0.92 ms/player²; max 3214.148224000004 ms)
- 29 seats: 27 games, 853 ms/game (1.01 ms/player²; max 3790.5225179999834 ms)
- 30 seats: 101 games, 1098 ms/game (1.22 ms/player²; max 9825.031329999969 ms)
- 31 seats: 99 games, 1411 ms/game (1.47 ms/player²; max 14818.500558 ms)
- 32 seats: 100 games, 1659 ms/game (1.62 ms/player²; max 18605.87031899998 ms)
- 33 seats: 98 games, 1609 ms/game (1.48 ms/player²; max 13275.633137999976 ms)
- 34 seats: 99 games, 1558 ms/game (1.35 ms/player²; max 13423.765138000017 ms)
- 35 seats: 103 games, 2611 ms/game (2.13 ms/player²; max 18327.370470999973 ms)
- 36 seats: 100 games, 2981 ms/game (2.30 ms/player²; max 30421.471256999997 ms)
- 37 seats: 97 games, 2849 ms/game (2.08 ms/player²; max 28896.965182999993 ms)
- 38 seats: 97 games, 2303 ms/game (1.60 ms/player²; max 23361.162446000002 ms)
- 39 seats: 97 games, 3065 ms/game (2.02 ms/player²; max 27092.62734800001 ms)
- 40 seats: 213 games, 5012 ms/game (3.13 ms/player²; max 54510.10763300001 ms)

## Results

Failures:

- none

Failure seeds: none

## Deferred layers

These are not counted as passes and remain release gates for their planned milestones:

- Independent pot validation — pending Milestone 7 — NOT RUN
- HTTP/socket scenarios, real restart and network-fault integration (Milestone 4) — NOT RUN
- Complete phone, tablet and installed-mode browser games (Milestone 5) — NOT RUN
- Production-scale capacity, soak, chaos and mutation suites (Milestone 10) — NOT RUN

This report covers the engine-level suites available at the current milestone. It is not a production release approval.

# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-15T06:18:49.610Z
Duration: 144348 ms

## Executed

- Exhaustive core sweep cells: 942
- Sweep games: 942
- Covering-array rows: 788 (three-way)
- Covering-array games: 788
- High-seat pairwise rows: 792 (30–40 seats)
- High-seat pairwise games: 792
- Deterministic fault-fuzz games: 32
- YAML golden games: 13
- Coverage rows verified: 2522

## Shard timings

- not sharded

## Engine game profile

Per-seat-count timings include deterministic decision logic, projections, replay checks and the independent oracle.

- 5 seats: 359 games, 8 ms/game (0.31 ms/player²; max 118.06239300000016 ms)
- 6 seats: 18 games, 26 ms/game (0.72 ms/player²; max 81.24601899999834 ms)
- 7 seats: 21 games, 32 ms/game (0.66 ms/player²; max 75.10593900000094 ms)
- 8 seats: 24 games, 37 ms/game (0.58 ms/player²; max 156.8660749999981 ms)
- 9 seats: 27 games, 36 ms/game (0.45 ms/player²; max 269.16909500000475 ms)
- 10 seats: 27 games, 28 ms/game (0.28 ms/player²; max 75.31604499999958 ms)
- 11 seats: 27 games, 30 ms/game (0.25 ms/player²; max 82.29230000000098 ms)
- 12 seats: 27 games, 39 ms/game (0.27 ms/player²; max 95.9024750000026 ms)
- 13 seats: 27 games, 54 ms/game (0.32 ms/player²; max 177.97980899999675 ms)
- 14 seats: 27 games, 108 ms/game (0.55 ms/player²; max 343.1142289999989 ms)
- 15 seats: 356 games, 82 ms/game (0.36 ms/player²; max 390.1614730000001 ms)
- 16 seats: 27 games, 70 ms/game (0.27 ms/player²; max 152.49043400000664 ms)
- 17 seats: 27 games, 77 ms/game (0.27 ms/player²; max 159.86139099999855 ms)
- 18 seats: 27 games, 89 ms/game (0.27 ms/player²; max 202.274639999996 ms)
- 19 seats: 27 games, 220 ms/game (0.61 ms/player²; max 631.2454309999957 ms)
- 20 seats: 27 games, 114 ms/game (0.29 ms/player²; max 202.60828200000105 ms)
- 21 seats: 27 games, 112 ms/game (0.25 ms/player²; max 171.65742699999828 ms)
- 22 seats: 27 games, 141 ms/game (0.29 ms/player²; max 222.58799600000202 ms)
- 23 seats: 27 games, 146 ms/game (0.28 ms/player²; max 232.1065579999995 ms)
- 24 seats: 27 games, 160 ms/game (0.28 ms/player²; max 291.7625659999976 ms)
- 25 seats: 27 games, 183 ms/game (0.29 ms/player²; max 310.48630100000446 ms)
- 26 seats: 27 games, 202 ms/game (0.30 ms/player²; max 295.83564900000056 ms)
- 27 seats: 27 games, 217 ms/game (0.30 ms/player²; max 281.05193499999586 ms)
- 28 seats: 27 games, 211 ms/game (0.27 ms/player²; max 331.7179879999967 ms)
- 29 seats: 27 games, 246 ms/game (0.29 ms/player²; max 302.8703519999981 ms)
- 30 seats: 101 games, 435 ms/game (0.48 ms/player²; max 1131.2752089999994 ms)
- 31 seats: 99 games, 395 ms/game (0.41 ms/player²; max 874.0432569999975 ms)
- 32 seats: 100 games, 419 ms/game (0.41 ms/player²; max 1228.9117019999976 ms)
- 33 seats: 98 games, 396 ms/game (0.36 ms/player²; max 1015.2911440000025 ms)
- 34 seats: 99 games, 422 ms/game (0.37 ms/player²; max 1159.121277000013 ms)
- 35 seats: 103 games, 521 ms/game (0.42 ms/player²; max 1285.2684329999902 ms)
- 36 seats: 100 games, 546 ms/game (0.42 ms/player²; max 1380.6693589999923 ms)
- 37 seats: 97 games, 535 ms/game (0.39 ms/player²; max 953.1126249999943 ms)
- 38 seats: 97 games, 542 ms/game (0.38 ms/player²; max 1425.4431639999966 ms)
- 39 seats: 97 games, 666 ms/game (0.44 ms/player²; max 1606.855442 ms)
- 40 seats: 213 games, 736 ms/game (0.46 ms/player²; max 1704.3000960000063 ms)

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

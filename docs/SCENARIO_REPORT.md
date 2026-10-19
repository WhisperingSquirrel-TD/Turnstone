# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-19T11:17:30.794Z
Duration: 148274 ms

## Executed

- Exhaustive core sweep cells: 942
- Sweep games: 942
- Covering-array rows: 788 (three-way)
- Covering-array games: 788
- High-seat pairwise rows: 792 (30–40 seats)
- High-seat pairwise games: 792
- Deterministic fault-fuzz games: 32
- YAML golden games: 17
- Coverage rows verified: 2522

## Shard timings

- not sharded

## Engine game profile

Per-seat-count timings include deterministic decision logic, projections, replay checks and the independent oracle.

- 5 seats: 359 games, 11 ms/game (0.42 ms/player²; max 183.71288400000049 ms)
- 6 seats: 18 games, 34 ms/game (0.93 ms/player²; max 69.14400999999998 ms)
- 7 seats: 21 games, 34 ms/game (0.69 ms/player²; max 128.3044549999977 ms)
- 8 seats: 24 games, 36 ms/game (0.56 ms/player²; max 153.0860169999978 ms)
- 9 seats: 27 games, 38 ms/game (0.47 ms/player²; max 129.2624680000008 ms)
- 10 seats: 27 games, 32 ms/game (0.32 ms/player²; max 90.03798800000004 ms)
- 11 seats: 27 games, 40 ms/game (0.33 ms/player²; max 100.55885600000329 ms)
- 12 seats: 27 games, 56 ms/game (0.39 ms/player²; max 141.61617500000284 ms)
- 13 seats: 27 games, 103 ms/game (0.61 ms/player²; max 345.3272040000011 ms)
- 14 seats: 27 games, 68 ms/game (0.35 ms/player²; max 265.2654829999956 ms)
- 15 seats: 356 games, 91 ms/game (0.40 ms/player²; max 511.92207100000087 ms)
- 16 seats: 27 games, 71 ms/game (0.28 ms/player²; max 152.01085199999943 ms)
- 17 seats: 27 games, 122 ms/game (0.42 ms/player²; max 415.13284099999873 ms)
- 18 seats: 27 games, 157 ms/game (0.48 ms/player²; max 586.7670380000054 ms)
- 19 seats: 27 games, 130 ms/game (0.36 ms/player²; max 334.58952399999544 ms)
- 20 seats: 27 games, 121 ms/game (0.30 ms/player²; max 206.27510600000096 ms)
- 21 seats: 27 games, 141 ms/game (0.32 ms/player²; max 259.7395059999981 ms)
- 22 seats: 27 games, 156 ms/game (0.32 ms/player²; max 288.503647000005 ms)
- 23 seats: 27 games, 187 ms/game (0.35 ms/player²; max 350.58033799999976 ms)
- 24 seats: 27 games, 214 ms/game (0.37 ms/player²; max 334.2759029999943 ms)
- 25 seats: 27 games, 196 ms/game (0.31 ms/player²; max 351.45532799999637 ms)
- 26 seats: 27 games, 238 ms/game (0.35 ms/player²; max 345.36423900000227 ms)
- 27 seats: 27 games, 242 ms/game (0.33 ms/player²; max 401.8881840000031 ms)
- 28 seats: 27 games, 233 ms/game (0.30 ms/player²; max 395.724629999997 ms)
- 29 seats: 27 games, 286 ms/game (0.34 ms/player²; max 422.52649199999723 ms)
- 30 seats: 101 games, 485 ms/game (0.54 ms/player²; max 1480.5486820000078 ms)
- 31 seats: 99 games, 466 ms/game (0.48 ms/player²; max 1264.867532999997 ms)
- 32 seats: 100 games, 504 ms/game (0.49 ms/player²; max 1447.4891510000016 ms)
- 33 seats: 98 games, 428 ms/game (0.39 ms/player²; max 1446.9416540000093 ms)
- 34 seats: 99 games, 513 ms/game (0.44 ms/player²; max 1509.5832010000013 ms)
- 35 seats: 103 games, 620 ms/game (0.51 ms/player²; max 1873.3073109999968 ms)
- 36 seats: 100 games, 644 ms/game (0.50 ms/player²; max 2521.5904690000025 ms)
- 37 seats: 97 games, 630 ms/game (0.46 ms/player²; max 1586.7145350000064 ms)
- 38 seats: 97 games, 637 ms/game (0.44 ms/player²; max 2138.3655160000053 ms)
- 39 seats: 97 games, 747 ms/game (0.49 ms/player²; max 2325.6765310000046 ms)
- 40 seats: 213 games, 876 ms/game (0.55 ms/player²; max 3132.5520930000057 ms)

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

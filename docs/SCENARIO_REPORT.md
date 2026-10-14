# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T06:38:14.850Z
Duration: 115123 ms

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

- 5 seats: 359 games, 6 ms/game (0.24 ms/player²; max 56.02122699999745 ms)
- 6 seats: 18 games, 14 ms/game (0.38 ms/player²; max 30.933862999998382 ms)
- 7 seats: 21 games, 18 ms/game (0.37 ms/player²; max 54.24681299999793 ms)
- 8 seats: 24 games, 33 ms/game (0.51 ms/player²; max 101.84223400000337 ms)
- 9 seats: 27 games, 28 ms/game (0.34 ms/player²; max 159.50321200000326 ms)
- 10 seats: 27 games, 17 ms/game (0.17 ms/player²; max 72.007660999996 ms)
- 11 seats: 27 games, 21 ms/game (0.18 ms/player²; max 44.80835000000661 ms)
- 12 seats: 27 games, 37 ms/game (0.26 ms/player²; max 89.80413299999782 ms)
- 13 seats: 27 games, 44 ms/game (0.26 ms/player²; max 98.19908200000646 ms)
- 14 seats: 27 games, 286 ms/game (1.46 ms/player²; max 970.1870600000038 ms)
- 15 seats: 356 games, 63 ms/game (0.28 ms/player²; max 1099.0853179999976 ms)
- 16 seats: 27 games, 54 ms/game (0.21 ms/player²; max 115.97338799999852 ms)
- 17 seats: 27 games, 83 ms/game (0.29 ms/player²; max 174.81648000000132 ms)
- 18 seats: 27 games, 103 ms/game (0.32 ms/player²; max 195.66292600000452 ms)
- 19 seats: 27 games, 359 ms/game (1.00 ms/player²; max 1064.3875199999966 ms)
- 20 seats: 27 games, 140 ms/game (0.35 ms/player²; max 590.0806030000022 ms)
- 21 seats: 27 games, 115 ms/game (0.26 ms/player²; max 205.52745799999684 ms)
- 22 seats: 27 games, 132 ms/game (0.27 ms/player²; max 243.39943700000003 ms)
- 23 seats: 27 games, 132 ms/game (0.25 ms/player²; max 236.40404700000363 ms)
- 24 seats: 27 games, 127 ms/game (0.22 ms/player²; max 229.32471899999655 ms)
- 25 seats: 27 games, 122 ms/game (0.20 ms/player²; max 203.20339900000545 ms)
- 26 seats: 27 games, 140 ms/game (0.21 ms/player²; max 277.87446900000214 ms)
- 27 seats: 27 games, 149 ms/game (0.20 ms/player²; max 234.7325309999942 ms)
- 28 seats: 27 games, 139 ms/game (0.18 ms/player²; max 213.54963000000134 ms)
- 29 seats: 27 games, 163 ms/game (0.19 ms/player²; max 235.90407699999923 ms)
- 30 seats: 101 games, 282 ms/game (0.31 ms/player²; max 861.7078559999936 ms)
- 31 seats: 99 games, 305 ms/game (0.32 ms/player²; max 1288.5084970000025 ms)
- 32 seats: 100 games, 375 ms/game (0.37 ms/player²; max 1555.1273260000016 ms)
- 33 seats: 98 games, 271 ms/game (0.25 ms/player²; max 765.7561419999984 ms)
- 34 seats: 99 games, 300 ms/game (0.26 ms/player²; max 1104.3189459999994 ms)
- 35 seats: 103 games, 356 ms/game (0.29 ms/player²; max 1136.7825509999966 ms)
- 36 seats: 100 games, 365 ms/game (0.28 ms/player²; max 1043.4953499999974 ms)
- 37 seats: 97 games, 364 ms/game (0.27 ms/player²; max 845.7876720000058 ms)
- 38 seats: 97 games, 370 ms/game (0.26 ms/player²; max 1097.4451430000045 ms)
- 39 seats: 97 games, 452 ms/game (0.30 ms/player²; max 1109.726800999997 ms)
- 40 seats: 213 games, 489 ms/game (0.31 ms/player²; max 1455.8951729999972 ms)

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

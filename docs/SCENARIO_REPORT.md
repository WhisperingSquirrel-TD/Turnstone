# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T17:43:15.672Z
Duration: 136199 ms

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

- 5 seats: 359 games, 7 ms/game (0.28 ms/player²; max 87.84012600000278 ms)
- 6 seats: 18 games, 30 ms/game (0.83 ms/player²; max 104.0934649999981 ms)
- 7 seats: 21 games, 37 ms/game (0.76 ms/player²; max 113.18063200000324 ms)
- 8 seats: 24 games, 38 ms/game (0.60 ms/player²; max 141.19603300000017 ms)
- 9 seats: 27 games, 28 ms/game (0.34 ms/player²; max 143.22109900000214 ms)
- 10 seats: 27 games, 36 ms/game (0.36 ms/player²; max 148.3621770000027 ms)
- 11 seats: 27 games, 30 ms/game (0.25 ms/player²; max 73.91536199999973 ms)
- 12 seats: 27 games, 28 ms/game (0.19 ms/player²; max 82.16884700000082 ms)
- 13 seats: 27 games, 36 ms/game (0.21 ms/player²; max 79.08922000000166 ms)
- 14 seats: 27 games, 97 ms/game (0.50 ms/player²; max 308.9301190000042 ms)
- 15 seats: 356 games, 67 ms/game (0.30 ms/player²; max 416.59632599999895 ms)
- 16 seats: 27 games, 54 ms/game (0.21 ms/player²; max 136.51428300000407 ms)
- 17 seats: 27 games, 56 ms/game (0.20 ms/player²; max 105.03411499999493 ms)
- 18 seats: 27 games, 72 ms/game (0.22 ms/player²; max 154.17887699999847 ms)
- 19 seats: 27 games, 107 ms/game (0.30 ms/player²; max 446.10409499999514 ms)
- 20 seats: 27 games, 163 ms/game (0.41 ms/player²; max 364.6315469999972 ms)
- 21 seats: 27 games, 265 ms/game (0.60 ms/player²; max 803.6846249999944 ms)
- 22 seats: 27 games, 483 ms/game (1.00 ms/player²; max 1263.0890230000005 ms)
- 23 seats: 27 games, 535 ms/game (1.01 ms/player²; max 1747.729499000001 ms)
- 24 seats: 27 games, 531 ms/game (0.92 ms/player²; max 1435.613529000002 ms)
- 25 seats: 27 games, 406 ms/game (0.65 ms/player²; max 913.8915699999998 ms)
- 26 seats: 27 games, 233 ms/game (0.35 ms/player²; max 575.5918149999998 ms)
- 27 seats: 27 games, 169 ms/game (0.23 ms/player²; max 309.24303599999985 ms)
- 28 seats: 27 games, 174 ms/game (0.22 ms/player²; max 309.9182819999987 ms)
- 29 seats: 27 games, 207 ms/game (0.25 ms/player²; max 336.939363999998 ms)
- 30 seats: 101 games, 352 ms/game (0.39 ms/player²; max 898.8434509999934 ms)
- 31 seats: 99 games, 312 ms/game (0.32 ms/player²; max 770.1683100000082 ms)
- 32 seats: 100 games, 342 ms/game (0.33 ms/player²; max 1225.4436189999979 ms)
- 33 seats: 98 games, 315 ms/game (0.29 ms/player²; max 1036.474080999993 ms)
- 34 seats: 99 games, 363 ms/game (0.31 ms/player²; max 1204.476410000003 ms)
- 35 seats: 103 games, 422 ms/game (0.34 ms/player²; max 1179.0666360000032 ms)
- 36 seats: 100 games, 436 ms/game (0.34 ms/player²; max 1323.3271769999992 ms)
- 37 seats: 97 games, 416 ms/game (0.30 ms/player²; max 894.5259660000011 ms)
- 38 seats: 97 games, 437 ms/game (0.30 ms/player²; max 1314.2412879999902 ms)
- 39 seats: 97 games, 532 ms/game (0.35 ms/player²; max 1400.103900999995 ms)
- 40 seats: 213 games, 613 ms/game (0.38 ms/player²; max 1695.4262219999946 ms)

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

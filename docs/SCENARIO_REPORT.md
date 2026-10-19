# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-19T07:15:42.540Z
Duration: 150698 ms

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

- 5 seats: 359 games, 11 ms/game (0.43 ms/player²; max 119.30453200000193 ms)
- 6 seats: 18 games, 36 ms/game (1.00 ms/player²; max 74.30681499999992 ms)
- 7 seats: 21 games, 26 ms/game (0.53 ms/player²; max 52.31987500000105 ms)
- 8 seats: 24 games, 30 ms/game (0.47 ms/player²; max 111.48380100000213 ms)
- 9 seats: 27 games, 31 ms/game (0.38 ms/player²; max 81.2703760000004 ms)
- 10 seats: 27 games, 29 ms/game (0.29 ms/player²; max 64.2028599999976 ms)
- 11 seats: 27 games, 37 ms/game (0.31 ms/player²; max 85.1481449999992 ms)
- 12 seats: 27 games, 64 ms/game (0.44 ms/player²; max 306.319743 ms)
- 13 seats: 27 games, 97 ms/game (0.57 ms/player²; max 296.30615000000034 ms)
- 14 seats: 27 games, 65 ms/game (0.33 ms/player²; max 286.74912900000345 ms)
- 15 seats: 356 games, 96 ms/game (0.42 ms/player²; max 577.773033999998 ms)
- 16 seats: 27 games, 69 ms/game (0.27 ms/player²; max 157.1002159999989 ms)
- 17 seats: 27 games, 106 ms/game (0.37 ms/player²; max 370.11836700000276 ms)
- 18 seats: 27 games, 153 ms/game (0.47 ms/player²; max 545.9918209999996 ms)
- 19 seats: 27 games, 121 ms/game (0.33 ms/player²; max 454.1668480000044 ms)
- 20 seats: 27 games, 119 ms/game (0.30 ms/player²; max 232.69574399999692 ms)
- 21 seats: 27 games, 135 ms/game (0.31 ms/player²; max 253.66871399999945 ms)
- 22 seats: 27 games, 146 ms/game (0.30 ms/player²; max 333.4145200000057 ms)
- 23 seats: 27 games, 187 ms/game (0.35 ms/player²; max 364.3790630000003 ms)
- 24 seats: 27 games, 206 ms/game (0.36 ms/player²; max 345.0359610000014 ms)
- 25 seats: 27 games, 210 ms/game (0.34 ms/player²; max 361.49779200000194 ms)
- 26 seats: 27 games, 215 ms/game (0.32 ms/player²; max 332.96113300000434 ms)
- 27 seats: 27 games, 220 ms/game (0.30 ms/player²; max 375.65287700000044 ms)
- 28 seats: 27 games, 229 ms/game (0.29 ms/player²; max 397.07564000000275 ms)
- 29 seats: 27 games, 297 ms/game (0.35 ms/player²; max 438.34375400000135 ms)
- 30 seats: 101 games, 496 ms/game (0.55 ms/player²; max 1641.076034999991 ms)
- 31 seats: 99 games, 469 ms/game (0.49 ms/player²; max 1409.5794330000062 ms)
- 32 seats: 100 games, 469 ms/game (0.46 ms/player²; max 1345.4781939999957 ms)
- 33 seats: 98 games, 421 ms/game (0.39 ms/player²; max 1266.4791600000026 ms)
- 34 seats: 99 games, 533 ms/game (0.46 ms/player²; max 1787.3684579999972 ms)
- 35 seats: 103 games, 625 ms/game (0.51 ms/player²; max 1937.8420370000094 ms)
- 36 seats: 100 games, 657 ms/game (0.51 ms/player²; max 2863.7327179999993 ms)
- 37 seats: 97 games, 618 ms/game (0.45 ms/player²; max 1541.8784250000026 ms)
- 38 seats: 97 games, 635 ms/game (0.44 ms/player²; max 2076.1052359999885 ms)
- 39 seats: 97 games, 755 ms/game (0.50 ms/player²; max 2246.8279080000066 ms)
- 40 seats: 213 games, 885 ms/game (0.55 ms/player²; max 3091.50086 ms)

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

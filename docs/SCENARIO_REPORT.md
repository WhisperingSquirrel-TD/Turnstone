# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-16T21:57:29.526Z
Duration: 135892 ms

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

- 5 seats: 359 games, 10 ms/game (0.39 ms/player²; max 130.61899699999776 ms)
- 6 seats: 18 games, 40 ms/game (1.12 ms/player²; max 208.88958999999886 ms)
- 7 seats: 21 games, 37 ms/game (0.75 ms/player²; max 172.58998399999837 ms)
- 8 seats: 24 games, 30 ms/game (0.46 ms/player²; max 60.01093700000274 ms)
- 9 seats: 27 games, 39 ms/game (0.48 ms/player²; max 115.94958600000245 ms)
- 10 seats: 27 games, 37 ms/game (0.37 ms/player²; max 117.99006699999882 ms)
- 11 seats: 27 games, 38 ms/game (0.31 ms/player²; max 93.99460099999851 ms)
- 12 seats: 27 games, 52 ms/game (0.36 ms/player²; max 232.26943799999935 ms)
- 13 seats: 27 games, 81 ms/game (0.48 ms/player²; max 253.5782070000023 ms)
- 14 seats: 27 games, 69 ms/game (0.35 ms/player²; max 240.84993499999837 ms)
- 15 seats: 356 games, 93 ms/game (0.41 ms/player²; max 542.6610169999985 ms)
- 16 seats: 27 games, 72 ms/game (0.28 ms/player²; max 133.00081800000044 ms)
- 17 seats: 27 games, 83 ms/game (0.29 ms/player²; max 173.85019499999908 ms)
- 18 seats: 27 games, 92 ms/game (0.28 ms/player²; max 203.9940510000015 ms)
- 19 seats: 27 games, 96 ms/game (0.27 ms/player²; max 147.23582700000043 ms)
- 20 seats: 27 games, 106 ms/game (0.26 ms/player²; max 198.70467800000188 ms)
- 21 seats: 27 games, 148 ms/game (0.34 ms/player²; max 244.33254699999816 ms)
- 22 seats: 27 games, 158 ms/game (0.33 ms/player²; max 298.9510880000016 ms)
- 23 seats: 27 games, 180 ms/game (0.34 ms/player²; max 298.74058499999956 ms)
- 24 seats: 27 games, 205 ms/game (0.36 ms/player²; max 377.961467000001 ms)
- 25 seats: 27 games, 206 ms/game (0.33 ms/player²; max 390.87681399999565 ms)
- 26 seats: 27 games, 242 ms/game (0.36 ms/player²; max 415.16106500000024 ms)
- 27 seats: 27 games, 213 ms/game (0.29 ms/player²; max 361.5963119999942 ms)
- 28 seats: 27 games, 219 ms/game (0.28 ms/player²; max 375.27817199999845 ms)
- 29 seats: 27 games, 282 ms/game (0.34 ms/player²; max 388.397312999994 ms)
- 30 seats: 101 games, 436 ms/game (0.48 ms/player²; max 1102.7086529999942 ms)
- 31 seats: 99 games, 410 ms/game (0.43 ms/player²; max 1211.344907000006 ms)
- 32 seats: 100 games, 435 ms/game (0.42 ms/player²; max 1492.5860519999987 ms)
- 33 seats: 98 games, 402 ms/game (0.37 ms/player²; max 1321.0082709999988 ms)
- 34 seats: 99 games, 478 ms/game (0.41 ms/player²; max 1424.3452959999995 ms)
- 35 seats: 103 games, 576 ms/game (0.47 ms/player²; max 1648.880296999996 ms)
- 36 seats: 100 games, 589 ms/game (0.45 ms/player²; max 2072.1122929999983 ms)
- 37 seats: 97 games, 571 ms/game (0.42 ms/player²; max 1352.6335459999973 ms)
- 38 seats: 97 games, 587 ms/game (0.41 ms/player²; max 1696.429946999997 ms)
- 39 seats: 97 games, 679 ms/game (0.45 ms/player²; max 1803.753739000007 ms)
- 40 seats: 213 games, 795 ms/game (0.50 ms/player²; max 2875.0609699999986 ms)

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

# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-15T05:48:48.520Z
Duration: 145511 ms

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

- 5 seats: 359 games, 10 ms/game (0.41 ms/player²; max 165.61942299999646 ms)
- 6 seats: 18 games, 31 ms/game (0.87 ms/player²; max 126.00192699999752 ms)
- 7 seats: 21 games, 41 ms/game (0.83 ms/player²; max 112.17810299999837 ms)
- 8 seats: 24 games, 47 ms/game (0.73 ms/player²; max 128.03744700000243 ms)
- 9 seats: 27 games, 43 ms/game (0.53 ms/player²; max 130.3834760000027 ms)
- 10 seats: 27 games, 26 ms/game (0.26 ms/player²; max 95.23601500000223 ms)
- 11 seats: 27 games, 26 ms/game (0.21 ms/player²; max 67.70604199999798 ms)
- 12 seats: 27 games, 38 ms/game (0.26 ms/player²; max 87.4960360000041 ms)
- 13 seats: 27 games, 39 ms/game (0.23 ms/player²; max 82.9708610000016 ms)
- 14 seats: 27 games, 66 ms/game (0.34 ms/player²; max 198.7268799999947 ms)
- 15 seats: 356 games, 83 ms/game (0.37 ms/player²; max 313.6818559999956 ms)
- 16 seats: 27 games, 52 ms/game (0.20 ms/player²; max 116.34222800000134 ms)
- 17 seats: 27 games, 66 ms/game (0.23 ms/player²; max 119.81160599999566 ms)
- 18 seats: 27 games, 94 ms/game (0.29 ms/player²; max 183.72523700000602 ms)
- 19 seats: 27 games, 106 ms/game (0.29 ms/player²; max 196.36184499999945 ms)
- 20 seats: 27 games, 95 ms/game (0.24 ms/player²; max 209.95202599999902 ms)
- 21 seats: 27 games, 115 ms/game (0.26 ms/player²; max 226.39378399999987 ms)
- 22 seats: 27 games, 138 ms/game (0.29 ms/player²; max 226.03637799999706 ms)
- 23 seats: 27 games, 148 ms/game (0.28 ms/player²; max 215.46858500000235 ms)
- 24 seats: 27 games, 171 ms/game (0.30 ms/player²; max 282.2283910000042 ms)
- 25 seats: 27 games, 183 ms/game (0.29 ms/player²; max 276.9004649999988 ms)
- 26 seats: 27 games, 207 ms/game (0.31 ms/player²; max 369.31493999999657 ms)
- 27 seats: 27 games, 209 ms/game (0.29 ms/player²; max 334.60737599999993 ms)
- 28 seats: 27 games, 204 ms/game (0.26 ms/player²; max 318.4627219999966 ms)
- 29 seats: 27 games, 240 ms/game (0.29 ms/player²; max 307.2418869999965 ms)
- 30 seats: 101 games, 459 ms/game (0.51 ms/player²; max 1337.260482999991 ms)
- 31 seats: 99 games, 411 ms/game (0.43 ms/player²; max 979.6280780000088 ms)
- 32 seats: 100 games, 413 ms/game (0.40 ms/player²; max 1173.370425999994 ms)
- 33 seats: 98 games, 384 ms/game (0.35 ms/player²; max 977.617836999998 ms)
- 34 seats: 99 games, 426 ms/game (0.37 ms/player²; max 1234.7403119999944 ms)
- 35 seats: 103 games, 526 ms/game (0.43 ms/player²; max 1459.9016140000022 ms)
- 36 seats: 100 games, 541 ms/game (0.42 ms/player²; max 1336.551311999996 ms)
- 37 seats: 97 games, 534 ms/game (0.39 ms/player²; max 1031.2668549999944 ms)
- 38 seats: 97 games, 539 ms/game (0.37 ms/player²; max 1333.1344240000035 ms)
- 39 seats: 97 games, 671 ms/game (0.44 ms/player²; max 1752.4028680000047 ms)
- 40 seats: 213 games, 750 ms/game (0.47 ms/player²; max 1936.7349790000007 ms)

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

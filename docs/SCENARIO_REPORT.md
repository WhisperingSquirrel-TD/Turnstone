# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-13T22:15:47.674Z
Duration: 489571 ms

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

- 5 seats: 359 games, 15 ms/game (0.59 ms/player²; max 95.5070029999988 ms)
- 6 seats: 18 games, 21 ms/game (0.58 ms/player²; max 51.93924500000139 ms)
- 7 seats: 21 games, 30 ms/game (0.62 ms/player²; max 65.14348999999493 ms)
- 8 seats: 24 games, 37 ms/game (0.57 ms/player²; max 102.35971699999936 ms)
- 9 seats: 27 games, 35 ms/game (0.43 ms/player²; max 103.58044800000062 ms)
- 10 seats: 27 games, 38 ms/game (0.38 ms/player²; max 154.44485400000121 ms)
- 11 seats: 27 games, 43 ms/game (0.36 ms/player²; max 138.3248569999996 ms)
- 12 seats: 27 games, 54 ms/game (0.37 ms/player²; max 138.4587509999983 ms)
- 13 seats: 27 games, 64 ms/game (0.38 ms/player²; max 149.90585800000554 ms)
- 14 seats: 27 games, 106 ms/game (0.54 ms/player²; max 323.42307399999845 ms)
- 15 seats: 356 games, 164 ms/game (0.73 ms/player²; max 906.7054199999984 ms)
- 16 seats: 27 games, 95 ms/game (0.37 ms/player²; max 250.18533500000194 ms)
- 17 seats: 27 games, 110 ms/game (0.38 ms/player²; max 264.9606149999963 ms)
- 18 seats: 27 games, 154 ms/game (0.48 ms/player²; max 319.7007039999953 ms)
- 19 seats: 27 games, 219 ms/game (0.61 ms/player²; max 549.753896000002 ms)
- 20 seats: 27 games, 159 ms/game (0.40 ms/player²; max 309.1932769999985 ms)
- 21 seats: 27 games, 206 ms/game (0.47 ms/player²; max 371.7346800000014 ms)
- 22 seats: 27 games, 218 ms/game (0.45 ms/player²; max 348.13922699999966 ms)
- 23 seats: 27 games, 246 ms/game (0.47 ms/player²; max 409.21835499999725 ms)
- 24 seats: 27 games, 283 ms/game (0.49 ms/player²; max 535.983156000002 ms)
- 25 seats: 27 games, 312 ms/game (0.50 ms/player²; max 519.0962549999967 ms)
- 26 seats: 27 games, 333 ms/game (0.49 ms/player²; max 517.6917390000017 ms)
- 27 seats: 27 games, 380 ms/game (0.52 ms/player²; max 639.9654680000021 ms)
- 28 seats: 27 games, 401 ms/game (0.51 ms/player²; max 682.3615649999992 ms)
- 29 seats: 27 games, 463 ms/game (0.55 ms/player²; max 728.9326150000052 ms)
- 30 seats: 101 games, 1299 ms/game (1.44 ms/player²; max 12275.67998299998 ms)
- 31 seats: 99 games, 1118 ms/game (1.16 ms/player²; max 6948.078758999996 ms)
- 32 seats: 100 games, 1690 ms/game (1.65 ms/player²; max 18864.01847499999 ms)
- 33 seats: 98 games, 1544 ms/game (1.42 ms/player²; max 16132.423716999998 ms)
- 34 seats: 99 games, 2143 ms/game (1.85 ms/player²; max 29159.955051000026 ms)
- 35 seats: 103 games, 2713 ms/game (2.21 ms/player²; max 29348.99859699997 ms)
- 36 seats: 100 games, 2546 ms/game (1.96 ms/player²; max 26342.430491000006 ms)
- 37 seats: 97 games, 1775 ms/game (1.30 ms/player²; max 11891.629849999968 ms)
- 38 seats: 97 games, 2508 ms/game (1.74 ms/player²; max 32211.66096400004 ms)
- 39 seats: 97 games, 2873 ms/game (1.89 ms/player²; max 34440.58264500002 ms)
- 40 seats: 213 games, 3089 ms/game (1.93 ms/player²; max 24392.191730000006 ms)

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

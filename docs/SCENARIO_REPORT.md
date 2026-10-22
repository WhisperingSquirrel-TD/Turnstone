# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-22T05:22:31.881Z
Duration: 119652 ms

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

- 5 seats: 359 games, 9 ms/game (0.35 ms/player²; max 82.72872100000313 ms)
- 6 seats: 18 games, 21 ms/game (0.57 ms/player²; max 64.38251599999785 ms)
- 7 seats: 21 games, 20 ms/game (0.41 ms/player²; max 64.44414099999995 ms)
- 8 seats: 24 games, 27 ms/game (0.42 ms/player²; max 83.41716100000122 ms)
- 9 seats: 27 games, 32 ms/game (0.39 ms/player²; max 103.04646800000046 ms)
- 10 seats: 27 games, 26 ms/game (0.26 ms/player²; max 75.55445000000327 ms)
- 11 seats: 27 games, 26 ms/game (0.22 ms/player²; max 115.92308000000048 ms)
- 12 seats: 27 games, 41 ms/game (0.28 ms/player²; max 138.96678600000087 ms)
- 13 seats: 27 games, 74 ms/game (0.44 ms/player²; max 242.91693899999882 ms)
- 14 seats: 27 games, 60 ms/game (0.31 ms/player²; max 256.4904999999999 ms)
- 15 seats: 356 games, 78 ms/game (0.35 ms/player²; max 374.6463290000029 ms)
- 16 seats: 27 games, 60 ms/game (0.24 ms/player²; max 141.50009399999908 ms)
- 17 seats: 27 games, 92 ms/game (0.32 ms/player²; max 401.39187799999854 ms)
- 18 seats: 27 games, 150 ms/game (0.46 ms/player²; max 437.828891000001 ms)
- 19 seats: 27 games, 100 ms/game (0.28 ms/player²; max 425.7362570000005 ms)
- 20 seats: 27 games, 94 ms/game (0.23 ms/player²; max 145.19524599999932 ms)
- 21 seats: 27 games, 133 ms/game (0.30 ms/player²; max 243.125677 ms)
- 22 seats: 27 games, 131 ms/game (0.27 ms/player²; max 261.883170000001 ms)
- 23 seats: 27 games, 158 ms/game (0.30 ms/player²; max 287.43688100000145 ms)
- 24 seats: 27 games, 181 ms/game (0.31 ms/player²; max 297.03118800000084 ms)
- 25 seats: 27 games, 164 ms/game (0.26 ms/player²; max 297.995508 ms)
- 26 seats: 27 games, 172 ms/game (0.25 ms/player²; max 266.28730799999903 ms)
- 27 seats: 27 games, 191 ms/game (0.26 ms/player²; max 293.5804100000023 ms)
- 28 seats: 27 games, 189 ms/game (0.24 ms/player²; max 322.40698800000246 ms)
- 29 seats: 27 games, 260 ms/game (0.31 ms/player²; max 401.9834809999993 ms)
- 30 seats: 101 games, 366 ms/game (0.41 ms/player²; max 1247.0857169999945 ms)
- 31 seats: 99 games, 346 ms/game (0.36 ms/player²; max 917.5964850000018 ms)
- 32 seats: 100 games, 392 ms/game (0.38 ms/player²; max 1302.052198999998 ms)
- 33 seats: 98 games, 351 ms/game (0.32 ms/player²; max 1107.668359999996 ms)
- 34 seats: 99 games, 409 ms/game (0.35 ms/player²; max 1406.3773609999917 ms)
- 35 seats: 103 games, 488 ms/game (0.40 ms/player²; max 1593.8478020000039 ms)
- 36 seats: 100 games, 530 ms/game (0.41 ms/player²; max 2308.599451999995 ms)
- 37 seats: 97 games, 518 ms/game (0.38 ms/player²; max 1296.111984999996 ms)
- 38 seats: 97 games, 515 ms/game (0.36 ms/player²; max 1711.2682440000062 ms)
- 39 seats: 97 games, 618 ms/game (0.41 ms/player²; max 1942.0798499999946 ms)
- 40 seats: 213 games, 708 ms/game (0.44 ms/player²; max 2645.840630999999 ms)

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

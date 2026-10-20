# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-20T14:23:34.122Z
Duration: 167885 ms

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

- 5 seats: 359 games, 12 ms/game (0.46 ms/player²; max 107.52335500000481 ms)
- 6 seats: 18 games, 45 ms/game (1.24 ms/player²; max 179.34686499999953 ms)
- 7 seats: 21 games, 36 ms/game (0.73 ms/player²; max 159.71498900000006 ms)
- 8 seats: 24 games, 36 ms/game (0.57 ms/player²; max 125.89306699999725 ms)
- 9 seats: 27 games, 44 ms/game (0.54 ms/player²; max 115.17410499999824 ms)
- 10 seats: 27 games, 39 ms/game (0.39 ms/player²; max 83.63769999999931 ms)
- 11 seats: 27 games, 39 ms/game (0.32 ms/player²; max 128.7022399999987 ms)
- 12 seats: 27 games, 56 ms/game (0.39 ms/player²; max 343.20054700000037 ms)
- 13 seats: 27 games, 113 ms/game (0.67 ms/player²; max 350.01163200000155 ms)
- 14 seats: 27 games, 65 ms/game (0.33 ms/player²; max 183.78338200000144 ms)
- 15 seats: 356 games, 108 ms/game (0.48 ms/player²; max 511.51967599999625 ms)
- 16 seats: 27 games, 82 ms/game (0.32 ms/player²; max 188.6553750000021 ms)
- 17 seats: 27 games, 125 ms/game (0.43 ms/player²; max 398.5712249999997 ms)
- 18 seats: 27 games, 217 ms/game (0.67 ms/player²; max 554.0580789999949 ms)
- 19 seats: 27 games, 131 ms/game (0.36 ms/player²; max 239.7122540000055 ms)
- 20 seats: 27 games, 137 ms/game (0.34 ms/player²; max 235.6563989999995 ms)
- 21 seats: 27 games, 170 ms/game (0.39 ms/player²; max 287.7827010000037 ms)
- 22 seats: 27 games, 196 ms/game (0.40 ms/player²; max 307.7481740000003 ms)
- 23 seats: 27 games, 227 ms/game (0.43 ms/player²; max 389.7554270000037 ms)
- 24 seats: 27 games, 241 ms/game (0.42 ms/player²; max 417.8545349999986 ms)
- 25 seats: 27 games, 237 ms/game (0.38 ms/player²; max 423.53925600000366 ms)
- 26 seats: 27 games, 237 ms/game (0.35 ms/player²; max 392.31964999999764 ms)
- 27 seats: 27 games, 243 ms/game (0.33 ms/player²; max 373.34551400000055 ms)
- 28 seats: 27 games, 281 ms/game (0.36 ms/player²; max 538.2486839999983 ms)
- 29 seats: 27 games, 364 ms/game (0.43 ms/player²; max 590.1884960000025 ms)
- 30 seats: 101 games, 511 ms/game (0.57 ms/player²; max 1453.3986429999932 ms)
- 31 seats: 99 games, 483 ms/game (0.50 ms/player²; max 1452.4908120000036 ms)
- 32 seats: 100 games, 670 ms/game (0.65 ms/player²; max 3751.1634889999987 ms)
- 33 seats: 98 games, 523 ms/game (0.48 ms/player²; max 1987.009589999987 ms)
- 34 seats: 99 games, 592 ms/game (0.51 ms/player²; max 1971.3952940000017 ms)
- 35 seats: 103 games, 674 ms/game (0.55 ms/player²; max 2465.9231969999964 ms)
- 36 seats: 100 games, 733 ms/game (0.57 ms/player²; max 3120.456714 ms)
- 37 seats: 97 games, 738 ms/game (0.54 ms/player²; max 1955.1803479999944 ms)
- 38 seats: 97 games, 741 ms/game (0.51 ms/player²; max 2234.021356000012 ms)
- 39 seats: 97 games, 858 ms/game (0.56 ms/player²; max 2581.5335650000197 ms)
- 40 seats: 213 games, 986 ms/game (0.62 ms/player²; max 3478.62249899999 ms)

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

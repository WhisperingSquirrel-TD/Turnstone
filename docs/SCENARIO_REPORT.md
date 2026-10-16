# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-16T13:40:51.492Z
Duration: 136462 ms

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

- 5 seats: 359 games, 9 ms/game (0.37 ms/player²; max 126.75725199999943 ms)
- 6 seats: 18 games, 28 ms/game (0.79 ms/player²; max 70.78437400000257 ms)
- 7 seats: 21 games, 22 ms/game (0.44 ms/player²; max 59.0800199999976 ms)
- 8 seats: 24 games, 34 ms/game (0.53 ms/player²; max 88.85678499999995 ms)
- 9 seats: 27 games, 29 ms/game (0.36 ms/player²; max 96.49730600000112 ms)
- 10 seats: 27 games, 32 ms/game (0.32 ms/player²; max 123.23961700000291 ms)
- 11 seats: 27 games, 29 ms/game (0.24 ms/player²; max 74.41682299999957 ms)
- 12 seats: 27 games, 38 ms/game (0.27 ms/player²; max 94.01944999999978 ms)
- 13 seats: 27 games, 109 ms/game (0.65 ms/player²; max 396.5196419999993 ms)
- 14 seats: 27 games, 70 ms/game (0.36 ms/player²; max 366.28375099999903 ms)
- 15 seats: 356 games, 89 ms/game (0.40 ms/player²; max 688.5662469999952 ms)
- 16 seats: 27 games, 69 ms/game (0.27 ms/player²; max 135.61354800000117 ms)
- 17 seats: 27 games, 115 ms/game (0.40 ms/player²; max 671.5105399999993 ms)
- 18 seats: 27 games, 159 ms/game (0.49 ms/player²; max 517.5633969999981 ms)
- 19 seats: 27 games, 87 ms/game (0.24 ms/player²; max 142.04987900000197 ms)
- 20 seats: 27 games, 104 ms/game (0.26 ms/player²; max 196.53503700000147 ms)
- 21 seats: 27 games, 124 ms/game (0.28 ms/player²; max 225.00687900000048 ms)
- 22 seats: 27 games, 129 ms/game (0.27 ms/player²; max 224.55829599999925 ms)
- 23 seats: 27 games, 161 ms/game (0.30 ms/player²; max 334.74282200000016 ms)
- 24 seats: 27 games, 198 ms/game (0.34 ms/player²; max 408.7885460000034 ms)
- 25 seats: 27 games, 166 ms/game (0.27 ms/player²; max 277.34654600000067 ms)
- 26 seats: 27 games, 173 ms/game (0.26 ms/player²; max 269.1726469999994 ms)
- 27 seats: 27 games, 186 ms/game (0.26 ms/player²; max 279.78067600000213 ms)
- 28 seats: 27 games, 208 ms/game (0.27 ms/player²; max 356.8152589999954 ms)
- 29 seats: 27 games, 242 ms/game (0.29 ms/player²; max 372.85911399999895 ms)
- 30 seats: 101 games, 393 ms/game (0.44 ms/player²; max 1717.9800070000056 ms)
- 31 seats: 99 games, 418 ms/game (0.44 ms/player²; max 1323.9564819999941 ms)
- 32 seats: 100 games, 469 ms/game (0.46 ms/player²; max 1698.8397220000043 ms)
- 33 seats: 98 games, 510 ms/game (0.47 ms/player²; max 1471.9426350000067 ms)
- 34 seats: 99 games, 528 ms/game (0.46 ms/player²; max 1824.244928 ms)
- 35 seats: 103 games, 519 ms/game (0.42 ms/player²; max 1772.0722959999985 ms)
- 36 seats: 100 games, 547 ms/game (0.42 ms/player²; max 2249.9639929999976 ms)
- 37 seats: 97 games, 523 ms/game (0.38 ms/player²; max 1197.9209679999913 ms)
- 38 seats: 97 games, 576 ms/game (0.40 ms/player²; max 2076.7377960000013 ms)
- 39 seats: 97 games, 671 ms/game (0.44 ms/player²; max 2168.8324929999944 ms)
- 40 seats: 213 games, 813 ms/game (0.51 ms/player²; max 2996.080083999994 ms)

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

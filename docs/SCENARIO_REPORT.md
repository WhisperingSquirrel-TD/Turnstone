# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-22T16:21:23.015Z
Duration: 557520 ms

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

- 5 seats: 359 games, 15 ms/game (0.60 ms/player²; max 167.10685699999885 ms)
- 6 seats: 18 games, 45 ms/game (1.25 ms/player²; max 100.26735600000393 ms)
- 7 seats: 21 games, 33 ms/game (0.67 ms/player²; max 107.13779900000372 ms)
- 8 seats: 24 games, 43 ms/game (0.67 ms/player²; max 142.60184899999877 ms)
- 9 seats: 27 games, 50 ms/game (0.62 ms/player²; max 172.6150359999956 ms)
- 10 seats: 27 games, 71 ms/game (0.71 ms/player²; max 529.2783629999976 ms)
- 11 seats: 27 games, 111 ms/game (0.92 ms/player²; max 559.3979529999997 ms)
- 12 seats: 27 games, 109 ms/game (0.76 ms/player²; max 459.3134449999998 ms)
- 13 seats: 27 games, 96 ms/game (0.57 ms/player²; max 479.03906399999687 ms)
- 14 seats: 27 games, 98 ms/game (0.50 ms/player²; max 403.83049899999605 ms)
- 15 seats: 356 games, 216 ms/game (0.96 ms/player²; max 1796.4292980000027 ms)
- 16 seats: 27 games, 211 ms/game (0.83 ms/player²; max 953.5472230000014 ms)
- 17 seats: 27 games, 170 ms/game (0.59 ms/player²; max 703.2120240000004 ms)
- 18 seats: 27 games, 201 ms/game (0.62 ms/player²; max 844.9092199999941 ms)
- 19 seats: 27 games, 219 ms/game (0.61 ms/player²; max 969.2923260000025 ms)
- 20 seats: 27 games, 270 ms/game (0.68 ms/player²; max 1132.9439530000018 ms)
- 21 seats: 27 games, 308 ms/game (0.70 ms/player²; max 1454.635282999996 ms)
- 22 seats: 27 games, 382 ms/game (0.79 ms/player²; max 1785.9134790000026 ms)
- 23 seats: 27 games, 403 ms/game (0.76 ms/player²; max 1607.0982399999994 ms)
- 24 seats: 27 games, 515 ms/game (0.89 ms/player²; max 2730.080740999998 ms)
- 25 seats: 27 games, 548 ms/game (0.88 ms/player²; max 2387.167699999998 ms)
- 26 seats: 27 games, 633 ms/game (0.94 ms/player²; max 2712.466852000005 ms)
- 27 seats: 27 games, 769 ms/game (1.05 ms/player²; max 2970.3398279999965 ms)
- 28 seats: 27 games, 865 ms/game (1.10 ms/player²; max 3883.8942519999982 ms)
- 29 seats: 27 games, 983 ms/game (1.17 ms/player²; max 4336.061791 ms)
- 30 seats: 101 games, 1339 ms/game (1.49 ms/player²; max 11219.226217999996 ms)
- 31 seats: 99 games, 1607 ms/game (1.67 ms/player²; max 18261.785549000022 ms)
- 32 seats: 100 games, 2181 ms/game (2.13 ms/player²; max 31249.356940999976 ms)
- 33 seats: 98 games, 2342 ms/game (2.15 ms/player²; max 18172.062957999995 ms)
- 34 seats: 99 games, 2143 ms/game (1.85 ms/player²; max 17106.240810999996 ms)
- 35 seats: 103 games, 2840 ms/game (2.32 ms/player²; max 22142.861464000016 ms)
- 36 seats: 100 games, 3317 ms/game (2.56 ms/player²; max 37575.44867299998 ms)
- 37 seats: 97 games, 3332 ms/game (2.43 ms/player²; max 34551.21165000001 ms)
- 38 seats: 97 games, 2583 ms/game (1.79 ms/player²; max 25875.177761 ms)
- 39 seats: 97 games, 3215 ms/game (2.11 ms/player²; max 26961.371260999993 ms)
- 40 seats: 213 games, 4391 ms/game (2.74 ms/player²; max 44622.234092 ms)

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

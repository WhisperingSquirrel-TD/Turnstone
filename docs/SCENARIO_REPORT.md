# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T23:48:12.988Z
Duration: 148074 ms

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

- 5 seats: 359 games, 7 ms/game (0.30 ms/player²; max 76.4203239999988 ms)
- 6 seats: 18 games, 22 ms/game (0.61 ms/player²; max 73.39187200000015 ms)
- 7 seats: 21 games, 29 ms/game (0.58 ms/player²; max 94.84551900000224 ms)
- 8 seats: 24 games, 47 ms/game (0.73 ms/player²; max 283.33627899999556 ms)
- 9 seats: 27 games, 32 ms/game (0.39 ms/player²; max 131.20122699999774 ms)
- 10 seats: 27 games, 26 ms/game (0.26 ms/player²; max 62.492622999998275 ms)
- 11 seats: 27 games, 29 ms/game (0.24 ms/player²; max 70.7202580000012 ms)
- 12 seats: 27 games, 36 ms/game (0.25 ms/player²; max 93.88086599999951 ms)
- 13 seats: 27 games, 42 ms/game (0.25 ms/player²; max 162.61947399999917 ms)
- 14 seats: 27 games, 98 ms/game (0.50 ms/player²; max 307.2826550000027 ms)
- 15 seats: 356 games, 78 ms/game (0.35 ms/player²; max 306.30722400000377 ms)
- 16 seats: 27 games, 67 ms/game (0.26 ms/player²; max 171.8884390000021 ms)
- 17 seats: 27 games, 80 ms/game (0.28 ms/player²; max 147.92574899999454 ms)
- 18 seats: 27 games, 86 ms/game (0.26 ms/player²; max 157.865088999999 ms)
- 19 seats: 27 games, 174 ms/game (0.48 ms/player²; max 508.41542599999957 ms)
- 20 seats: 27 games, 99 ms/game (0.25 ms/player²; max 155.37397000000055 ms)
- 21 seats: 27 games, 95 ms/game (0.22 ms/player²; max 145.67300099999557 ms)
- 22 seats: 27 games, 125 ms/game (0.26 ms/player²; max 216.4632530000017 ms)
- 23 seats: 27 games, 147 ms/game (0.28 ms/player²; max 254.86097000000154 ms)
- 24 seats: 27 games, 150 ms/game (0.26 ms/player²; max 217.1829429999998 ms)
- 25 seats: 27 games, 175 ms/game (0.28 ms/player²; max 329.41482800000085 ms)
- 26 seats: 27 games, 193 ms/game (0.29 ms/player²; max 314.188473000002 ms)
- 27 seats: 27 games, 196 ms/game (0.27 ms/player²; max 305.00001599999814 ms)
- 28 seats: 27 games, 209 ms/game (0.27 ms/player²; max 366.63552399999753 ms)
- 29 seats: 27 games, 246 ms/game (0.29 ms/player²; max 338.33101899999747 ms)
- 30 seats: 101 games, 391 ms/game (0.43 ms/player²; max 1054.555634999997 ms)
- 31 seats: 99 games, 363 ms/game (0.38 ms/player²; max 829.3066099999996 ms)
- 32 seats: 100 games, 403 ms/game (0.39 ms/player²; max 1127.3643169999996 ms)
- 33 seats: 98 games, 379 ms/game (0.35 ms/player²; max 971.3323519999976 ms)
- 34 seats: 99 games, 424 ms/game (0.37 ms/player²; max 1245.0353979999927 ms)
- 35 seats: 103 games, 520 ms/game (0.42 ms/player²; max 1258.1748210000078 ms)
- 36 seats: 100 games, 734 ms/game (0.57 ms/player²; max 4006.059079999992 ms)
- 37 seats: 97 games, 853 ms/game (0.62 ms/player²; max 3368.048192000002 ms)
- 38 seats: 97 games, 543 ms/game (0.38 ms/player²; max 1437.7929730000033 ms)
- 39 seats: 97 games, 704 ms/game (0.46 ms/player²; max 1862.4748069999914 ms)
- 40 seats: 213 games, 712 ms/game (0.45 ms/player²; max 1909.0386629999994 ms)

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

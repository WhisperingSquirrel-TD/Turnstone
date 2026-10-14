# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T18:00:27.856Z
Duration: 119754 ms

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

- 5 seats: 359 games, 7 ms/game (0.27 ms/player²; max 85.71310499999527 ms)
- 6 seats: 18 games, 20 ms/game (0.57 ms/player²; max 47.37253999999666 ms)
- 7 seats: 21 games, 23 ms/game (0.47 ms/player²; max 66.60423900000023 ms)
- 8 seats: 24 games, 55 ms/game (0.87 ms/player²; max 141.97586700000102 ms)
- 9 seats: 27 games, 30 ms/game (0.37 ms/player²; max 162.6853259999989 ms)
- 10 seats: 27 games, 26 ms/game (0.26 ms/player²; max 82.88477099999727 ms)
- 11 seats: 27 games, 31 ms/game (0.26 ms/player²; max 105.41587599999912 ms)
- 12 seats: 27 games, 37 ms/game (0.26 ms/player²; max 76.72868700000254 ms)
- 13 seats: 27 games, 35 ms/game (0.21 ms/player²; max 63.55659899999591 ms)
- 14 seats: 27 games, 99 ms/game (0.51 ms/player²; max 260.23055499999464 ms)
- 15 seats: 356 games, 62 ms/game (0.28 ms/player²; max 279.35808000000543 ms)
- 16 seats: 27 games, 55 ms/game (0.21 ms/player²; max 99.87168499999825 ms)
- 17 seats: 27 games, 58 ms/game (0.20 ms/player²; max 133.61689299999853 ms)
- 18 seats: 27 games, 66 ms/game (0.20 ms/player²; max 122.17996799999673 ms)
- 19 seats: 27 games, 139 ms/game (0.38 ms/player²; max 454.4195729999992 ms)
- 20 seats: 27 games, 77 ms/game (0.19 ms/player²; max 135.00404399999388 ms)
- 21 seats: 27 games, 88 ms/game (0.20 ms/player²; max 145.4892619999955 ms)
- 22 seats: 27 games, 107 ms/game (0.22 ms/player²; max 202.43187200000102 ms)
- 23 seats: 27 games, 114 ms/game (0.21 ms/player²; max 167.8586329999962 ms)
- 24 seats: 27 games, 129 ms/game (0.22 ms/player²; max 194.5427090000012 ms)
- 25 seats: 27 games, 155 ms/game (0.25 ms/player²; max 250.4111039999989 ms)
- 26 seats: 27 games, 153 ms/game (0.23 ms/player²; max 237.08379300000524 ms)
- 27 seats: 27 games, 162 ms/game (0.22 ms/player²; max 235.86963999999716 ms)
- 28 seats: 27 games, 171 ms/game (0.22 ms/player²; max 245.0634460000001 ms)
- 29 seats: 27 games, 191 ms/game (0.23 ms/player²; max 281.1653890000016 ms)
- 30 seats: 101 games, 316 ms/game (0.35 ms/player²; max 901.9162300000025 ms)
- 31 seats: 99 games, 292 ms/game (0.30 ms/player²; max 722.7971910000051 ms)
- 32 seats: 100 games, 314 ms/game (0.31 ms/player²; max 976.5247040000104 ms)
- 33 seats: 98 games, 301 ms/game (0.28 ms/player²; max 988.1947660000005 ms)
- 34 seats: 99 games, 337 ms/game (0.29 ms/player²; max 979.3868409999995 ms)
- 35 seats: 103 games, 404 ms/game (0.33 ms/player²; max 1118.5875839999935 ms)
- 36 seats: 100 games, 419 ms/game (0.32 ms/player²; max 1072.167855000007 ms)
- 37 seats: 97 games, 407 ms/game (0.30 ms/player²; max 864.6905260000058 ms)
- 38 seats: 97 games, 414 ms/game (0.29 ms/player²; max 1213.1031879999937 ms)
- 39 seats: 97 games, 498 ms/game (0.33 ms/player²; max 1395.8943500000023 ms)
- 40 seats: 213 games, 547 ms/game (0.34 ms/player²; max 1518.3333120000025 ms)

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

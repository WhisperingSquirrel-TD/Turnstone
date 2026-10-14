# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T00:05:04.111Z
Duration: 97043 ms

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

- 5 seats: 359 games, 5 ms/game (0.21 ms/player²; max 52.16174599999795 ms)
- 6 seats: 18 games, 14 ms/game (0.40 ms/player²; max 43.26019300000189 ms)
- 7 seats: 21 games, 14 ms/game (0.29 ms/player²; max 37.82071700000233 ms)
- 8 seats: 24 games, 29 ms/game (0.45 ms/player²; max 115.07796600000438 ms)
- 9 seats: 27 games, 30 ms/game (0.37 ms/player²; max 91.73067399999854 ms)
- 10 seats: 27 games, 28 ms/game (0.28 ms/player²; max 108.69180400000187 ms)
- 11 seats: 27 games, 24 ms/game (0.20 ms/player²; max 92.65284099999553 ms)
- 12 seats: 27 games, 24 ms/game (0.17 ms/player²; max 59.2841369999951 ms)
- 13 seats: 27 games, 30 ms/game (0.18 ms/player²; max 91.92698300000484 ms)
- 14 seats: 27 games, 66 ms/game (0.33 ms/player²; max 252.25877500000206 ms)
- 15 seats: 356 games, 54 ms/game (0.24 ms/player²; max 308.04593800000293 ms)
- 16 seats: 27 games, 39 ms/game (0.15 ms/player²; max 78.39681299999938 ms)
- 17 seats: 27 games, 42 ms/game (0.15 ms/player²; max 79.38485699999728 ms)
- 18 seats: 27 games, 55 ms/game (0.17 ms/player²; max 100.52660499999911 ms)
- 19 seats: 27 games, 75 ms/game (0.21 ms/player²; max 146.62611800000013 ms)
- 20 seats: 27 games, 69 ms/game (0.17 ms/player²; max 140.98741700000392 ms)
- 21 seats: 27 games, 70 ms/game (0.16 ms/player²; max 118.92242899999837 ms)
- 22 seats: 27 games, 79 ms/game (0.16 ms/player²; max 127.15047300000151 ms)
- 23 seats: 27 games, 82 ms/game (0.16 ms/player²; max 178.99264799999946 ms)
- 24 seats: 27 games, 93 ms/game (0.16 ms/player²; max 155.94961399999738 ms)
- 25 seats: 27 games, 113 ms/game (0.18 ms/player²; max 199.12125899999955 ms)
- 26 seats: 27 games, 135 ms/game (0.20 ms/player²; max 224.21425199999794 ms)
- 27 seats: 27 games, 135 ms/game (0.18 ms/player²; max 193.37057500000083 ms)
- 28 seats: 27 games, 128 ms/game (0.16 ms/player²; max 200.1639340000038 ms)
- 29 seats: 27 games, 148 ms/game (0.18 ms/player²; max 224.79785399999673 ms)
- 30 seats: 101 games, 258 ms/game (0.29 ms/player²; max 632.7597230000029 ms)
- 31 seats: 99 games, 234 ms/game (0.24 ms/player²; max 555.9468599999964 ms)
- 32 seats: 100 games, 252 ms/game (0.25 ms/player²; max 727.0531489999994 ms)
- 33 seats: 98 games, 241 ms/game (0.22 ms/player²; max 672.4567339999921 ms)
- 34 seats: 99 games, 274 ms/game (0.24 ms/player²; max 697.5092140000052 ms)
- 35 seats: 103 games, 325 ms/game (0.27 ms/player²; max 775.9884489999968 ms)
- 36 seats: 100 games, 327 ms/game (0.25 ms/player²; max 1064.385700999992 ms)
- 37 seats: 97 games, 327 ms/game (0.24 ms/player²; max 670.0378709999932 ms)
- 38 seats: 97 games, 365 ms/game (0.25 ms/player²; max 964.6716410000081 ms)
- 39 seats: 97 games, 436 ms/game (0.29 ms/player²; max 1301.8975460000074 ms)
- 40 seats: 213 games, 459 ms/game (0.29 ms/player²; max 1276.7192580000046 ms)

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

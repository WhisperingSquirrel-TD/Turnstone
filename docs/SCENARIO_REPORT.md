# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-15T00:51:30.974Z
Duration: 147999 ms

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

- 5 seats: 359 games, 7 ms/game (0.29 ms/player²; max 64.51952699999674 ms)
- 6 seats: 18 games, 15 ms/game (0.42 ms/player²; max 30.160682000001543 ms)
- 7 seats: 21 games, 30 ms/game (0.60 ms/player²; max 71.78031100000226 ms)
- 8 seats: 24 games, 40 ms/game (0.63 ms/player²; max 141.02722599999834 ms)
- 9 seats: 27 games, 19 ms/game (0.24 ms/player²; max 53.06747900000482 ms)
- 10 seats: 27 games, 20 ms/game (0.20 ms/player²; max 48.37201300000015 ms)
- 11 seats: 27 games, 26 ms/game (0.21 ms/player²; max 64.72900600000139 ms)
- 12 seats: 27 games, 31 ms/game (0.22 ms/player²; max 79.50638900000195 ms)
- 13 seats: 27 games, 32 ms/game (0.19 ms/player²; max 95.03696800000034 ms)
- 14 seats: 27 games, 47 ms/game (0.24 ms/player²; max 122.69678600000043 ms)
- 15 seats: 356 games, 78 ms/game (0.35 ms/player²; max 356.32811600000423 ms)
- 16 seats: 27 games, 50 ms/game (0.20 ms/player²; max 91.94164799999999 ms)
- 17 seats: 27 games, 62 ms/game (0.21 ms/player²; max 107.2425579999981 ms)
- 18 seats: 27 games, 77 ms/game (0.24 ms/player²; max 150.17048699999577 ms)
- 19 seats: 27 games, 216 ms/game (0.60 ms/player²; max 623.0035669999997 ms)
- 20 seats: 27 games, 106 ms/game (0.27 ms/player²; max 198.39584999999352 ms)
- 21 seats: 27 games, 127 ms/game (0.29 ms/player²; max 210.747500999998 ms)
- 22 seats: 27 games, 140 ms/game (0.29 ms/player²; max 216.72718000000168 ms)
- 23 seats: 27 games, 147 ms/game (0.28 ms/player²; max 220.05187200000364 ms)
- 24 seats: 27 games, 175 ms/game (0.30 ms/player²; max 314.10846299999685 ms)
- 25 seats: 27 games, 193 ms/game (0.31 ms/player²; max 312.5140410000022 ms)
- 26 seats: 27 games, 206 ms/game (0.30 ms/player²; max 334.2804099999994 ms)
- 27 seats: 27 games, 213 ms/game (0.29 ms/player²; max 359.7864649999974 ms)
- 28 seats: 27 games, 217 ms/game (0.28 ms/player²; max 319.87128200000006 ms)
- 29 seats: 27 games, 242 ms/game (0.29 ms/player²; max 309.3784950000045 ms)
- 30 seats: 101 games, 435 ms/game (0.48 ms/player²; max 1054.9159859999927 ms)
- 31 seats: 99 games, 368 ms/game (0.38 ms/player²; max 897.9364139999961 ms)
- 32 seats: 100 games, 406 ms/game (0.40 ms/player²; max 1201.4587620000093 ms)
- 33 seats: 98 games, 381 ms/game (0.35 ms/player²; max 1093.867035000003 ms)
- 34 seats: 99 games, 450 ms/game (0.39 ms/player²; max 1256.192234999995 ms)
- 35 seats: 103 games, 524 ms/game (0.43 ms/player²; max 1212.0981400000019 ms)
- 36 seats: 100 games, 524 ms/game (0.40 ms/player²; max 1276.843015999999 ms)
- 37 seats: 97 games, 515 ms/game (0.38 ms/player²; max 1039.8039740000095 ms)
- 38 seats: 97 games, 541 ms/game (0.37 ms/player²; max 1520.4806970000063 ms)
- 39 seats: 97 games, 683 ms/game (0.45 ms/player²; max 1640.9012820000062 ms)
- 40 seats: 213 games, 727 ms/game (0.45 ms/player²; max 1874.579904000013 ms)

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

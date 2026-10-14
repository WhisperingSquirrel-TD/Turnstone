# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T17:04:57.177Z
Duration: 123829 ms

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

- 5 seats: 359 games, 6 ms/game (0.25 ms/player²; max 51.12326900000335 ms)
- 6 seats: 18 games, 11 ms/game (0.32 ms/player²; max 28.539187999995193 ms)
- 7 seats: 21 games, 22 ms/game (0.44 ms/player²; max 43.84668600000441 ms)
- 8 seats: 24 games, 36 ms/game (0.56 ms/player²; max 114.99826100000064 ms)
- 9 seats: 27 games, 33 ms/game (0.41 ms/player²; max 156.29482400000416 ms)
- 10 seats: 27 games, 19 ms/game (0.19 ms/player²; max 35.90969800000312 ms)
- 11 seats: 27 games, 26 ms/game (0.21 ms/player²; max 75.9953650000025 ms)
- 12 seats: 27 games, 29 ms/game (0.20 ms/player²; max 71.00508299999638 ms)
- 13 seats: 27 games, 38 ms/game (0.22 ms/player²; max 100.15035599999828 ms)
- 14 seats: 27 games, 90 ms/game (0.46 ms/player²; max 256.4459640000059 ms)
- 15 seats: 356 games, 64 ms/game (0.29 ms/player²; max 300.6011110000036 ms)
- 16 seats: 27 games, 47 ms/game (0.18 ms/player²; max 91.16023699999641 ms)
- 17 seats: 27 games, 57 ms/game (0.20 ms/player²; max 124.44423299999471 ms)
- 18 seats: 27 games, 73 ms/game (0.22 ms/player²; max 157.82934699999896 ms)
- 19 seats: 27 games, 192 ms/game (0.53 ms/player²; max 467.2253039999996 ms)
- 20 seats: 27 games, 102 ms/game (0.25 ms/player²; max 242.25513999999384 ms)
- 21 seats: 27 games, 105 ms/game (0.24 ms/player²; max 165.1100260000021 ms)
- 22 seats: 27 games, 125 ms/game (0.26 ms/player²; max 215.52552200000355 ms)
- 23 seats: 27 games, 127 ms/game (0.24 ms/player²; max 194.76892399999633 ms)
- 24 seats: 27 games, 141 ms/game (0.24 ms/player²; max 237.97756200000003 ms)
- 25 seats: 27 games, 137 ms/game (0.22 ms/player²; max 304.1654070000004 ms)
- 26 seats: 27 games, 162 ms/game (0.24 ms/player²; max 252.238526000001 ms)
- 27 seats: 27 games, 160 ms/game (0.22 ms/player²; max 237.8297590000002 ms)
- 28 seats: 27 games, 157 ms/game (0.20 ms/player²; max 257.1656929999954 ms)
- 29 seats: 27 games, 179 ms/game (0.21 ms/player²; max 253.52485899999738 ms)
- 30 seats: 101 games, 326 ms/game (0.36 ms/player²; max 832.6141629999911 ms)
- 31 seats: 99 games, 300 ms/game (0.31 ms/player²; max 806.675178000005 ms)
- 32 seats: 100 games, 330 ms/game (0.32 ms/player²; max 1034.506457999989 ms)
- 33 seats: 98 games, 304 ms/game (0.28 ms/player²; max 823.9272619999974 ms)
- 34 seats: 99 games, 344 ms/game (0.30 ms/player²; max 997.0060839999933 ms)
- 35 seats: 103 games, 414 ms/game (0.34 ms/player²; max 1017.0211859999981 ms)
- 36 seats: 100 games, 410 ms/game (0.32 ms/player²; max 1224.0188460000063 ms)
- 37 seats: 97 games, 413 ms/game (0.30 ms/player²; max 914.3000470000115 ms)
- 38 seats: 97 games, 438 ms/game (0.30 ms/player²; max 1205.4476530000102 ms)
- 39 seats: 97 games, 525 ms/game (0.35 ms/player²; max 1366.2841840000037 ms)
- 40 seats: 213 games, 579 ms/game (0.36 ms/player²; max 1650.2299860000057 ms)

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

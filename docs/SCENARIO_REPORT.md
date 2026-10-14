# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T23:24:08.851Z
Duration: 146448 ms

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

- 5 seats: 359 games, 8 ms/game (0.31 ms/player²; max 79.88260900000023 ms)
- 6 seats: 18 games, 18 ms/game (0.49 ms/player²; max 36.157594999996945 ms)
- 7 seats: 21 games, 31 ms/game (0.62 ms/player²; max 90.08284699999786 ms)
- 8 seats: 24 games, 41 ms/game (0.64 ms/player²; max 150.23223999999755 ms)
- 9 seats: 27 games, 31 ms/game (0.39 ms/player²; max 192.79009800000495 ms)
- 10 seats: 27 games, 26 ms/game (0.26 ms/player²; max 80.34850999999617 ms)
- 11 seats: 27 games, 29 ms/game (0.24 ms/player²; max 80.18118600000162 ms)
- 12 seats: 27 games, 33 ms/game (0.23 ms/player²; max 81.2885310000056 ms)
- 13 seats: 27 games, 53 ms/game (0.31 ms/player²; max 176.32170800000313 ms)
- 14 seats: 27 games, 103 ms/game (0.52 ms/player²; max 378.6592149999997 ms)
- 15 seats: 356 games, 81 ms/game (0.36 ms/player²; max 318.86146300000837 ms)
- 16 seats: 27 games, 60 ms/game (0.23 ms/player²; max 117.88079600000492 ms)
- 17 seats: 27 games, 67 ms/game (0.23 ms/player²; max 134.5344400000031 ms)
- 18 seats: 27 games, 88 ms/game (0.27 ms/player²; max 164.59972500000003 ms)
- 19 seats: 27 games, 221 ms/game (0.61 ms/player²; max 597.4286900000006 ms)
- 20 seats: 27 games, 110 ms/game (0.27 ms/player²; max 199.3460500000001 ms)
- 21 seats: 27 games, 130 ms/game (0.29 ms/player²; max 219.90261699999974 ms)
- 22 seats: 27 games, 148 ms/game (0.31 ms/player²; max 269.9346549999973 ms)
- 23 seats: 27 games, 151 ms/game (0.29 ms/player²; max 258.72848499999964 ms)
- 24 seats: 27 games, 172 ms/game (0.30 ms/player²; max 266.1301550000062 ms)
- 25 seats: 27 games, 197 ms/game (0.31 ms/player²; max 348.8446610000028 ms)
- 26 seats: 27 games, 205 ms/game (0.30 ms/player²; max 396.60976500000106 ms)
- 27 seats: 27 games, 220 ms/game (0.30 ms/player²; max 335.9585169999991 ms)
- 28 seats: 27 games, 227 ms/game (0.29 ms/player²; max 378.880207000002 ms)
- 29 seats: 27 games, 245 ms/game (0.29 ms/player²; max 346.6613179999986 ms)
- 30 seats: 101 games, 406 ms/game (0.45 ms/player²; max 1003.8163219999988 ms)
- 31 seats: 99 games, 402 ms/game (0.42 ms/player²; max 909.8161360000086 ms)
- 32 seats: 100 games, 423 ms/game (0.41 ms/player²; max 1121.4624199999962 ms)
- 33 seats: 98 games, 407 ms/game (0.37 ms/player²; max 1059.1687109999912 ms)
- 34 seats: 99 games, 433 ms/game (0.37 ms/player²; max 1205.281191999995 ms)
- 35 seats: 103 games, 531 ms/game (0.43 ms/player²; max 1414.0070089999936 ms)
- 36 seats: 100 games, 543 ms/game (0.42 ms/player²; max 1268.5113770000025 ms)
- 37 seats: 97 games, 538 ms/game (0.39 ms/player²; max 1085.3210039999976 ms)
- 38 seats: 97 games, 546 ms/game (0.38 ms/player²; max 1305.1342000000004 ms)
- 39 seats: 97 games, 670 ms/game (0.44 ms/player²; max 1594.2523959999962 ms)
- 40 seats: 213 games, 741 ms/game (0.46 ms/player²; max 1867.4409779999987 ms)

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

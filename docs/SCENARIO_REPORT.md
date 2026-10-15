# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-15T07:37:28.401Z
Duration: 156067 ms

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

- 5 seats: 359 games, 8 ms/game (0.33 ms/player²; max 84.19106699999247 ms)
- 6 seats: 18 games, 16 ms/game (0.44 ms/player²; max 32.979098999996495 ms)
- 7 seats: 21 games, 27 ms/game (0.54 ms/player²; max 69.84222800000134 ms)
- 8 seats: 24 games, 41 ms/game (0.64 ms/player²; max 110.59943599999679 ms)
- 9 seats: 27 games, 31 ms/game (0.38 ms/player²; max 127.26290500000323 ms)
- 10 seats: 27 games, 24 ms/game (0.24 ms/player²; max 82.72148400000151 ms)
- 11 seats: 27 games, 29 ms/game (0.24 ms/player²; max 83.52619100000447 ms)
- 12 seats: 27 games, 37 ms/game (0.26 ms/player²; max 82.12934999999561 ms)
- 13 seats: 27 games, 46 ms/game (0.27 ms/player²; max 147.0606240000052 ms)
- 14 seats: 27 games, 94 ms/game (0.48 ms/player²; max 248.6511959999989 ms)
- 15 seats: 356 games, 88 ms/game (0.39 ms/player²; max 503.8726569999999 ms)
- 16 seats: 27 games, 59 ms/game (0.23 ms/player²; max 137.31589600000007 ms)
- 17 seats: 27 games, 66 ms/game (0.23 ms/player²; max 142.66644200000155 ms)
- 18 seats: 27 games, 89 ms/game (0.28 ms/player²; max 168.1971310000008 ms)
- 19 seats: 27 games, 182 ms/game (0.51 ms/player²; max 520.6110540000009 ms)
- 20 seats: 27 games, 103 ms/game (0.26 ms/player²; max 163.0706100000025 ms)
- 21 seats: 27 games, 108 ms/game (0.24 ms/player²; max 183.36235499999748 ms)
- 22 seats: 27 games, 123 ms/game (0.25 ms/player²; max 173.65119799999957 ms)
- 23 seats: 27 games, 137 ms/game (0.26 ms/player²; max 184.10503600000084 ms)
- 24 seats: 27 games, 161 ms/game (0.28 ms/player²; max 258.8819009999934 ms)
- 25 seats: 27 games, 183 ms/game (0.29 ms/player²; max 345.4615080000003 ms)
- 26 seats: 27 games, 201 ms/game (0.30 ms/player²; max 336.33461700000043 ms)
- 27 seats: 27 games, 216 ms/game (0.30 ms/player²; max 370.19485500000155 ms)
- 28 seats: 27 games, 241 ms/game (0.31 ms/player²; max 419.71144800000184 ms)
- 29 seats: 27 games, 261 ms/game (0.31 ms/player²; max 371.9709189999994 ms)
- 30 seats: 101 games, 429 ms/game (0.48 ms/player²; max 1252.4723240000021 ms)
- 31 seats: 99 games, 395 ms/game (0.41 ms/player²; max 978.2794140000042 ms)
- 32 seats: 100 games, 425 ms/game (0.42 ms/player²; max 1096.2163290000026 ms)
- 33 seats: 98 games, 388 ms/game (0.36 ms/player²; max 1065.5716669999965 ms)
- 34 seats: 99 games, 434 ms/game (0.38 ms/player²; max 1251.8866109999944 ms)
- 35 seats: 103 games, 518 ms/game (0.42 ms/player²; max 1232.7272340000054 ms)
- 36 seats: 100 games, 550 ms/game (0.42 ms/player²; max 1241.2156050000049 ms)
- 37 seats: 97 games, 804 ms/game (0.59 ms/player²; max 3475.589678000004 ms)
- 38 seats: 97 games, 868 ms/game (0.60 ms/player²; max 3377.5569009999963 ms)
- 39 seats: 97 games, 718 ms/game (0.47 ms/player²; max 1517.1813249999977 ms)
- 40 seats: 213 games, 840 ms/game (0.52 ms/player²; max 3443.8144059999904 ms)

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

# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T14:29:52.338Z
Duration: 143557 ms

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

- 5 seats: 359 games, 9 ms/game (0.35 ms/player²; max 125.76946899999894 ms)
- 6 seats: 18 games, 28 ms/game (0.79 ms/player²; max 102.45633700000326 ms)
- 7 seats: 21 games, 29 ms/game (0.58 ms/player²; max 80.8770680000016 ms)
- 8 seats: 24 games, 46 ms/game (0.72 ms/player²; max 237.01281599999493 ms)
- 9 seats: 27 games, 37 ms/game (0.45 ms/player²; max 112.29099100000167 ms)
- 10 seats: 27 games, 38 ms/game (0.38 ms/player²; max 161.83316200000263 ms)
- 11 seats: 27 games, 40 ms/game (0.33 ms/player²; max 247.31046600000263 ms)
- 12 seats: 27 games, 32 ms/game (0.22 ms/player²; max 103.6698069999984 ms)
- 13 seats: 27 games, 41 ms/game (0.25 ms/player²; max 90.1157250000033 ms)
- 14 seats: 27 games, 101 ms/game (0.51 ms/player²; max 352.71576800000184 ms)
- 15 seats: 356 games, 77 ms/game (0.34 ms/player²; max 490.50311099999817 ms)
- 16 seats: 27 games, 69 ms/game (0.27 ms/player²; max 135.75208799999382 ms)
- 17 seats: 27 games, 72 ms/game (0.25 ms/player²; max 149.0009829999981 ms)
- 18 seats: 27 games, 95 ms/game (0.29 ms/player²; max 214.994286000001 ms)
- 19 seats: 27 games, 236 ms/game (0.65 ms/player²; max 696.8485060000021 ms)
- 20 seats: 27 games, 178 ms/game (0.44 ms/player²; max 750.1413840000023 ms)
- 21 seats: 27 games, 189 ms/game (0.43 ms/player²; max 372.67138500000146 ms)
- 22 seats: 27 games, 196 ms/game (0.40 ms/player²; max 365.2073429999946 ms)
- 23 seats: 27 games, 182 ms/game (0.34 ms/player²; max 301.9263809999975 ms)
- 24 seats: 27 games, 184 ms/game (0.32 ms/player²; max 337.8012549999985 ms)
- 25 seats: 27 games, 179 ms/game (0.29 ms/player²; max 282.649132999999 ms)
- 26 seats: 27 games, 195 ms/game (0.29 ms/player²; max 326.8307120000027 ms)
- 27 seats: 27 games, 205 ms/game (0.28 ms/player²; max 329.1464960000012 ms)
- 28 seats: 27 games, 203 ms/game (0.26 ms/player²; max 354.18990699999995 ms)
- 29 seats: 27 games, 244 ms/game (0.29 ms/player²; max 413.47238300000026 ms)
- 30 seats: 101 games, 392 ms/game (0.44 ms/player²; max 1167.8513999999996 ms)
- 31 seats: 99 games, 380 ms/game (0.40 ms/player²; max 1021.3063470000052 ms)
- 32 seats: 100 games, 430 ms/game (0.42 ms/player²; max 1289.150277000008 ms)
- 33 seats: 98 games, 441 ms/game (0.40 ms/player²; max 1242.827906000006 ms)
- 34 seats: 99 games, 414 ms/game (0.36 ms/player²; max 1212.7638149999984 ms)
- 35 seats: 103 games, 463 ms/game (0.38 ms/player²; max 1111.910413000005 ms)
- 36 seats: 100 games, 484 ms/game (0.37 ms/player²; max 1330.4498110000131 ms)
- 37 seats: 97 games, 483 ms/game (0.35 ms/player²; max 995.8324160000047 ms)
- 38 seats: 97 games, 505 ms/game (0.35 ms/player²; max 1231.8669389999995 ms)
- 39 seats: 97 games, 576 ms/game (0.38 ms/player²; max 1507.0665969999973 ms)
- 40 seats: 213 games, 655 ms/game (0.41 ms/player²; max 1831.505634999994 ms)

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

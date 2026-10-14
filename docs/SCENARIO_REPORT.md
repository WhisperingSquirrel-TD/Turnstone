# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T12:06:15.494Z
Duration: 144974 ms

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

- 5 seats: 359 games, 8 ms/game (0.32 ms/player²; max 102.72662100000161 ms)
- 6 seats: 18 games, 31 ms/game (0.87 ms/player²; max 123.12383799999952 ms)
- 7 seats: 21 games, 26 ms/game (0.53 ms/player²; max 78.94299100000353 ms)
- 8 seats: 24 games, 42 ms/game (0.65 ms/player²; max 142.32979800000612 ms)
- 9 seats: 27 games, 49 ms/game (0.60 ms/player²; max 175.95780899999954 ms)
- 10 seats: 27 games, 36 ms/game (0.36 ms/player²; max 107.03157700000156 ms)
- 11 seats: 27 games, 29 ms/game (0.24 ms/player²; max 113.68943900000158 ms)
- 12 seats: 27 games, 31 ms/game (0.22 ms/player²; max 84.45020199999999 ms)
- 13 seats: 27 games, 41 ms/game (0.24 ms/player²; max 80.87805500000104 ms)
- 14 seats: 27 games, 101 ms/game (0.51 ms/player²; max 326.74948399999994 ms)
- 15 seats: 356 games, 74 ms/game (0.33 ms/player²; max 440.62279999999737 ms)
- 16 seats: 27 games, 60 ms/game (0.23 ms/player²; max 141.07245999999577 ms)
- 17 seats: 27 games, 68 ms/game (0.24 ms/player²; max 167.1085830000011 ms)
- 18 seats: 27 games, 83 ms/game (0.26 ms/player²; max 147.5581979999988 ms)
- 19 seats: 27 games, 125 ms/game (0.34 ms/player²; max 301.20937799999956 ms)
- 20 seats: 27 games, 98 ms/game (0.24 ms/player²; max 206.2525600000008 ms)
- 21 seats: 27 games, 102 ms/game (0.23 ms/player²; max 195.32000900000276 ms)
- 22 seats: 27 games, 115 ms/game (0.24 ms/player²; max 209.18927699999767 ms)
- 23 seats: 27 games, 135 ms/game (0.25 ms/player²; max 196.5561600000001 ms)
- 24 seats: 27 games, 159 ms/game (0.28 ms/player²; max 263.1952220000021 ms)
- 25 seats: 27 games, 164 ms/game (0.26 ms/player²; max 281.5619250000018 ms)
- 26 seats: 27 games, 181 ms/game (0.27 ms/player²; max 303.1967960000038 ms)
- 27 seats: 27 games, 184 ms/game (0.25 ms/player²; max 348.034467999998 ms)
- 28 seats: 27 games, 182 ms/game (0.23 ms/player²; max 271.5025089999981 ms)
- 29 seats: 27 games, 199 ms/game (0.24 ms/player²; max 330.2600700000039 ms)
- 30 seats: 101 games, 394 ms/game (0.44 ms/player²; max 1223.9275939999934 ms)
- 31 seats: 99 games, 416 ms/game (0.43 ms/player²; max 1389.1672199999884 ms)
- 32 seats: 100 games, 390 ms/game (0.38 ms/player²; max 1288.0181980000052 ms)
- 33 seats: 98 games, 357 ms/game (0.33 ms/player²; max 1096.2975089999964 ms)
- 34 seats: 99 games, 412 ms/game (0.36 ms/player²; max 1474.5340750000032 ms)
- 35 seats: 103 games, 479 ms/game (0.39 ms/player²; max 1162.9785919999995 ms)
- 36 seats: 100 games, 499 ms/game (0.39 ms/player²; max 1449.737049000003 ms)
- 37 seats: 97 games, 497 ms/game (0.36 ms/player²; max 956.3229909999936 ms)
- 38 seats: 97 games, 517 ms/game (0.36 ms/player²; max 1426.826217000009 ms)
- 39 seats: 97 games, 579 ms/game (0.38 ms/player²; max 1706.9828089999937 ms)
- 40 seats: 213 games, 639 ms/game (0.40 ms/player²; max 1772.6936569999962 ms)

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

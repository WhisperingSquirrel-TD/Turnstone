# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-16T19:37:42.461Z
Duration: 150067 ms

## Executed

- Exhaustive core sweep cells: 942
- Sweep games: 942
- Covering-array rows: 788 (three-way)
- Covering-array games: 788
- High-seat pairwise rows: 792 (30–40 seats)
- High-seat pairwise games: 792
- Deterministic fault-fuzz games: 32
- YAML golden games: 17
- Coverage rows verified: 2522

## Shard timings

- not sharded

## Engine game profile

Per-seat-count timings include deterministic decision logic, projections, replay checks and the independent oracle.

- 5 seats: 359 games, 13 ms/game (0.53 ms/player²; max 214.288529999998 ms)
- 6 seats: 18 games, 45 ms/game (1.25 ms/player²; max 132.00530399999843 ms)
- 7 seats: 21 games, 48 ms/game (0.97 ms/player²; max 223.65537600000243 ms)
- 8 seats: 24 games, 42 ms/game (0.66 ms/player²; max 185.7386159999951 ms)
- 9 seats: 27 games, 53 ms/game (0.65 ms/player²; max 211.40321699999913 ms)
- 10 seats: 27 games, 35 ms/game (0.35 ms/player²; max 69.12993199999619 ms)
- 11 seats: 27 games, 32 ms/game (0.26 ms/player²; max 83.12863099999959 ms)
- 12 seats: 27 games, 50 ms/game (0.34 ms/player²; max 127.23308600000018 ms)
- 13 seats: 27 games, 99 ms/game (0.58 ms/player²; max 285.74263699999574 ms)
- 14 seats: 27 games, 68 ms/game (0.35 ms/player²; max 325.29748899999686 ms)
- 15 seats: 356 games, 101 ms/game (0.45 ms/player²; max 466.3757740000001 ms)
- 16 seats: 27 games, 80 ms/game (0.31 ms/player²; max 166.35278999999719 ms)
- 17 seats: 27 games, 94 ms/game (0.33 ms/player²; max 292.9643599999981 ms)
- 18 seats: 27 games, 178 ms/game (0.55 ms/player²; max 550.0676900000035 ms)
- 19 seats: 27 games, 119 ms/game (0.33 ms/player²; max 535.3279570000013 ms)
- 20 seats: 27 games, 113 ms/game (0.28 ms/player²; max 194.44878400000016 ms)
- 21 seats: 27 games, 137 ms/game (0.31 ms/player²; max 226.4169980000006 ms)
- 22 seats: 27 games, 149 ms/game (0.31 ms/player²; max 281.9412749999974 ms)
- 23 seats: 27 games, 184 ms/game (0.35 ms/player²; max 318.06606499999907 ms)
- 24 seats: 27 games, 213 ms/game (0.37 ms/player²; max 367.8759839999984 ms)
- 25 seats: 27 games, 183 ms/game (0.29 ms/player²; max 371.3559049999967 ms)
- 26 seats: 27 games, 192 ms/game (0.28 ms/player²; max 319.6897820000013 ms)
- 27 seats: 27 games, 212 ms/game (0.29 ms/player²; max 363.426317999998 ms)
- 28 seats: 27 games, 219 ms/game (0.28 ms/player²; max 415.2163350000046 ms)
- 29 seats: 27 games, 292 ms/game (0.35 ms/player²; max 509.69629800000257 ms)
- 30 seats: 101 games, 519 ms/game (0.58 ms/player²; max 1905.172292000003 ms)
- 31 seats: 99 games, 431 ms/game (0.45 ms/player²; max 1359.2488909999956 ms)
- 32 seats: 100 games, 485 ms/game (0.47 ms/player²; max 1460.2587120000098 ms)
- 33 seats: 98 games, 446 ms/game (0.41 ms/player²; max 1525.4047280000086 ms)
- 34 seats: 99 games, 509 ms/game (0.44 ms/player²; max 1567.9470930000098 ms)
- 35 seats: 103 games, 613 ms/game (0.50 ms/player²; max 2075.557811999999 ms)
- 36 seats: 100 games, 626 ms/game (0.48 ms/player²; max 2485.633421999999 ms)
- 37 seats: 97 games, 616 ms/game (0.45 ms/player²; max 1374.392989 ms)
- 38 seats: 97 games, 630 ms/game (0.44 ms/player²; max 1931.7421639999957 ms)
- 39 seats: 97 games, 736 ms/game (0.48 ms/player²; max 1926.2934160000004 ms)
- 40 seats: 213 games, 891 ms/game (0.56 ms/player²; max 3152.4670869999973 ms)

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

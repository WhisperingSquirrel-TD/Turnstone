# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-15T00:30:27.430Z
Duration: 140745 ms

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

- 5 seats: 359 games, 8 ms/game (0.31 ms/player²; max 113.3533879999959 ms)
- 6 seats: 18 games, 21 ms/game (0.59 ms/player²; max 78.66275199999654 ms)
- 7 seats: 21 games, 30 ms/game (0.62 ms/player²; max 76.97543700000097 ms)
- 8 seats: 24 games, 52 ms/game (0.81 ms/player²; max 165.913155000002 ms)
- 9 seats: 27 games, 24 ms/game (0.30 ms/player²; max 74.55110699999932 ms)
- 10 seats: 27 games, 22 ms/game (0.22 ms/player²; max 54.54842500000086 ms)
- 11 seats: 27 games, 31 ms/game (0.25 ms/player²; max 88.81068500000401 ms)
- 12 seats: 27 games, 30 ms/game (0.21 ms/player²; max 84.22390900000028 ms)
- 13 seats: 27 games, 45 ms/game (0.27 ms/player²; max 96.05418199999986 ms)
- 14 seats: 27 games, 104 ms/game (0.53 ms/player²; max 304.3914549999972 ms)
- 15 seats: 356 games, 77 ms/game (0.34 ms/player²; max 407.9870079999964 ms)
- 16 seats: 27 games, 62 ms/game (0.24 ms/player²; max 131.78214000000298 ms)
- 17 seats: 27 games, 68 ms/game (0.24 ms/player²; max 159.25005399999645 ms)
- 18 seats: 27 games, 81 ms/game (0.25 ms/player²; max 153.5522159999964 ms)
- 19 seats: 27 games, 193 ms/game (0.53 ms/player²; max 502.44260299999587 ms)
- 20 seats: 27 games, 106 ms/game (0.26 ms/player²; max 250.92037100000016 ms)
- 21 seats: 27 games, 114 ms/game (0.26 ms/player²; max 197.04933199999505 ms)
- 22 seats: 27 games, 138 ms/game (0.29 ms/player²; max 243.7779570000057 ms)
- 23 seats: 27 games, 142 ms/game (0.27 ms/player²; max 225.70226600000024 ms)
- 24 seats: 27 games, 160 ms/game (0.28 ms/player²; max 256.7567990000025 ms)
- 25 seats: 27 games, 184 ms/game (0.29 ms/player²; max 347.2053259999957 ms)
- 26 seats: 27 games, 183 ms/game (0.27 ms/player²; max 303.1881560000038 ms)
- 27 seats: 27 games, 208 ms/game (0.28 ms/player²; max 418.8846010000052 ms)
- 28 seats: 27 games, 215 ms/game (0.27 ms/player²; max 332.54477300000144 ms)
- 29 seats: 27 games, 248 ms/game (0.30 ms/player²; max 324.8170109999992 ms)
- 30 seats: 101 games, 418 ms/game (0.46 ms/player²; max 1175.5896349999966 ms)
- 31 seats: 99 games, 385 ms/game (0.40 ms/player²; max 918.5162750000018 ms)
- 32 seats: 100 games, 400 ms/game (0.39 ms/player²; max 1155.3759849999915 ms)
- 33 seats: 98 games, 389 ms/game (0.36 ms/player²; max 903.2442660000088 ms)
- 34 seats: 99 games, 413 ms/game (0.36 ms/player²; max 1170.9750329999952 ms)
- 35 seats: 103 games, 496 ms/game (0.40 ms/player²; max 1069.0678790000093 ms)
- 36 seats: 100 games, 531 ms/game (0.41 ms/player²; max 1381.8299140000017 ms)
- 37 seats: 97 games, 518 ms/game (0.38 ms/player²; max 1048.4015960000106 ms)
- 38 seats: 97 games, 549 ms/game (0.38 ms/player²; max 1422.7327130000049 ms)
- 39 seats: 97 games, 641 ms/game (0.42 ms/player²; max 1661.551610999988 ms)
- 40 seats: 213 games, 714 ms/game (0.45 ms/player²; max 1624.8972240000003 ms)

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

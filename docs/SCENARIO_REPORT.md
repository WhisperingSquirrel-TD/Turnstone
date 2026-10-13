# Scenario report

GitHub Actions Verify #12 — **PASS** for commit `d1ada52`. [Public run summary](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/38480622636).

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-13T22:52:24.317Z
Duration: 84272 ms

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

- Shard 0: 56859 ms actual, 266650 ms projected
- Shard 1: 84126 ms actual, 264437 ms projected
- Shard 2: 84272 ms actual, 264461 ms projected
- Shard 3: 76661 ms actual, 264458 ms projected
- Shard 4: 76598 ms actual, 264458 ms projected
- Shard 5: 61934 ms actual, 264417 ms projected

## Engine game profile

Per-seat-count timings include deterministic decision logic, projections, replay checks and the independent oracle.

- 5 seats: 359 games, 10 ms/game (0.40 ms/player²; max 106.3155209999968 ms)
- 6 seats: 18 games, 36 ms/game (1.01 ms/player²; max 81.66880300000048 ms)
- 7 seats: 21 games, 28 ms/game (0.56 ms/player²; max 50.22841899999912 ms)
- 8 seats: 24 games, 32 ms/game (0.50 ms/player²; max 79.25931500000297 ms)
- 9 seats: 27 games, 37 ms/game (0.46 ms/player²; max 106.84212700000353 ms)
- 10 seats: 27 games, 47 ms/game (0.47 ms/player²; max 126.63891699999658 ms)
- 11 seats: 27 games, 45 ms/game (0.37 ms/player²; max 128.8546720000013 ms)
- 12 seats: 27 games, 44 ms/game (0.31 ms/player²; max 88.32674899999984 ms)
- 13 seats: 27 games, 51 ms/game (0.30 ms/player²; max 116.92431799999758 ms)
- 14 seats: 27 games, 51 ms/game (0.26 ms/player²; max 89.1435549999951 ms)
- 15 seats: 356 games, 79 ms/game (0.35 ms/player²; max 467.2350959999967 ms)
- 16 seats: 27 games, 61 ms/game (0.24 ms/player²; max 131.39967900000192 ms)
- 17 seats: 27 games, 75 ms/game (0.26 ms/player²; max 143.81107899999915 ms)
- 18 seats: 27 games, 96 ms/game (0.30 ms/player²; max 170.68719899999996 ms)
- 19 seats: 27 games, 108 ms/game (0.30 ms/player²; max 190.19607999999425 ms)
- 20 seats: 27 games, 132 ms/game (0.33 ms/player²; max 244.79303000000073 ms)
- 21 seats: 27 games, 130 ms/game (0.30 ms/player²; max 208.61828199999582 ms)
- 22 seats: 27 games, 153 ms/game (0.32 ms/player²; max 256.5536439999996 ms)
- 23 seats: 27 games, 162 ms/game (0.31 ms/player²; max 264.4502749999956 ms)
- 24 seats: 27 games, 180 ms/game (0.31 ms/player²; max 321.2635799999989 ms)
- 25 seats: 27 games, 193 ms/game (0.31 ms/player²; max 310.44996600000013 ms)
- 26 seats: 27 games, 212 ms/game (0.31 ms/player²; max 369.3389460000035 ms)
- 27 seats: 27 games, 252 ms/game (0.35 ms/player²; max 396.5213319999966 ms)
- 28 seats: 27 games, 252 ms/game (0.32 ms/player²; max 389.02232099999674 ms)
- 29 seats: 27 games, 280 ms/game (0.33 ms/player²; max 463.50963700000284 ms)
- 30 seats: 101 games, 482 ms/game (0.54 ms/player²; max 1351.3149790000025 ms)
- 31 seats: 99 games, 422 ms/game (0.44 ms/player²; max 974.453082 ms)
- 32 seats: 100 games, 490 ms/game (0.48 ms/player²; max 1758.044686000001 ms)
- 33 seats: 98 games, 457 ms/game (0.42 ms/player²; max 1372.2399619999997 ms)
- 34 seats: 99 games, 512 ms/game (0.44 ms/player²; max 1817.4143479999912 ms)
- 35 seats: 103 games, 589 ms/game (0.48 ms/player²; max 1605.8151399999915 ms)
- 36 seats: 100 games, 603 ms/game (0.47 ms/player²; max 1491.6946949999983 ms)
- 37 seats: 97 games, 588 ms/game (0.43 ms/player²; max 1248.9317819999997 ms)
- 38 seats: 97 games, 633 ms/game (0.44 ms/player²; max 1943.6442700000043 ms)
- 39 seats: 97 games, 680 ms/game (0.45 ms/player²; max 1782.843909999996 ms)
- 40 seats: 213 games, 711 ms/game (0.44 ms/player²; max 2112.3467049999963 ms)

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

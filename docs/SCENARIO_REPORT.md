# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-16T23:03:25.607Z
Duration: 147989 ms

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

- 5 seats: 359 games, 10 ms/game (0.40 ms/player²; max 157.12615399999777 ms)
- 6 seats: 18 games, 44 ms/game (1.22 ms/player²; max 131.1291769999989 ms)
- 7 seats: 21 games, 50 ms/game (1.02 ms/player²; max 163.51497899999958 ms)
- 8 seats: 24 games, 36 ms/game (0.56 ms/player²; max 93.18089899999904 ms)
- 9 seats: 27 games, 33 ms/game (0.41 ms/player²; max 204.30882099999872 ms)
- 10 seats: 27 games, 34 ms/game (0.34 ms/player²; max 89.49703899999804 ms)
- 11 seats: 27 games, 38 ms/game (0.32 ms/player²; max 104.75874599999952 ms)
- 12 seats: 27 games, 62 ms/game (0.43 ms/player²; max 311.49937000000136 ms)
- 13 seats: 27 games, 84 ms/game (0.50 ms/player²; max 254.93525600000066 ms)
- 14 seats: 27 games, 68 ms/game (0.35 ms/player²; max 254.2902150000009 ms)
- 15 seats: 356 games, 89 ms/game (0.39 ms/player²; max 465.30837499999325 ms)
- 16 seats: 27 games, 68 ms/game (0.26 ms/player²; max 133.07636600000114 ms)
- 17 seats: 27 games, 87 ms/game (0.30 ms/player²; max 231.3503759999985 ms)
- 18 seats: 27 games, 92 ms/game (0.28 ms/player²; max 209.78354000000036 ms)
- 19 seats: 27 games, 105 ms/game (0.29 ms/player²; max 198.43342499999926 ms)
- 20 seats: 27 games, 114 ms/game (0.28 ms/player²; max 191.44134199999826 ms)
- 21 seats: 27 games, 130 ms/game (0.30 ms/player²; max 209.067411 ms)
- 22 seats: 27 games, 149 ms/game (0.31 ms/player²; max 241.59690700000283 ms)
- 23 seats: 27 games, 170 ms/game (0.32 ms/player²; max 315.52016300000105 ms)
- 24 seats: 27 games, 199 ms/game (0.34 ms/player²; max 359.14293799999723 ms)
- 25 seats: 27 games, 190 ms/game (0.30 ms/player²; max 327.0673289999977 ms)
- 26 seats: 27 games, 198 ms/game (0.29 ms/player²; max 262.9599439999947 ms)
- 27 seats: 27 games, 215 ms/game (0.30 ms/player²; max 357.8522430000012 ms)
- 28 seats: 27 games, 232 ms/game (0.30 ms/player²; max 461.81837200000155 ms)
- 29 seats: 27 games, 285 ms/game (0.34 ms/player²; max 450.3995799999975 ms)
- 30 seats: 101 games, 434 ms/game (0.48 ms/player²; max 1516.3384020000085 ms)
- 31 seats: 99 games, 410 ms/game (0.43 ms/player²; max 1147.1654830000043 ms)
- 32 seats: 100 games, 445 ms/game (0.43 ms/player²; max 1469.3738370000065 ms)
- 33 seats: 98 games, 407 ms/game (0.37 ms/player²; max 1203.593338999999 ms)
- 34 seats: 99 games, 481 ms/game (0.42 ms/player²; max 1557.661215 ms)
- 35 seats: 103 games, 585 ms/game (0.48 ms/player²; max 2126.4018030000007 ms)
- 36 seats: 100 games, 625 ms/game (0.48 ms/player²; max 2426.1879990000016 ms)
- 37 seats: 97 games, 597 ms/game (0.44 ms/player²; max 1451.1764229999972 ms)
- 38 seats: 97 games, 616 ms/game (0.43 ms/player²; max 1885.119239000007 ms)
- 39 seats: 97 games, 1046 ms/game (0.69 ms/player²; max 3718.8443420000112 ms)
- 40 seats: 213 games, 968 ms/game (0.61 ms/player²; max 4050.994746000011 ms)

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

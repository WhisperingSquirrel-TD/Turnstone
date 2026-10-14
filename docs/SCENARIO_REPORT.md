# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T14:10:47.494Z
Duration: 138932 ms

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

- 5 seats: 359 games, 8 ms/game (0.31 ms/player²; max 144.82563599999412 ms)
- 6 seats: 18 games, 28 ms/game (0.77 ms/player²; max 110.61271999999735 ms)
- 7 seats: 21 games, 28 ms/game (0.57 ms/player²; max 83.72664100000111 ms)
- 8 seats: 24 games, 22 ms/game (0.34 ms/player²; max 80.8549669999993 ms)
- 9 seats: 27 games, 30 ms/game (0.37 ms/player²; max 98.86768099999608 ms)
- 10 seats: 27 games, 53 ms/game (0.53 ms/player²; max 167.7128739999971 ms)
- 11 seats: 27 games, 27 ms/game (0.22 ms/player²; max 80.26163799999631 ms)
- 12 seats: 27 games, 35 ms/game (0.24 ms/player²; max 93.2766300000003 ms)
- 13 seats: 27 games, 41 ms/game (0.24 ms/player²; max 94.52206999999908 ms)
- 14 seats: 27 games, 72 ms/game (0.37 ms/player²; max 337.86565600000176 ms)
- 15 seats: 356 games, 76 ms/game (0.34 ms/player²; max 420.58793799999694 ms)
- 16 seats: 27 games, 54 ms/game (0.21 ms/player²; max 98.42799999999988 ms)
- 17 seats: 27 games, 68 ms/game (0.23 ms/player²; max 142.76868799999647 ms)
- 18 seats: 27 games, 81 ms/game (0.25 ms/player²; max 150.96069100000022 ms)
- 19 seats: 27 games, 193 ms/game (0.53 ms/player²; max 533.7400820000039 ms)
- 20 seats: 27 games, 144 ms/game (0.36 ms/player²; max 724.3963980000044 ms)
- 21 seats: 27 games, 118 ms/game (0.27 ms/player²; max 293.72132299999794 ms)
- 22 seats: 27 games, 167 ms/game (0.35 ms/player²; max 298.47512399999687 ms)
- 23 seats: 27 games, 187 ms/game (0.35 ms/player²; max 352.4506990000009 ms)
- 24 seats: 27 games, 165 ms/game (0.29 ms/player²; max 277.1385309999969 ms)
- 25 seats: 27 games, 168 ms/game (0.27 ms/player²; max 271.10186299999623 ms)
- 26 seats: 27 games, 177 ms/game (0.26 ms/player²; max 397.49575000000186 ms)
- 27 seats: 27 games, 163 ms/game (0.22 ms/player²; max 233.74938999999722 ms)
- 28 seats: 27 games, 171 ms/game (0.22 ms/player²; max 276.72492199999397 ms)
- 29 seats: 27 games, 211 ms/game (0.25 ms/player²; max 322.1874699999971 ms)
- 30 seats: 101 games, 363 ms/game (0.40 ms/player²; max 1109.7179559999931 ms)
- 31 seats: 99 games, 345 ms/game (0.36 ms/player²; max 1099.1203649999952 ms)
- 32 seats: 100 games, 362 ms/game (0.35 ms/player²; max 1127.4113529999886 ms)
- 33 seats: 98 games, 330 ms/game (0.30 ms/player²; max 1027.5889199999947 ms)
- 34 seats: 99 games, 530 ms/game (0.46 ms/player²; max 2568.9065459999983 ms)
- 35 seats: 103 games, 556 ms/game (0.45 ms/player²; max 2600.5992899999983 ms)
- 36 seats: 100 games, 443 ms/game (0.34 ms/player²; max 1262.5227669999877 ms)
- 37 seats: 97 games, 442 ms/game (0.32 ms/player²; max 917.0328759999975 ms)
- 38 seats: 97 games, 457 ms/game (0.32 ms/player²; max 1317.652489 ms)
- 39 seats: 97 games, 543 ms/game (0.36 ms/player²; max 1477.1017259999935 ms)
- 40 seats: 213 games, 615 ms/game (0.38 ms/player²; max 1610.333455999993 ms)

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

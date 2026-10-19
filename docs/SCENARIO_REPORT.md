# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-19T08:53:56.103Z
Duration: 151168 ms

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

- 5 seats: 359 games, 10 ms/game (0.41 ms/player²; max 103.06501600000047 ms)
- 6 seats: 18 games, 53 ms/game (1.48 ms/player²; max 182.22565700000268 ms)
- 7 seats: 21 games, 25 ms/game (0.51 ms/player²; max 91.7135780000026 ms)
- 8 seats: 24 games, 32 ms/game (0.51 ms/player²; max 150.4827069999992 ms)
- 9 seats: 27 games, 30 ms/game (0.38 ms/player²; max 74.02343199999814 ms)
- 10 seats: 27 games, 37 ms/game (0.37 ms/player²; max 99.5740930000029 ms)
- 11 seats: 27 games, 39 ms/game (0.32 ms/player²; max 111.54252799999813 ms)
- 12 seats: 27 games, 54 ms/game (0.37 ms/player²; max 383.3016150000003 ms)
- 13 seats: 27 games, 104 ms/game (0.61 ms/player²; max 401.38235599999825 ms)
- 14 seats: 27 games, 49 ms/game (0.25 ms/player²; max 109.31362499999886 ms)
- 15 seats: 356 games, 96 ms/game (0.43 ms/player²; max 459.26921199999924 ms)
- 16 seats: 27 games, 75 ms/game (0.29 ms/player²; max 155.3318999999974 ms)
- 17 seats: 27 games, 105 ms/game (0.36 ms/player²; max 451.97645100000227 ms)
- 18 seats: 27 games, 199 ms/game (0.61 ms/player²; max 580.8854089999986 ms)
- 19 seats: 27 games, 105 ms/game (0.29 ms/player²; max 171.57001100000343 ms)
- 20 seats: 27 games, 137 ms/game (0.34 ms/player²; max 235.03985699999612 ms)
- 21 seats: 27 games, 152 ms/game (0.35 ms/player²; max 245.87983199999871 ms)
- 22 seats: 27 games, 150 ms/game (0.31 ms/player²; max 241.73874400000204 ms)
- 23 seats: 27 games, 185 ms/game (0.35 ms/player²; max 381.17954199999804 ms)
- 24 seats: 27 games, 207 ms/game (0.36 ms/player²; max 383.10864500000025 ms)
- 25 seats: 27 games, 216 ms/game (0.35 ms/player²; max 466.29963500000304 ms)
- 26 seats: 27 games, 231 ms/game (0.34 ms/player²; max 356.61471999999776 ms)
- 27 seats: 27 games, 242 ms/game (0.33 ms/player²; max 422.92246100000193 ms)
- 28 seats: 27 games, 244 ms/game (0.31 ms/player²; max 426.2389820000026 ms)
- 29 seats: 27 games, 297 ms/game (0.35 ms/player²; max 433.240300999998 ms)
- 30 seats: 101 games, 472 ms/game (0.52 ms/player²; max 1468.7887929999997 ms)
- 31 seats: 99 games, 438 ms/game (0.46 ms/player²; max 1284.5998399999953 ms)
- 32 seats: 100 games, 470 ms/game (0.46 ms/player²; max 1458.2029049999983 ms)
- 33 seats: 98 games, 435 ms/game (0.40 ms/player²; max 1328.4655499999935 ms)
- 34 seats: 99 games, 517 ms/game (0.45 ms/player²; max 1683.7261690000014 ms)
- 35 seats: 103 games, 639 ms/game (0.52 ms/player²; max 2223.3077439999906 ms)
- 36 seats: 100 games, 700 ms/game (0.54 ms/player²; max 3050.9169790000014 ms)
- 37 seats: 97 games, 669 ms/game (0.49 ms/player²; max 1661.946987000003 ms)
- 38 seats: 97 games, 678 ms/game (0.47 ms/player²; max 2151.718811999992 ms)
- 39 seats: 97 games, 806 ms/game (0.53 ms/player²; max 2507.6408829999855 ms)
- 40 seats: 213 games, 891 ms/game (0.56 ms/player²; max 3186.472001999995 ms)

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

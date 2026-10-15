# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-15T00:10:42.191Z
Duration: 153376 ms

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

- 5 seats: 359 games, 8 ms/game (0.31 ms/player²; max 88.48529199999757 ms)
- 6 seats: 18 games, 22 ms/game (0.62 ms/player²; max 36.46018599999661 ms)
- 7 seats: 21 games, 32 ms/game (0.66 ms/player²; max 122.99312900000223 ms)
- 8 seats: 24 games, 34 ms/game (0.53 ms/player²; max 111.53481599999941 ms)
- 9 seats: 27 games, 32 ms/game (0.40 ms/player²; max 166.6687230000025 ms)
- 10 seats: 27 games, 31 ms/game (0.31 ms/player²; max 139.85804699999426 ms)
- 11 seats: 27 games, 31 ms/game (0.26 ms/player²; max 77.50314000000071 ms)
- 12 seats: 27 games, 37 ms/game (0.25 ms/player²; max 91.60304100000212 ms)
- 13 seats: 27 games, 44 ms/game (0.26 ms/player²; max 76.12516799999867 ms)
- 14 seats: 27 games, 104 ms/game (0.53 ms/player²; max 274.98311300000205 ms)
- 15 seats: 356 games, 80 ms/game (0.36 ms/player²; max 358.8087589999923 ms)
- 16 seats: 27 games, 59 ms/game (0.23 ms/player²; max 172.58918699999776 ms)
- 17 seats: 27 games, 70 ms/game (0.24 ms/player²; max 173.48863100000017 ms)
- 18 seats: 27 games, 90 ms/game (0.28 ms/player²; max 165.36817499999597 ms)
- 19 seats: 27 games, 175 ms/game (0.48 ms/player²; max 443.82569800000056 ms)
- 20 seats: 27 games, 97 ms/game (0.24 ms/player²; max 177.37806300000375 ms)
- 21 seats: 27 games, 117 ms/game (0.27 ms/player²; max 250.33940299999813 ms)
- 22 seats: 27 games, 140 ms/game (0.29 ms/player²; max 299.70333499999833 ms)
- 23 seats: 27 games, 147 ms/game (0.28 ms/player²; max 212.32470199999807 ms)
- 24 seats: 27 games, 173 ms/game (0.30 ms/player²; max 276.2113329999993 ms)
- 25 seats: 27 games, 185 ms/game (0.30 ms/player²; max 292.94380999999703 ms)
- 26 seats: 27 games, 212 ms/game (0.31 ms/player²; max 354.8297559999992 ms)
- 27 seats: 27 games, 221 ms/game (0.30 ms/player²; max 351.1101340000023 ms)
- 28 seats: 27 games, 214 ms/game (0.27 ms/player²; max 279.38105099999666 ms)
- 29 seats: 27 games, 255 ms/game (0.30 ms/player²; max 355.9867200000008 ms)
- 30 seats: 101 games, 418 ms/game (0.46 ms/player²; max 1045.4491870000056 ms)
- 31 seats: 99 games, 408 ms/game (0.43 ms/player²; max 1045.8035589999927 ms)
- 32 seats: 100 games, 440 ms/game (0.43 ms/player²; max 1205.1042290000041 ms)
- 33 seats: 98 games, 398 ms/game (0.37 ms/player²; max 998.3995350000041 ms)
- 34 seats: 99 games, 439 ms/game (0.38 ms/player²; max 1338.7842700000037 ms)
- 35 seats: 103 games, 560 ms/game (0.46 ms/player²; max 1159.9495659999957 ms)
- 36 seats: 100 games, 615 ms/game (0.47 ms/player²; max 1312.567590000006 ms)
- 37 seats: 97 games, 742 ms/game (0.54 ms/player²; max 1747.887717000005 ms)
- 38 seats: 97 games, 664 ms/game (0.46 ms/player²; max 1672.0733919999911 ms)
- 39 seats: 97 games, 686 ms/game (0.45 ms/player²; max 1958.1856039999984 ms)
- 40 seats: 213 games, 737 ms/game (0.46 ms/player²; max 1840.635169999994 ms)

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

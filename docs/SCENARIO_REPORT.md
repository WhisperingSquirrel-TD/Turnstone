# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-14T11:43:26.516Z
Duration: 129006 ms

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

- 5 seats: 359 games, 8 ms/game (0.30 ms/player²; max 89.23151099999814 ms)
- 6 seats: 18 games, 24 ms/game (0.68 ms/player²; max 60.4982949999976 ms)
- 7 seats: 21 games, 26 ms/game (0.53 ms/player²; max 53.913767000005464 ms)
- 8 seats: 24 games, 42 ms/game (0.65 ms/player²; max 153.5584649999946 ms)
- 9 seats: 27 games, 35 ms/game (0.43 ms/player²; max 185.27048999999533 ms)
- 10 seats: 27 games, 32 ms/game (0.32 ms/player²; max 110.99801600000501 ms)
- 11 seats: 27 games, 29 ms/game (0.24 ms/player²; max 73.34850600000209 ms)
- 12 seats: 27 games, 29 ms/game (0.20 ms/player²; max 77.86142600000312 ms)
- 13 seats: 27 games, 43 ms/game (0.26 ms/player²; max 111.82872800000041 ms)
- 14 seats: 27 games, 93 ms/game (0.47 ms/player²; max 205.83456500000466 ms)
- 15 seats: 356 games, 71 ms/game (0.31 ms/player²; max 440.997955999992 ms)
- 16 seats: 27 games, 57 ms/game (0.22 ms/player²; max 122.92058700000052 ms)
- 17 seats: 27 games, 71 ms/game (0.25 ms/player²; max 157.37882899999386 ms)
- 18 seats: 27 games, 82 ms/game (0.25 ms/player²; max 167.1812080000018 ms)
- 19 seats: 27 games, 187 ms/game (0.52 ms/player²; max 397.5741940000007 ms)
- 20 seats: 27 games, 110 ms/game (0.27 ms/player²; max 458.0741990000024 ms)
- 21 seats: 27 games, 106 ms/game (0.24 ms/player²; max 179.14300899999944 ms)
- 22 seats: 27 games, 113 ms/game (0.23 ms/player²; max 188.0687620000026 ms)
- 23 seats: 27 games, 137 ms/game (0.26 ms/player²; max 234.7830599999943 ms)
- 24 seats: 27 games, 146 ms/game (0.25 ms/player²; max 199.77447599999869 ms)
- 25 seats: 27 games, 149 ms/game (0.24 ms/player²; max 251.90020199999708 ms)
- 26 seats: 27 games, 169 ms/game (0.25 ms/player²; max 300.66259900000296 ms)
- 27 seats: 27 games, 164 ms/game (0.23 ms/player²; max 266.35222700000304 ms)
- 28 seats: 27 games, 175 ms/game (0.22 ms/player²; max 273.72275900000386 ms)
- 29 seats: 27 games, 203 ms/game (0.24 ms/player²; max 326.59003700000176 ms)
- 30 seats: 101 games, 338 ms/game (0.38 ms/player²; max 995.4459789999964 ms)
- 31 seats: 99 games, 358 ms/game (0.37 ms/player²; max 1052.4516909999948 ms)
- 32 seats: 100 games, 335 ms/game (0.33 ms/player²; max 1130.0775809999905 ms)
- 33 seats: 98 games, 322 ms/game (0.30 ms/player²; max 961.932885999995 ms)
- 34 seats: 99 games, 356 ms/game (0.31 ms/player²; max 1136.0410609999963 ms)
- 35 seats: 103 games, 417 ms/game (0.34 ms/player²; max 1051.6999750000105 ms)
- 36 seats: 100 games, 446 ms/game (0.34 ms/player²; max 1298.1308999999892 ms)
- 37 seats: 97 games, 421 ms/game (0.31 ms/player²; max 936.7130829999951 ms)
- 38 seats: 97 games, 453 ms/game (0.31 ms/player²; max 1196.8295510000025 ms)
- 39 seats: 97 games, 550 ms/game (0.36 ms/player²; max 1804.2362450000073 ms)
- 40 seats: 213 games, 601 ms/game (0.38 ms/player²; max 1691.3320860000094 ms)

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

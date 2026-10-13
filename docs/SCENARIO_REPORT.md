# Scenario report

Status: PASS — engine scenarios

Mode: sample
Seed: 20261013
Started: 2026-10-13T22:45:50.306Z
Duration: 129853 ms

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

- 5 seats: 359 games, 7 ms/game (0.27 ms/player²; max 87.41841000000568 ms)
- 6 seats: 18 games, 14 ms/game (0.39 ms/player²; max 29.79724499999429 ms)
- 7 seats: 21 games, 16 ms/game (0.32 ms/player²; max 32.13103499999852 ms)
- 8 seats: 24 games, 36 ms/game (0.57 ms/player²; max 112.37494699999661 ms)
- 9 seats: 27 games, 26 ms/game (0.32 ms/player²; max 107.48954299999605 ms)
- 10 seats: 27 games, 22 ms/game (0.22 ms/player²; max 65.90990199999942 ms)
- 11 seats: 27 games, 25 ms/game (0.20 ms/player²; max 81.31299799999397 ms)
- 12 seats: 27 games, 29 ms/game (0.20 ms/player²; max 65.05917100000079 ms)
- 13 seats: 27 games, 32 ms/game (0.19 ms/player²; max 64.9913149999993 ms)
- 14 seats: 27 games, 75 ms/game (0.38 ms/player²; max 205.12282600000617 ms)
- 15 seats: 356 games, 64 ms/game (0.29 ms/player²; max 378.1014609999984 ms)
- 16 seats: 27 games, 49 ms/game (0.19 ms/player²; max 123.0803040000028 ms)
- 17 seats: 27 games, 57 ms/game (0.20 ms/player²; max 118.30396599999949 ms)
- 18 seats: 27 games, 74 ms/game (0.23 ms/player²; max 146.53890800000227 ms)
- 19 seats: 27 games, 172 ms/game (0.48 ms/player²; max 568.0041029999993 ms)
- 20 seats: 27 games, 93 ms/game (0.23 ms/player²; max 217.6156520000004 ms)
- 21 seats: 27 games, 86 ms/game (0.19 ms/player²; max 131.85903099999996 ms)
- 22 seats: 27 games, 101 ms/game (0.21 ms/player²; max 168.91463700000168 ms)
- 23 seats: 27 games, 114 ms/game (0.22 ms/player²; max 157.62048100000538 ms)
- 24 seats: 27 games, 122 ms/game (0.21 ms/player²; max 209.71379999999772 ms)
- 25 seats: 27 games, 155 ms/game (0.25 ms/player²; max 290.64712800000416 ms)
- 26 seats: 27 games, 160 ms/game (0.24 ms/player²; max 249.3097940000007 ms)
- 27 seats: 27 games, 163 ms/game (0.22 ms/player²; max 330.7546280000024 ms)
- 28 seats: 27 games, 155 ms/game (0.20 ms/player²; max 210.0857659999965 ms)
- 29 seats: 27 games, 176 ms/game (0.21 ms/player²; max 254.57147100000293 ms)
- 30 seats: 101 games, 345 ms/game (0.38 ms/player²; max 985.1883600000001 ms)
- 31 seats: 99 games, 318 ms/game (0.33 ms/player²; max 952.6599140000035 ms)
- 32 seats: 100 games, 327 ms/game (0.32 ms/player²; max 1022.6437279999955 ms)
- 33 seats: 98 games, 312 ms/game (0.29 ms/player²; max 763.8532810000033 ms)
- 34 seats: 99 games, 388 ms/game (0.34 ms/player²; max 1125.165393999996 ms)
- 35 seats: 103 games, 563 ms/game (0.46 ms/player²; max 1980.0241589999932 ms)
- 36 seats: 100 games, 524 ms/game (0.40 ms/player²; max 1590.6139650000114 ms)
- 37 seats: 97 games, 433 ms/game (0.32 ms/player²; max 907.2417690000002 ms)
- 38 seats: 97 games, 488 ms/game (0.34 ms/player²; max 1335.4001509999944 ms)
- 39 seats: 97 games, 555 ms/game (0.36 ms/player²; max 1601.8304809999972 ms)
- 40 seats: 213 games, 600 ms/game (0.38 ms/player²; max 1494.502204000004 ms)

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

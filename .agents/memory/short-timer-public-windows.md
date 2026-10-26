---
name: Short test timers and public-screen assertions
description: Rehearsal servers give every timed phase 15 seconds; extend before a deliberate move-on and pause before slow public-screen checks.
---

The rehearsal web server runs with `--test-only-short-timers`, so every timed
phase in a real (non-practice) game lasts 15 seconds
(`artifacts/api-server/src/index.ts`). With missions off (D109) the first
public phase after DEAL is DEBATE alone, so a test that checks the public log
or other public-screen content after DEAL has 15 seconds before VOTE (a
private screen) replaces it.

Rule: when a real-server test needs several assertions on a public screen,
have the organiser press "Pause game" (`button-coordinator-pause`) first and
"Resume game" afterwards, as a real organiser would. Never lengthen the test
timer or raise a timeout to cover it. First seen in
`e2e/disconnected-player-live.spec.ts` (observer log missing; page already in
VOTE).

Second trap: a test that spends minutes in a phase leaves its 15-second
deadline long overdue. The moment the last pending player acts, the deadline
scheduler advances the phase itself, and a test click on "Move everyone on"
then lands on the next phase (with a fresh version, so `STALE_VERSION` does
not catch it) and skips it. Before the final action, press an extend button
(`button-extend-15`) and wait for the version to change, so the organiser's
move is the one that ends the phase.

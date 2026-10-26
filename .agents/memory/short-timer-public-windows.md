---
name: Short test timers and public-screen assertions
description: Rehearsal servers give every timed phase 15 seconds; hold the phase with Pause before slow public-screen checks.
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

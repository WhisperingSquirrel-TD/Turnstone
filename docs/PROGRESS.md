# Status for reviewer

**Round 7 Lobby first-view follow-up — local checks passed.** QR is 200px square,
with its encoded quiet zone unchanged. Mobile spacing is tightened without
hiding content or changing the dock. The audit now requires code, QR and Share
to fit at scroll position zero at 360×740 and 390×844, with 8px clearance.
Baseline main `2aefc7b` passed Verify #299. All 16 full-state Pixel/iPhone audit
cases passed (320/360/390/430, day/night), including the new first-view checks;
TypeScript, lint and whitespace checks passed. Organiser captures and aliases
are refreshed at all four widths. No rule or secrecy change. Current result:
[main Verify](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/workflows/verify.yml?query=branch%3Amain).

## Previous completed Lobby batch

**Round 7 organiser Lobby review — COMPLETE.** Verified application:
`857d492`, [Verify #298 GREEN](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/40204037677).
Implementation `b42c2f1` also passed Verify #297.
Invitation first; one heading/roster; confirmed **Remove from lobby**; extras
collapsed; no pre-game timing/progress rows or false save error. QR overflow fixed.
747 unit tests, phone audits and all four browser profiles passed. Gallery:
`docs/screens/round-7-audit/lobby{,-organiser}-{320,390,430}-*.jpg`.
Next: amendment A, then the read-only missions review. No owner question pending.

[Current main Verify](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/workflows/verify.yml?query=branch%3Amain).

## Round 7 Lobby evidence

**Round 7 current batch — organiser Lobby review:** invitation-first layout and
single heading/roster implemented; ready count retained; pre-game removal has a
confirmation and uses the existing server action. Timing/progress rows are
absent in the Lobby; takeover, presenter and updates start collapsed.
The default delegates fixture is corrected, background load failures no longer
claim a failed save, and user-action failures remain visible.
Component regressions failed first. Validation: 747 unit tests, both TypeScript
checks and targeted lint pass; all 16 full Pixel/iPhone day/night application-audit
cases and 28 four-profile invitation/removal/error browser checks pass.
The QR SVG overflow found during screenshot review also failed its bounds test
before the responsive sizing fix. Regenerated organiser/player Lobby images at
320/390/430, including the exact `*-light.jpg`/`*-dark.jpg` aliases referenced by
the reviewer. The fresh fixture has one ready seat out of five and retains “Waiting
for 4 more players.” See D108 for scope and gallery naming.
Local concurrent unit/browser runs hit the unchanged 5-second rename guard;
it passed in isolation (350ms), and the complete 747-test suite passed with one
worker without concurrent browser load. No timeout or assertion was altered.
The final status-only local check hit the same unchanged five-second filesystem
deadline again; the guard passed in both Verify #297 and #298. This documentation
update is left to the unchanged CI guard rather than altering its threshold.
**Implementation pushed:** `b42c2f1`, Verify #297 **GREEN**
([run](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/40202954497))
— every job passed, including four browsers, rehearsal-live, unit and audit.
Screenshot review caught a fixture detail: the shared gameplay fixture included
a departed seat. The final gallery sample now uses one living joined seat with
an empty pre-game log; a “1 joined” assertion guards this fresh default state.
All six requested Pixel capture/audit cases pass, with typecheck and lint green.
Final fixture/gallery follow-up `857d492` passed Verify #298; product rules are unchanged.
Amendment A remains after this UI batch, followed by the read-only missions review.

**Prior verified public-share fix: `6592ff5`, Verify #296 GREEN.**

**Next in the owner's queue:** amendment A (one paper-style game entry screen,
`/play` redirect, join prefill and public-page/SEO boundaries), then the
**read-only missions review** requested on 25 October. Do not start the missions
review ahead of amendment A or change mission behaviour as part of that review.

The missions review deliverable is `docs/MISSIONS-REVIEW.md`: trace the real
organiser/player/Practice flow, distinguish functioning features from placeholder
copy, check whether the supplied 37-row mission CSV is wired in, assess every
mission for a 15-person indoor mixed-age Christmas game, and recommend the
remaining end-to-end gaps. Include organiser/player mission screenshots at 390px
in day/night in the existing audit gallery and confirm their audit coverage.
The CSV is present at `attached_assets/missions-review_1792389710747.csv`; its
contents and wiring have not yet been reviewed for this request. The review is
documentation/screenshots only; no rules, SPEC section 3, limits or secrecy
changes, and docs pushes only when no Verify run is active.

**Round 7 public share-base fix — SSR correction included.**
[Current Verify on main](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/workflows/verify.yml?query=branch%3Amain).
The public URL formatter, preview warning and direct name entry are implemented.
Verify #295 on `d17306f` passed browsers, the full layout audit and real-server
rehearsal; only unit failed because the warning read `window` during server
rendering. That failure was reproduced locally and corrected with a browser
guard. All 35 route/helper/component tests now pass. The complete local unit run
passed 745 checks; the existing rename guard hit its unchanged 5s limit under
parallel load and passed in isolation (437ms total run). No assertion, threshold,
game rule or production setting changed.

## Earlier verification evidence

**Round 7 UI bug batch — public share-base fix:** implemented HTTPS-validated
`PUBLIC_BASE_URL` for room/invitation links and all QR/share/copy surfaces.
Unconfigured private previews retain the room code and show the owner's exact
Lobby warning, without a private QR/link. Code links open and focus the name step.
Local evidence: 26 unit/component/build-wiring tests and 16 four-profile browser
checks pass. Last published-to-GitHub baseline: `365da5d`, Verify #294 green.
No app publishing, environment values, domains, DNS, production secrets,
authentication origins, rules or rate limits changed. Owner publishing/base-URL
steps are recorded in HOSTING; next is Verify for this isolated change.

**Round 7 application-state audit COMPLETE.** Source `0390b26` is verified green by [Verify #293](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/40195265989): all browser profiles, the full audit, real-server rehearsal and every other required gate passed. The implementation and refreshed screenshot gallery are on main.

**Coverage:** 71 UI states × four widths × day/night × four browser profiles (2,272 audited combinations), plus the named checkbox, footer and Lobby-share regressions. The canonical 568 JPEGs are in `docs/screens/round-7-audit/`. These are browser/device-profile tests, not physical-phone certification. No rules, limits, secrecy checks or geometry thresholds changed; no owner question is pending.

## Verification history

**Round 7 current follow-up — main `fefe1c1`, Verify #292 FAILED in browsers:** The complete audit and real-server rehearsal passed; five legacy browser assumptions needed alignment with the owner-approved scroll surface. All 20 focused regressions pass across the four profiles. Closed Conversation Help keeps its zero-gap contract, while Deal/no-votes retain necessary glyph clearance. The refreshed Pixel audit again passes all eight variants (the final case was rerun alone after the shell's 180s command budget interrupted the serial capture, not after a test timeout). No thresholds, assertions about secrecy or rate limits were weakened. Next: push this small follow-up after confirming Verify is idle, then await the result.

**Round 7 bounded scroll/audit — isolated fix ready to push after `a2565b2`:** Verify #291 failed only iPhone's obsolete fixed night-card height; the correction retains exact cross-role geometry equality. The owner-approved main scroll area and complete audit are implemented (D106). All 32 full-matrix cases pass across Pixel/iPhone/iPad/desktop: 71 states × four widths × two themes × four profiles = 2,272 combinations. The combined targeted run has 85 passing checks and seven pre-existing profile skips, after correcting the R5 setup to reset the main scrollport before the night palette; its full Pixel matrix passes separately. The 568-image canonical gallery is regenerated. Typechecks, lint and formatting pass. No owner decision pending; no rules, limits, secrecy checks or thresholds changed. Next: push this isolated slice and wait for Verify.

**Previous attempt — `e3276aa`, Verify #290 FAILED:** H1's Create click was intercepted by the normal-flow credit's retained stacking order; the four browser failures were the former fixed-footer ordering assertion. Both fixes landed in `a2565b2`; #291's real-server rehearsal passed. The audit also exposed compact Deal's open-Help collision, undersized primary actions, status ellipsis and missing disabled-action reasons. The later viewport-contract question is now resolved (D106), with no exception to its strict at-rest overlap requirement.

**Local evidence:** Pixel's existing Round 5 matrix and focused pointer/clearance checks pass. All 729 other unit assertions pass; the unchanged rename guard times out at 5s in both one- and two-worker full runs but passes alone in 279ms. No timeout/threshold was raised. Cross-profile calibration found two reproducer fixtures that did not scroll on a tall iPad; they now explicitly use the 390×844 phone geometry they reproduce, preserving their expected failure assertions. Amendment A remains queued.

**Current clip follow-up — GREEN:** Pushed `527df29`; Verify #289 is fully green, including all four browser profiles, strict iPhone/iPad real-media checks and the real-server rehearsal gate. Fixes cover the missing fresh-start opener in both modes, native-cover interception and a verdict revealed after a long voting circle. All 729 local unit assertions, typechecks and changed-file lint pass. All six real files play in normal/Practice projection journeys on desktop and Pixel. Real-server Practice with real clips, cold restart and an isolated six-context normal H1 replay pass locally. Local WebKit has no MP4/H.264/VP9 decoder; its checks were not skipped or weakened, and supported CI WebKit passed. Native-phone acceptance remains distinct from browser emulation. No owner decision pending; no rules or limits changed; nothing published.

**Previous Round 7 UI baseline — GREEN:** All fixes are pushed through `a31fdc1`; Verify #288 is fully green, including all four browser profiles and the real-server rehearsal. Player names retain their width, statuses are separated, and the body/Back control scrolls clear of the measured footer, tabs and action stack. The linked official Stackstone credit is restored on entry, public, game and full-screen private/guide views. The complete real-server Pixel Practice journey also passed locally (2.3 minutes), with its existing fullscreen, rotation, privacy and clip checks. No product rules, rate limits, secrecy behaviour or test tolerances changed. Updated screenshots are in `docs/screens/round-7-improvements/`. Native-device confirmation remains distinct from browser emulation. No owner decision is pending.

**Previous-run diagnosis retained for the audit:**

**Round 7 owner screenshot fixes — follow-up ready:** Main is `3a5e9b5`; Verify #286 failed in browsers/rehearsal, while unit, static, audit and the other gates passed. The real logs showed two causes: viewport-wide credits widened the public grid's automatic minimum at 320px, and smoke/rehearsal tests still expected no play credit. The grid is now explicitly shrinkable; only obsolete footer-absence expectations changed. Twelve focused desktop/Pixel/iPhone browser regressions pass with all geometry assertions intact. A further red-first check caught missing credits on full-screen practice guides; guides and organiser confirmation now own their linked credit, and both phone guide journeys pass. The short-name, Practice clearance and complete day/night game matrix checks already pass; screenshots are under `docs/screens/round-7-improvements/`. All 726 local unit assertions pass in two batches (the unchanged 5s rename guard passes in isolation and also passed in GitHub #286). Typechecks, lint and formatting pass. No rules, rate limits, secrecy behaviour or official SVG bytes changed. Next: push this follow-up after confirming no Verify is active, then wait for its result. Entry amendment A remains last.

### Round 7 — Verify repair evidence

- The new Pixel regression failed for both roles before the fix: a late slot-1 acknowledgement marked the newly rendered slot as done. Step-scoped completion fixes it. Both regression cases and both existing role-specific night-choice tests pass (4/4); the regression also completes slot-2 Review and Confirm.
- Frontend/test typechecks, focused lint/format checks and all 708 unit tests passed before the harness follow-up. The database-free command tests pass with the missing seat-presence mock. CI #282's unit job is green.
- The rename guard passed alone in 4.28 seconds. A later concurrent-load unit run passed 709/710 but the same unchanged scan took 5.50 seconds and hit its five-second limit. The threshold is unchanged; this is recorded as local load sensitivity, not hidden by a timeout increase.
- The seeded real-server H1 replay submitted slot 2 for every remaining player and reached FINISHED on every phone, then the harness eagerly read the removed Move-on control. A test-only follow-up checks transitions first; 18 helper tests pass, retaining the same-step enabled-state gate.
- The disconnected-player real-server journey and cold restart passed locally. The seeded combined Practice run played nightfall and dawn but finished without covering its final `clips=off` skip case. The normal-environment run matched CI instead, without applying the H1 engine seed to other journeys; no assertion was removed or changed.
- With CI's normal environment, the full local suite passed H1, disconnected-player and cold restart and failed only on the same finished-roster assertion as #282. The owner-approved roster fix is covered by a new Pixel/desktop regression that also preserves in-game role hiding and a departed seat's missing role. All 710 unit tests subsequently passed without concurrent browser load; the rename-guard threshold remains unchanged.

**Previous milestone — Round 7 Stage 2B (Vote, Revote and Verdict):** commits `086ae4d`, `aafaaa7`, `7ebb798`, `e1f2e35` and status update `3665dd3` are on `main`; Verify #267 on the harness fix is green (19/19 jobs), and Verify #268 on the status update is green. #265’s stale Vote/Revote expectations are corrected; #266’s CI 429 is addressed by the Q11-approved 65-second harness-only cooldown. No product polling or rate limits changed.

**Stage 2B changes:** vote rows no longer label every unselected player “Waiting”; the viewer's row says “You” and the selected row says “Selected”. Revote has an accented “What is happening” card with the tied-player reason. Public verdict wording covers both a banished player and a no-votes result. The Conversation-only oversized gap below collapsed Help is removed; no other Conversation layout changed. No game rules or security behaviour changed.

**Local checks:** the active Vote screen, out-player vote-progress summary and Revote browser tests pass (3/3); the full real-server Pixel rehearsal and disconnected-player journeys pass locally, the latter with the bounded cooldown; typecheck:tests, lint, formatting and diff checks pass. The opt-in screenshot gallery generated 40 files: Vote, Revote, banished Verdict and no-votes Verdict, in day/night themes at 320, 375, 390, 430 and 1280 px. Its test Socket.IO fixture delivers a schema-valid public view so the app renders the Live chip; this is a visual fixture, not a real-server rehearsal. Local iPhone WebKit cannot launch in this workspace; GitHub WebKit remains authoritative.

**Next:** Finish item 6 and report after its GitHub Verify result is known.

### Round 7 Improvements — item 1: expanded Help scrolling

The open `GameHelpDisclosure` previously measured available space and applied a
fixed `max-height` with `overflow-y: auto`. On a phone, this made the disclosure
an inner scroll container, so gestures over it did not move the game page.
Removing that nested scroll area restores document scrolling; the existing
page-bottom padding still keeps the last item above the fixed dock. The held
private-reveal scroll lock remains separate and unchanged.

The new browser regression covers Conversation, Vote and Night at
320/375/390/430 px and passes locally on Pixel (12 phase/width combinations).
Its iPhone WebKit path uses `scrollIntoView` because Playwright mobile WebKit
does not support mouse-wheel input; the test still asserts that the document
scrolls and the final choice is clear of the dock. The existing public-room
geometry check now scrolls to the document end before asserting Help clearance,
preserving the geometry assertion under the normal-flow layout. Verify #270
confirmed this adjustment is needed: all four browser jobs failed on those two
test assumptions, while the other jobs passed. The iPhone path could not be
run locally because this workspace lacks WebKit system dependencies; GitHub CI
remains authoritative.

### Round 7 Improvements — item 2: compact status row

On in-game screens the separate player-count chip is removed; the public
“What is happening” card and Players tab already carry that information. The
entry lobby retains its joined count. The Live word is visually hidden but
remains in the connection status accessible name; Reconnecting and Offline
remain visible. A non-organiser gets the same Menu row and local Display
setting, but no organiser actions. The row uses the existing 16px shell gutters,
8px gaps and a single non-wrapping line.

Regression coverage first failed on the old count chip and on a public player
without a Menu; the compact row and role-neutral menu checks pass locally.
Verify #272 exposed two Pixel failures: the narrow phase chip clipped one long
label, and the Join test measured before the existing visual-viewport resize
sync. The phase label now fits at 320px without changing the geometry
assertion; the Join test waits for that sync and retains the original 360px
button-clearance assertion. The full Pixel screen matrix passes locally after
the correction. Verify #273 on `497eb8f` passed all 18 jobs, including the
Pixel, iPhone WebKit, iPad WebKit and desktop browser jobs, rehearsal-live,
required-checks and audit.

The #258 browser failures were stale Stage 1 expectations for the status-card geometry, day-text colour and a broad Help locator. The iPhone Axe failure sampled the game action button during its background-colour transition (3.51:1); game action fills now change immediately while border colour may still transition, and the test verifies the approved fill and runs the unchanged Axe check in both themes. Verify #259 passed all browser jobs, but rehearsal-live had two failures: the full rehearsal's test-only dynamic import of `@workspace/db/game-store` failed because `@workspace/shared` did not provide `eventSchema`; the disconnected-player test created the game (201) but its next `/commands` request remained pending for 30 seconds before the lobby appeared. The pending request follows the create flow's initial `AdvancePhase`; no product cause is proven, so no product code or rate limit has been changed. A test-only reader now queries persisted event payloads through the working database root and validates them with the shared schema; regression tests cover query order and malformed rows. The disconnected-player test now includes sanitized request-failure and pending-request diagnostics (no bodies, names, PINs, roles or choices). Both affected real-server Pixel tests pass locally with the rehearsal config (2/2, 3.6 minutes); test type-check, lint and formatting pass. Verify #260 on `6586d79` passed all 19 jobs, including rehearsal-live and desktop Chromium, iPad WebKit, Pixel Chromium and iPhone WebKit. The status-only commit `17c1a89` had a first Verify #261 attempt fail in integration at the 40-seat server-restart test (HTTP 503 at its success assertion); PostgreSQL logs recorded a statement timeout and a duplicate event-sequence key, but the exact cause is not confirmed. The isolated 40-seat test passed locally unchanged, and the failed-job rerun (Verify #261 attempt 2) passed all required jobs. No assertion, limit or product code changed for this incident.

**Round 7 Stage 1 Verify #249–#252:** #251 exposed the mobile dock moving with page scroll because an animated `.enter` ancestor transformed its fixed-position containing block. The fix is on `main` at `9646ab5`; the Pixel 320/375/390/430 layout matrix and away/resume choice checks passed locally, and the dock-covering failure did not recur in #252. Local iPhone WebKit cannot launch because this workspace lacks its system browser dependencies; GitHub WebKit remains authoritative.

**Audit:** the fix is on `main` at `8dbacd7`. Express is 5.3.0; the lockfile resolves `body-parser` 2.4.0 and the existing fast-uri override is 3.1.9, all within their existing major versions. The audit gate is unchanged; local audit reports 0 high / 0 critical. Verify #251's audit job passed.

**Round 7 Stage 1 browser slice:** pushed as `b7e41f5`. #253 and #254's iPhone/iPad failures were caused by Playwright mobile WebKit not supporting `mouse.wheel`, not by a product scroll failure. Commit `abe7fa2` removes that unsupported interaction from WebKit, keeps the overflow-lock and geometry assertions on all profiles, and restores the existing product scroll-lock code. Verify #255 passed all browser jobs; focused desktop/Pixel tests pass (4/4), and typechecks, ESLint and formatting pass.

**Round 7 Stage 1 rehearsal failures in Verify #253–#255:** H1's 5-second SHADOW failure was an outdated exact-name locator for a selected tile, whose approved UI state adds “Selected”; the H1 replay passes locally using visible player-name text. The #255 disconnected-player CI failure (successful create response, but no visible `text-lobby-code` within 30 seconds) did not reproduce in the local real-server run and passed in Verify #256, so no change was made to that flow. The offline expectation was stale (“Offline”, not “Reconnecting”). The full player rehearsal passes locally and in Verify #256 after updating checks for the wake-lock test ID, repeated-choice copy in the commentary card, the no-branding play shell/status bar and the actual “Back to start” button. No product code changed.

**Round 6 Notes / Zod security update:** the Notes regression passed in CI. #245 exposed a browser assertion that incorrectly rejected a retry at the exact 10-second `Retry-After` boundary; #246 failed because a browser route callback produced `NaN` for fake time. Exact timing now has a deterministic injected-clock unit test, and the browser check verifies back-off and eventual resume. #247's audit found `GHSA-mrhx-c7xc-m3w5` in Zod 3.25.76; the owner approved the upgrade to 4.6.6. Verify #248 passed all jobs, including audit. The complete local `pnpm run verify` also passed: 680 unit tests, 21 property tests, 86.02% server coverage (85% threshold unchanged), 2,572 scenarios with none failing, 126 browser tests passing and 22 skipped because those profiles run only in CI, all 4 real-server rehearsals passing, six public-page Lighthouse checks passing, and audit at 0 high / 0 critical.

**Round 6 Q9 follow-up:** #240 failed only because two harness pacing gaps measured 2,099 ms against the 2,100 ms minimum; #241 passed after adding 100 ms of scheduling headroom. No 429 occurred in the final rehearsal, and no rate limit or assertion changed.

**Evidence:** 133 server tests passed; line coverage is 86.01% against the unchanged 85% gate. The 40-seat and 15-seat same-seat command-burst tests passed without 429s. Pixel and desktop Chromium full rehearsals passed with real nightfall and dawn clips (browser emulation, not physical phones).

**Round 6 H2 — 12-player replay:** Pixel replay passed for `h2-seed-1201` (1 test, 7.3 minutes), and Verify #242 on `99da77a` succeeded. The final failure before the fix showed all seven living players on SHADOW cycle 3 / round 2 / slot 1 while the organiser still showed 0 of 7; the harness had waited for Move-on to enable without continuing to poll player step identity. Review exposed Confirm when tapped, so this was a harness race, not a confirmed product lockup. The harness now watches for a phase or step change throughout the disabled-control wait and after human think-time, then returns to player actions. Regression and helper tests pass (16/16), as do test TypeScript, focused lint, formatting and diff checks. No product rule, rate limit or assertion threshold changed.

**Round 6 Q6 — complete:** the client automatically claims server-selected blind organiser control; component and browser regressions cover that flow, while majority takeover remains manual. The real-server disconnected-player journey covers the unchanged grace period, skip/undo, removal/reinstatement, return-to-act and phase advancement. Verify #242 succeeded across the browser and full rehearsal jobs. This is browser emulation, not a physical-phone test.

**Round 6 Resilience 3:** already covered on `main` by the away/resume implementation. The player refetches on `online`, `pageshow`, visible `visibilitychange` and focus; the browser test covers 30 seconds, 5 minutes, 1 hour offline/online, overnight return, and a delayed resync response. Verify #243 passed with this code.

**Round 6 Resilience 4:** the adaptive polling feature is on `4d250b9`; Verify #244 passed. Failures back off exponentially with jitter; 429 responses honour `Retry-After`; successful polls restore the prior cadence. The exact-boundary regression has since moved to a deterministic unit test; the full local suite passes and awaits GitHub confirmation. No server limits or rules changed.

**Round 6 Resilience 5:** already implemented and covered by Verify #243: the player status visibly changes to “Reconnecting...” on network loss and returns to “Online” only after the game view resyncs. The real-server rehearsal asserts both transitions.

**Round 6 Notes:** the draft now clears when the player presses Done. A new browser regression proved it stayed in the textarea after closing and reopening before the fix; the fixed flow passed on all four browser profiles, including in Verify #245. It also checks the released text is absent from the DOM, local/session storage and browser console. Temporary privacy covers still allow a player to return to the open Notes screen.

**Round 7 lighter shell:** top-row Notes sheet, organiser Menu/Display access, collapsed Help, compact phase commentary, single-action dock and Game/Players tabs are covered by browser interaction checks. The complete player journey remains queued after this shared-shell Verify.

**Push isolation:** `99da77a` is on `main`; the push contained progress documentation, virtual-player harness/tests and the pipeline regression test. Attached content and generated Playwright artifacts were excluded.

### Verify #234–#237 rehearsal diagnostics

Verify #234’s only failure was the lobby-code wait at the Playwright default of
5 seconds. The harness now uses the same 30-second visible wait as H1 and a
20-second timeout for other asynchronous UI checks. The Pixel real-server Q6
journey passed locally and in Verify #236’s artifact (63,050 ms disconnect
grace; skip, undo, remove, reinstate, return-to-act, and next-phase all passed).
Verify #235 was green.

Workflow commit `e3f3ec0` added a 3-day failure artifact and global
`--trace retain-on-failure`; Verify #236 failed before H1 ran because tracing
was already started by H1’s manual per-player instrumentation. The uploaded
artifact showed the exact error. Workflow commit `1bc7c96` removed only the
global trace flag, retained the failure upload, and Verify #237 is green.

### Resilience set 2

The volatile retry state reuses the original command payload and
idempotency key; an in-flight resend is coalesced. The shared
“Waiting to send” notice and Resend action are role-neutral. Focused tests cover
commit-then-lost-response, a dropped request, duplicate resend, and clearing
after phase change. No private-choice storage rules or server thresholds were
changed.

### Resilience set 4

The organiser’s join-request refresh and the coordinator access/takeover status
pollers use a shared adaptive scheduler. Successful polling keeps its existing
cadence. Transient failures increase the delay with jitter; 429 responses wait
at least the server’s `Retry-After` value and add bounded jitter. A successful
poll resets the back-off. In-flight refresh triggers coalesce into one follow-up.
The work is client-only and does not change rate limits.

### Resilience set 5

The visible reconnecting indicator was already implemented. The app shows the
connection status in its player shell, and the real-server rehearsal checks
offline → “Reconnecting...” → “Online” after resync. Verify #243 passed; no
additional code change was needed.

### Notes hold-to-reveal cleanup

Explicitly finishing Notes now clears its in-memory draft as well as the
private view; the note is not written to browser storage or application logs.
The existing temporary-cover behaviour is preserved so a player can return to
an open Notes screen before pressing Done. The regression passed on desktop
Chromium, iPad WebKit, Pixel Chromium and iPhone WebKit; Verify is pending.

### Verify #230 H1 step-identity correction

The server completed SHADOW round 1 (5/5), then automatically opened round 2.
The harness watched only the phase name, so it never returned to submit the five
new choices. The server correctly kept Move-on disabled at 0/5; this was not a
product fault. The harness now captures phase/round/slot before each action batch
and returns to player actions when that identity changes. Two new helper tests
failed first, then passed. The complete Pixel configuration passed H1, Q6 recovery,
full rehearsal and cold restart together; no assertion or timeout was weakened.
Evidence: `generated-artifacts/rehearsal-step-identity-run/complete.log`.

The desktop job in #230 was separately cancelled after Ubuntu dependency downloads
took 8m24s of its ten-minute job budget; no browser assertion failed before that
cancellation. Other suites, including scenarios and report merging, passed.

Verify #231 again spent about 8m24s downloading Chromium dependencies in the
rehearsal job, then was cancelled during `playwright install`; the full real-server
rehearsal command never started. All other completed jobs passed, including unit,
property, integration, scenario shards/report merge, audit, Lighthouse, static
checks and the other three browser profiles. Desktop Chromium also hit dependency
setup cancellation. Local complete Pixel rehearsal (H1, Q6, full rehearsal, cold
restart) passed 4/4, 4.6 minutes. The #231 cancellation is not a green Verify.

### Verify #229 cleanup correction

All suites except rehearsal-live and its required-checks dependency passed.
Within rehearsal-live, H1 and Q6 passed; the next full rehearsal failed because
Q6's file-scoped cleanup had ended the worker's cached database pool.
All real-server specs now share a worker-scoped fixture that closes the pool
only when the worker finishes. No assertion, timeout, retry or workflow changed.
The complete local Pixel run finished with three passes (Q6, full rehearsal,
cold restart) and the separate H1 SHADOW advancement failure. Neither pool-ended
error recurred. Test typecheck, focused lint and formatting pass.

H1 replay: `VIRTUAL_PLAYER_SEED=h1-seed-6001 REHEARSAL_PROFILE=Pixel bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts --grep @virtual-player-h1 --timeout=540000`.
Evidence: `generated-artifacts/rehearsal-pool-lifetime-run/complete.log` and
the H1 trace under `generated-artifacts/playwright-rehearsal-pool-lifetime-complete`.
No product fix has been made for this separate finding.

### Round 6 Q6 real-server recovery and automatic client handover

The initial missing-controls finding was fixed with a separately authorised,
blind organiser projection; ordinary player/private/socket views remain
unchanged. The server-selected recipient claims blind organiser control
automatically from a fresh status response, with no client selection or
role-dependent logic. Majority requests still require approval and a claim;
private screens defer handover notification and overlapping refreshes cannot
duplicate claims.

Component and browser regressions cover automatic handover. The real-server
disconnected-player journey covers the unchanged 60-second grace, skip/undo,
Remove/reinstate, neutral public logs, cold seat return, pending
acknowledgement and phase advancement. It passed locally on Pixel (1.8 minutes)
and iPhone WebKit (1.9 minutes), observing the grace at 62.2 and 62.3 seconds.
Verify #242 passed both the browser suite and full real-server Pixel rehearsal.
This is browser emulation, not a physical-phone test; no assertions or
thresholds were weakened.

## Approved projection optimisation

The owner approved a separate test-first projection change after profiling.
Public-log validation is reused only after comparing freshly projected contents
with a privately owned validated snapshot. Current names, nested values and
viewer filtering still apply. Returned entries are independent mutable copies.
Other fields retain their original schemas; invalid input falls back to the
original complete parser, preserving error paths and ordering.

The first regression failed before implementation (11 validations rather than
3). Thirteen new regressions cover mutation, repaired invalid input, nested
names/victims, cross-state dependencies, output poisoning, all 14 log variants,
stripping, aggregate errors, viewer context and presenter filtering.
100 targeted tests passed. All 6,305 projections in the slow reference game
matched the old implementation byte-for-byte, including JSON key order; the
complete game result hash was unchanged.

With the same two-CPU affinity and profiler settings, shard 5 wall time fell
45.8% (361,222 → 195,846 ms), worker time 337,010 → 174,998 ms,
and process CPU 698.68 → 371.86 s. All 420 games passed, identical row
IDs/configurations/seeds/strategies and complete reports apart from timings.
This local result does not replace GitHub Verify.

Final local verification: 632 unit tests, 21 property tests and 120 server tests
passed; line coverage 85.75%, unchanged 85% gate. Full application/test
typechecks, lint and formatting passed. API restarted cleanly and the public
preview renders. No rule, schema contract, workflow or timing threshold changed.

## Approved slow-shard profiling result

Restricted to CPUs 0–1 on workspace Node 24.13.0: this emulates CPU capacity,
not the exact GitHub runner. All 420 games passed every assertion; unique
coverage rows exactly match Verify #226 shard 5.

| Measurement                                 | Result               |
| ------------------------------------------- | -------------------- |
| Total diagnostic wall time                  | 361,222 ms           |
| Planning/preflight                          | 24,213 ms            |
| Worker pool                                 | 337,010 ms           |
| Process CPU / peak RSS                      | 698.68 s / 925 MiB   |
| Projection/schema-validation worker samples | 71.25%               |
| Other projection worker samples             | 11.39%               |
| Garbage collection                          | 6.92%                |
| Pool overhead/slack                         | approximately 578 ms |

This is diagnostic evidence, **not** a pass against the unchanged 300,000 ms
budget. A focused 40-seat never-acts game spent 38,665 of 40,162 ms inside
player-view projection: 6,305 projections over 22 cycles and 7,114 events,
including 18,690,840 projected-log-entry visits. There were no duplicate
identical-state/viewer calls to remove with another same-state cache.

The evidence points to repeated public-log projection/schema work, rather
than idle workers. Scenario-only balancing could distribute history-heavy
games more evenly (including serial-disconnector), but does not reduce total
CPU work. A production projection optimisation would be a separate product
change requiring approval and tests proving exact output and secrecy
equivalence. Neither option has been implemented in this profiling step.

Replay:
`taskset -c 0,1 node --import tsx scripts/src/scenarios/runner.ts --sample --shard-index=5 --shard-count=6 --partial-report=/tmp/verify226-replay5.json`

Local evidence: `/tmp/verify226-profile/summary.json`, `report.json`,
`analysis.json`, `projection-phases.json`, `rows.jsonl` and CPU profiles.
The interrupted preliminary trace is excluded from completed-run results.

## Verify #226 result

Run 39835615537 on `6f9f5c1` completed with failure. Shards 0–5 took
169,025 / 273,299 / 287,957 / 285,519 / 216,440 / 316,667 ms,
respectively, with zero game assertion failures. Merge reports “Scenario shard 5
exceeded the five-minute time budget”. This is a runtime failure, not a coverage
count or game failure. Numeric tuple allocation and global workload balancing
improved local performance but have not proved reliable margin on GitHub.
No tests, scenario counts, time thresholds or workflows have been weakened.

## Verify #225 result

Run 39827804984 completed with failure. Shards 0–5 took 277,246 / 305,715 /
321,875 / 219,447 / 281,395 / 244,517 ms, with zero game assertion failures.
The merge log reports “Scenario shard 1 exceeded the five-minute time budget”;
shard 2 also exceeds it. This is a runtime failure, not a scenario assertion or
coverage-count failure. No threshold, scenario coverage or assertion is being
relaxed. The rehearsal and night-screen recovery fixes now pass in GitHub.

Repair ready for CI: lossless numeric tuple keys reduce planning allocations;
independent coverage enumeration is retained, with duplicate pair validation
removed. Global shard balancing now accounts for inactive bots and reveal work.
All scenario configurations, seeds and unsharded jobs retain exact hashes.
66 targeted tests pass; script/test typechecks, scoped lint and formatting pass.
Local planning fell from 26,486 to 19,829 ms; final shard 2 completed 420 games
with zero failures in 89,209 ms. Local hardware is not CI evidence: a new Verify
must still prove all six shards below the unchanged 300,000 ms limit.

## Verify #224 diagnosis and repair evidence

Scenario-report diagnosis: the failed merge step reports **“Scenario shard 0 exceeded the five-minute time budget”**. This is a runtime-budget failure enforced by the merge step, not a failed game scenario or a reported count/coverage mismatch. All six scenario shard jobs passed their assertions. The five-minute limit and scenario coverage remain unchanged while the runtime cause is investigated.

Downloaded shard evidence: shards 0–5 took 416,334 / 282,414 / 334,464 /
317,512 / 257,442 / 237,803 ms, respectively, with empty assertion-failure
lists. The merge stops at the first over-budget shard; shard 0 is not the only
over-budget shard. Investigation found uneven bot-strategy distribution under
seat-count-only scheduling and duplicated projections for unchanged states.

H1 repair status: corrected pre-vote waiting expectations and verified real
phase/window transitions (phase + SHADOW round/slot, not version/progress).
The replay exposed a confirmed product recovery fault: after SHADOW window
advance, private-view requests race new-window acknowledgements. Valid 409
rejections are followed by a successful same-window private-view response, but
the client remains covered. No timer bypass or harness reopen/retry was added.
Replay seed: `h1-seed-6001`, Pixel, existing H1 command. Reported for approval
before product edits. The server-coverage command now includes the Q6/Q7
presence, automatic-handover and idempotency integration files: **120 tests
pass, 85.75% lines**, unchanged 85% threshold.

Repair validation so far: **614 unit tests pass**, application/test typechecks,
lint and format checks pass. Scenario scheduling and projection-reuse regressions
pass; an identical nine-game slow workload improved from 23,376 to 13,539 ms.
The complete local scenario batch now passes **2,572 games, zero failures,
2,522 coverage rows** in 450,095 ms (unsharded sample run). This is not proof
of the five-minute-per-shard CI budget; that still needs GitHub validation.
The separately reported night-screen recovery fault was approved for a
separate test-first product fix on 22 October. The new regression failed
before implementation, then passed with bounded private-view conflict retries
and acknowledgement/window guards. Notes retains its separate request purpose;
stale window responses cannot replace current choices. Five targeted Pixel
browser tests, two iPhone regressions and 29 targeted unit/component tests pass.
The real H1 Pixel replay (`h1-seed-6001`) passes end to end in 1.5 minutes.
Server guards, timers, private-choice storage and command retry keys are unchanged.

**Q6/Q7/Q8 status, 22 October:** pushed as `8167279`; Verify #224 failed as detailed above. Prior local checks passed: 602 unit tests, 21 property tests, 100 server-coverage tests (85.56%, threshold unchanged), the exhausted-slot HTTP retry test, 2,522 scenario coverage rows plus fault-fuzz/goldens, and Pixel/iPhone night geometry checks. Local passes do not override CI. Latest confirmed GitHub green remains Verify #223.

**Next Q6 work after Verify is green:** finish automatic organiser handover in the client (the server selects safely, but the panel still requires a claim tap), then prove the disconnected-player recovery journey through the real UI. No publication or SPEC §3 changes.

## Owner-approved queue — 22 October 2026

Work one change set at a time, tests first, without weakening checks or thresholds.
Do not push while Verify is running; check each run once when it should have
finished. Record the actual run number and next item after each push.

1. Finish Q7, then Q6, in small green commits.
2. Resilience set 2: volatile **Waiting to send**, identical words/layout for
   every role, with Resend using the **original idempotency key and payload**.
   No new persistence; preserve the existing choice-draft rules exactly.
   Clear only on confirmed success, definitive rejection or phase change.
   Test commit-then-dropped-response (one effect), dropped request, duplicate
   resend and phase-change clearing.
3. Replay H2 with `h2-seed-1201`, 12 players, Pixel. At the previous failure,
   SubmitShadowChoice returned 200 and the private view confirmed the pick;
   client/server were at version 113, SHADOW round 1, 11/11 complete.
   First establish whether the harness waits for `coordinatorMinimumAdvanceAt`
   as H1 does and whether it sends AdvancePhase. Capture evidence before
   distinguishing a product fault from a harness fault. No production bypass;
   record any required owner decision in QUESTIONS.
4. **Stop after H2.** Do not start resilience sets 3–5, Round 7 or other work
   without a new reviewer instruction. Do not change the Replit model mode.

## Current Q6 work — 22 October 2026

- **Latest confirmed GitHub:** Verify #223 is green on `70055d4`. Current changes were pushed as `8167279` through the existing GitHub integration after the saved Git credential failed. The remote file tree matches the locally tested tree exactly. No permissions changed; no CI-green claim yet. One delayed status check is scheduled.
- Rebased the working changes by clean cherry-pick onto current main; preserved the old branch and stash. Excluded unrelated attachments and generated files from the clean snapshot.
- Parallel checks found and corrected disconnect-grace timing, removed-role private projection leaks, stale sleeper activation after reinstatement, and unsafe automatic handover selection/transaction handling.
- Local checks: application and test typechecks pass; 19 presence/handover integration tests pass; 20 organiser component tests pass; all six coordinator browser tests pass on Pixel Chromium and iPhone WebKit. Browser coordinator checks use routed fixtures, not proof of the entire real-server flow.
- **Original Q7 blocker fixed:** the unchanged scenario-vote-targets regression completes under the approved immediate no-Faithful win rule. Independent oracle updated; aggressive-Traitor golden changes only its finish reason from `two-players` to `no-faithful`.
- **Q8 resolved:** removed the early exhausted-Traitor-only exemption. Before deadline, ordinary action gating applies to every role. At the normal second-slot deadline, exhausted slots complete without a victim; valid slots use their configured fallback. The original timing-privacy regression now passes unchanged. Final unit run: **602 passed** with two workers; no timeout/assertion was relaxed.
- Q6 integration repairs preserve explicit majority takeover alongside automatic dropout selection, await socket presence cleanup, and avoid the presence/cascade-delete deadlock. All 100 server-coverage tests pass, 85.56% line coverage. No workflow or threshold changes.
- **Fresh real Practice clip report, 22 October:** full real-server sessions passed on Desktop Chromium (2.0 minutes) and Pixel Chromium (1.9 minutes), using `REHEARSAL_USE_REAL_CLIPS=true`. Both reached and verified actual nightfall playback at SHADOW and dawn playback at DAWN, muted/inline overlays, nightfall tap-to-skip and dawn automatic close. Real-asset mode bypasses fixture interception and requires supported video decoding plus the playback marker. These are browser-emulated profiles, not a physical Pixel device. No assertions changed or retries used.
- Replay: `REHEARSAL_USE_REAL_CLIPS=true REHEARSAL_PROFILE=Desktop bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts e2e/rehearsal-live.spec.ts --grep 'plays a full rehearsal from the player screen'` (repeat with `REHEARSAL_PROFILE=Pixel`).

**Verify #220 resolved:** #220 failed on Prettier formatting and missing specific feedback for definitive 409 rejections. The fix was pushed in `2e8a806`; Verify #221 attempt 2 is green, including all four browser profiles and required-checks.

**Offline-player approval:** Q6 implementation was approved with the five owner decisions. Implementation is in progress locally; SPEC §3 remains unchanged. Q7 is a newly found edge case, not a request to reapprove Q6.

**Practice clip verification:** The fresh runs above supersede the earlier playback report and verify the integrated Q6 working tree.

**H2 concurrency fix, 22 October:** Included in green Verify #219 (`978e82b`). Retry only optimistic-version conflicts for votes, night choices and private acknowledgements, with a finite 40-attempt bound; re-evaluate validation against the fresh state on every attempt. Three focused regression tests, scoped ESLint and formatting passed; test typecheck also passed. No thresholds, workflow files or server phase minimums changed.

**H2 full replay remains OPEN.** The 12-context run reached SHADOW, then timed out in `approvePrivacy` for virtual-seat-11: the “Shield your screen” dialog remained visible after 20 seconds. Vite logged `ECONNRESET` nearby. The screenshot/trace/video cannot confirm that seat’s state: in the SHADOW loop `activePlayer` changes but `activePage` does not, while the failure handler chooses `activePage` first; the captured screenshot shows an out-player screen. The failure is not yet attributed to product or harness. No assertion was weakened and no product fix was attempted. Proposed next step: a test-first harness diagnostic correction to bind the active player and page together, then rerun the same seed before deciding whether a product fix is needed. Replay: `VIRTUAL_PLAYER_COUNT=12 VIRTUAL_PLAYER_SEED=h2-seed-1201 VIRTUAL_PLAYER_STAGE=H2 REHEARSAL_PROFILE=Pixel bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts --grep @virtual-player-h2 --timeout=540000`.

**Phase clips, batch 1:** Added owner-supplied nightfall and dawn MP4/WebM videos and posters. Asset presence and 450 KB per-format bundle checks pass; the static-public build test confirms clips are excluded. No phase timing or game behavior changed in this batch. Verify #219 is green.

**Join limiter:** Before: short-code joins/name checks had a shared-IP cap of 40; invite joins used 10, late invites 5, recovery 10, and status checks 30 per IP. Now: 40 per game/code plus IP, a finite 240/IP/minute join-abuse cap, status 30 per request/IP plus 480/IP/minute, and PIN attempts 10 per seat/IP with the existing five-failure seat lock unchanged. Game creation remains 5 per IP. The existing 60-second window and “Wait a minute” error copy remain; the previous code had no HTTP `Retry-After` header.

**Join limiter local checks:** 99 server tests passed; line coverage is 86.11% against the unchanged 85% threshold. Focused join, cross-game, PIN, game-creation, status, and late-invite checks passed, as did typecheck, test typecheck, lint and format. The 40-seat integration check allows 40 short-code joins and 40 invite-link joins from one IP, while the 41st is rejected. GitHub Verify #207 is green on `b25c718`.

**H1:** Verify #205’s `rehearsal-live` failure was a race: a player tapped “Check again” before the organiser UI reflected approval. The test now waits for that visible completion and captures safe diagnostics; no assertion was weakened. Verify #206 (`500ee43`) is green. The exact Pixel replay with seed `h1-seed-6001` passed locally in 1.7 minutes.

**Organiser advance minimum:** Verify #208 was cancelled after a repository-path prefix error; the correction was pushed without rewriting history. Verify #209 on `bb04028` passed all required jobs, including static checks, integration/coverage and the four browser profiles. The server-time `Ready in N` control, friendly 409 handling and projection are covered by focused tests; local Pixel/iPhone browser specs and the H1 replay (`h1-seed-6001`, 1.6 minutes) passed. Local unit (505), typecheck, lint, scoped formatting and scenario report (0 failures across 2,571 games) passed. Local server coverage hit a shared-database deadline collision (expected one claim, observed 12); I did not alter the database. An unrelated dirty H1 test file also fails local test typecheck and was not included in the commit.

**Latest green:** GitHub Verify #209 completed successfully on `bb040287994d4e4ab887f65179a6c0481cec077a`; all required jobs passed.

**R6 shared night options — Verify #211 and #212 RED; follow-up pending:** #211 failed on a stale golden count, outdated self-exclusion expectations, Vote projection and scenario strategy issues; these are corrected. #212 failed browser jobs because older privacy assertions rejected the permitted current-phase choice-ID draft in session storage. Updated assertions now require exactly one choice ID scoped to its game, seat and phase, reject that ID elsewhere, and still reject names, roles and private-task markers. Pixel re-vote/night-resume tests (2) and desktop re-vote (1) pass locally; local iPhone WebKit is unavailable. The other #212 jobs passed, but required-checks is red. Slot two excludes the viewer's slot-one pick for both roles; duplicate Traitor submissions remain rejected. Current Verify is not green.

**Verify #192 (`cf3df40`): RED; fixed in #193.** All four browser profiles passed, as did unit, static checks, property, integration, live rehearsal, Lighthouse and scenarios. `audit` found one high advisory, so `required-checks` failed. The job log showed only the count; reproducing the audit against npmjs identified `markdown-it` 14.3.2 (GHSA-gfr2-rv44-r23c, affected range `>=14.1.0 <14.3.3`) via `orval > typedoc`. The Replit registry had stale advisory data. Raised the workspace override to 14.3.3 and updated the lockfile; the public-registry audit passes with zero high or critical findings. Verify #193 is green.

**Verify #191 (`9600900`): RED; browser fixes passed in #192.** All four browser profiles had failed the same re-vote test because its fixture was not marked as a re-vote and its assertions expected only tied seats, all selectable. The app correctly displays all living opponents, with only tied candidates selectable. The test now covers the full list and disabled/dimmed non-tied choices. The audit also failed because Vite 7.3.6 had a high advisory; Vite 7.3.7 fixed it. Local WebKit browser launch is unavailable because this environment lacks Playwright system libraries.

**Phase clips (F):** Owner confirmed nightfall is a shared overlay at `SHADOW` for every role, with no separate step. Verify #190 is green (all 19 jobs). Full unit 479/479, typechecks, lint, formatting, build, 85.92% server line coverage and scenario report (0 failures/2,571 games) pass. Pixel rehearsal verifies nightfall/dawn playback, tap-to-skip, timed close, reduced-motion and `?clips=off`; local iPhone WebKit has no supported clip codec and verifies the safe no-op instead. The six owner assets are not present; save/upload them to `artifacts/party-game/public/clips/` as `nightfall.webm`, `nightfall.mp4`, `nightfall-poster.webp`, `dawn.webm`, `dawn.mp4` and `dawn-poster.webp`. Only tiny test fixtures are used locally.

**Verify #188 (`5b2e716`): RED; corrected by #189.** All four browser profiles and dependent `required-checks` failed because two browser specs still expected the former long conversation card copy; the player-room spec also expected the former long vote card copy. The rendered copy was correct, and assertions now match the concise approved copy.

**Verify #182 cause and fix:** `rehearsal-live` expected a separate Dawn screen after a terminal night. The server recorded `DawnResolved`, then `GameFinished` immediately when the murder reached parity, so the browser correctly landed on the results screen. The test now accepts that terminal order and verifies the Dawn update remains in the final public log; Verify #183 is green.

**Verify #184 (`5ae88c3`): RED; fixed by #185.** Failed jobs: `browsers (Pixel, chromium)`, `browsers (desktop, chromium)`, `audit`, and dependent `required-checks`. The browser failures were two existing header-alignment checks: the conditional wake-lock grid row collapsed the first row, moving the shell wordmark to y=16 while the shield/guide wordmark stayed at y=22. The audit found high `markdown-it` 14.3.1 and moderate `fast-uri` 3.1.7 advisories. The fix preserves the assertions and threshold, places the notice in reserved top padding without adding a grid row, and adds mature patched versions 14.3.2 and 3.1.8 to the existing workspace overrides while preserving all other overrides. Local audit reports zero high and critical; Verify #185 is green.

**Verify #178 (`3f88d1e`): RED; fixed in #179.** `static-checks` found unsupported `DeviceDescriptor.screen`; browser and rehearsal tests expected the fresh-start guide on direct game URLs instead of the current phase guide.

**Verify #172:** Resolved by #173. The iPhone browser failure came from the coordinator-console test not restoring its mobile viewport after large-screen checks.

**Verify #174 (`b8392d4`): RED; fixed in #175.** All four browser profiles failed from a stale hidden-screen assertion, private-state loss on resize and the away card preceding the result after navigation.

**R6-1:** Complete and owner accepted. Verify #187 passed all four browser profiles. The real-server cold-restart test passed locally in Pixel Chromium and iPhone WebKit: a fresh context restored the saved seat cookie/storage state and the authenticated view returned the original seat ID. The earlier iPhone handler failure was consistent with an unseeded test context; no restore bug was reproduced.
**R6-2:** Complete; Verify #181 is green. Ballots stay private until each player reveals in the random speaker order; property tests check projections before and after reveals.
**R6-3 / CP-2:** Complete; Verify #181 is green. All 35 supplied prompts are data-driven; selection is deterministic by game/day, public-fact-only, limited to one challenge, repeats only when fewer than three fresh eligible prompts fit, and keeps M7 prompts hidden.
**R6 feedback A1–A2:** Complete; Verify #185 is green. Prompt gates and day-one copy are in the commit. The wake-lock notice remains in the shared game header, over reserved top padding; it does not change header geometry or push the game content down.

**R6 feedback B — night-choice loop:** Root cause was the submitted night screen leaving “Review this choice” available while waiting, so Confirm could be sent repeatedly. It now suppresses repeat controls until a different target is selected, while preserving the draft through backgrounding. Pixel Chromium full rehearsal and focused Pixel/iPhone WebKit real-server checks pass; unit tests, typecheck, lint and formatting pass. Server coverage is 85.92% lines (95/95 tests; 85% threshold unchanged). Verify #186 is green.

**R6 feedback C — practice seat minimum:** SPEC §31 explicitly retains the 6–15-seat practice slider. The minimum remains 6, and the setup now explains: “Practice games use 6 to 15 players.” No rule or SPEC change.

**R6 feedback D — voting-circle card:** The current speaker can open a full-screen view of their own vote card; opening and closing it does not reveal a ballot or change the public tally. The overlay uses the Fullscreen API where available, remains viewport- and safe-area-aware in portrait and landscape, and has Close and Escape controls. The existing game wake lock remains active. Real-server rehearsal passes in Pixel Chromium and iPhone WebKit; Verify #187 is green.

**R6 feedback E — wording audit:** First-time rehearsal cards use concise copy separate from the full “What’s this?” details. The Notes detail no longer repeats its privacy line, and the role-reveal instruction is shorter. Verify #188 exposed stale browser expectations for the shorter conversation and vote cards; both were updated without weakening coverage. Verify #190 is green.

### R6 wording audit table

This compares the short first-visit rehearsal card with the detailed “What’s this?” text for the same step. “What’s this?” remains available; the short card is the immediate instruction and the detail explains the step. The repetition noted below is semantic unless stated otherwise.

| Screen / location                      | On-screen phrase (first-visit rehearsal card)                          | “What’s this?” detail                                                                                                                                 | Repetition and action                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your practice game — start card        | A practice game with computer players. Try each step at your own pace. | This is a practice game. Computer players fill the other seats, and nothing here is real. Each step explains itself; tap Next step when you're ready. | Repeats that this is a practice game with computer players. Kept the short orientation on the card and the fuller reassurance and pacing instruction under “What’s this?”.                                     |
| Your role — role card                  | Keep your screen covered while you reveal your role.                   | Everyone is secretly dealt a role: Traitor or Faithful. Shield your screen, then hold the seal to see yours. Let go and it hides.                     | Related privacy/reveal instruction, not a repeated sentence. Kept the brief card; the detail explains the hold-and-release flow.                                                                               |
| The conversation — conversation card   | Share what you have noticed before the vote.                           | Everyone talks it over. Who is acting suspiciously, and why? In a real game this lasts as long as the organiser sets.                                 | Both prompt discussion before voting. Kept the short action cue and the fuller discussion prompt and timing detail.                                                                                            |
| The mission — mission card             | Work as a group on the challenge.                                      | Work together to complete the mission. Your organiser records the result and any prize earned.                                                        | Repeats the teamwork instruction; the detail adds how the result is recorded. Kept the concise card and the additional process detail.                                                                         |
| The vote — vote card                   | Choose your suspect privately.                                         | Everyone secretly votes for the player they think is a Traitor. Votes are revealed one by one once everyone has voted.                                | Repeats private voting. Kept the short choice cue; the detail explains what happens after everyone votes.                                                                                                      |
| The verdict — verdict card             | Watch the votes and result appear for everyone.                        | The player with the most votes is banished, and their role is revealed to everyone.                                                                   | Related, not duplicative: the card directs attention to the reveal; the detail explains the result rule. Kept both.                                                                                            |
| Night — night card                     | Make your choice while the screen is shielded.                         | Night falls. The Traitors secretly choose someone to take. Everyone sees a private screen at the same moment, so nobody can tell who is choosing.     | Repeats the private-choice idea. Kept the short safety cue; the detail explains the shared private moment.                                                                                                     |
| Dawn — dawn card                       | The day resumes after the night announcement.                          | Morning. Everyone finds out who was taken in the night, then a new day begins.                                                                        | Both describe the return to day; the detail adds the night outcome. Kept the short transition cue and outcome detail.                                                                                          |
| Notes — notes card                     | Jot down thoughts or reminders to revisit later.                       | Use this space to jot down thoughts, reminders, or theories.                                                                                          | Semantic repetition of the note-taking purpose remains; the former repeated privacy sentence was removed. Kept the short prompt and retained the fuller detail, which adds theories; no rules wording changed. |
| Endgame — endgame card                 | Discuss whether the group is ready to finish.                          | Choose whether to end the game or banish again. The final result depends on who remains.                                                              | Both concern the end decision. Kept the discussion cue; the detail adds the available choices and stakes.                                                                                                      |
| End or continue — final decision card  | Read the stakes, then make your choice.                                | Everyone secretly decides whether to end the game or continue playing.                                                                                | Both refer to the group decision; the detail adds that choices are secret. Kept the short cue and the privacy detail.                                                                                          |
| The final vote — final banishment card | Review the remaining players before choosing.                          | The remaining players vote to banish someone before the final result.                                                                                 | Related but not a repeat: one is a review cue, the other explains the vote. Kept both.                                                                                                                         |
| Game complete — complete card          | See how the game ended.                                                | The Faithful win by banishing every Traitor. The Traitors win if any of them make it to the end. Every role is now revealed.                          | No nearby repeat: the card directs players to the result; “What’s this?” states the win conditions and reveal. Kept both.                                                                                      |

**R6 feedback 5 and practice range:** Re-vote shows every living opponent; tied candidates are enabled and full-contrast, while non-tied choices are disabled and dimmed. The tie explanation remains unchanged. The practice setup explains the 6–15-seat range. Component test, Pixel/desktop focused browser tests and all four Verify browser profiles pass.

**Local checks:** Copy-card unit tests pass (14/14), and BanishmentVoteScreen tests pass (4/4). The full real-server rehearsal and cold-restart tests pass in Pixel Chromium and iPhone WebKit. The corrected re-vote browser test passes in Pixel and desktop Chromium; local iPhone/iPad launch is blocked by missing Playwright system libraries. Typecheck, lint and formatting pass; audit against npmjs reports 0 high and 0 critical; the 85% server-coverage threshold is unchanged.

**Delivery:** GitHub main is at `8106efb`; Verify #193 is green. The tie re-vote display, practice-range explanation, phase-clip player and audit fix are verified. The six production clip assets are not present; only test fixtures are used. No CP-1 attachment, workflow, SPEC, deployment or production-setting change is included.

**Copy alignment:** Complete in `d3b7fded`; Verify #176 is green. Approved FAQ wording is in the shared source and SPEC; 14 unit tests, 27 public-page browser tests and the static build passed locally.

**Milestone 6 — automated items verified:** takeover/coordinator secrecy, undo and schedule shifts; coordinator logistics; public-only `/tv` pairing, verdict and finish; accessibility, route, keyboard, reduced-motion and bundle checks; configured admission-capacity behaviour. Targeted coordinator/presenter browser tests (Pixel and desktop), takeover/admission integration tests, unit tests, typecheck, lint and format check passed locally.

**Task 6 owner items:** manual VoiceOver/TalkBack and real-device checks; approve the PIN-reset request/approval interaction; confirm whether to add timetable/mission details to the public presenter projection; run a representative capacity test and approve `MAX_ACTIVE_GAMES`. Presenter ballots remain excluded and narration remains organiser-phone-only under §26.

**CP-1 — NOT FINISHED; blocked (20 October 2026):** 46 tasks: 6/6 replacements applied; 46 decoys: 13/13 applied; 37 missions: 8 named fields changed and 2 already matched (10 checked). Length matching fails: maximum sorted difference 11 (limit 8), at `task-031`/`decoy-022` (36/46, diff 10), `task-007`/`decoy-001` (39/50, diff 11), and `task-010`/`decoy-040` (51/60, diff 9). Band differences exceed 2 at 60–79 (5) and 80–99 (4). No wording beyond v2.1 was changed. The eight supplied content files and backups are in local-only commit `3bfd1c9`; it is not pushed and the content is not integrated into the app. Q6 records the wording/length blocker; Q7 records the local-commit conflict. No content changes, push or history rewrite will be made pending owner direction.

## CP-1 content patch v2.1 — 19 October 2026

- Applied all 6 task replacements: `task-014`, `task-017`, `task-018`, `task-025`, `task-031`, `task-043`.
- Applied all 13 decoy replacements: `decoy-001`, `decoy-006`, `decoy-009`, `decoy-016`, `decoy-017`, `decoy-020`, `decoy-021`, `decoy-022`, `decoy-030`, `decoy-031`, `decoy-035`, `decoy-038`, `decoy-042`.
- The source contains 37 missions. Five mission entries had named fields in the patch: 8 fields changed (`straight-face.setUp`; `silent-line-up.setUp`, `.rules`, `.accessibility`; `truth-hunt.setUp`; `fetch-it.setUp`, `.locationNotes.remote`; `mummy-wrap.setUp`); `fetch-it.locationNotes.indoor` and `.outdoor` already matched. No patch item was skipped.
- All three edited JSON files parse. Backups of all eight supplied content files are in `attached_assets/.cp1-originals-v2.1/`. The content and backups were committed locally in `3bfd1c9`, but not pushed or integrated into the app; this conflicts with the CP-1 no-commit instruction (see Q7).
- The GitHub tree at #171 already contains the three review CSV attachments: `attached_assets/missions-review_1792389710747.csv`, `attached_assets/task-decoys-review_1792389710837.csv`, and `attached_assets/traitor-tasks-review_1792389710882.csv`. They were not modified or pushed during CP-1. The five other supplied files are absent from that tree. The brief forbids commits during CP-1, so the existing CSV tracking was not changed.
- Searched the repository outside `attached_assets/` for the 29 requested new strings: zero matches.
- Length check used all 46 task and 46 decoy entries. Sorted-length maximum difference is **11** (limit 8). Failing ranks: 1, `task-031` 36 vs `decoy-022` 46 (10); 2, `task-007` 39 vs `decoy-001` 50 (11); 6, `task-010` 51 vs `decoy-040` 60 (9).
- 20-character bands (tasks / decoys / absolute difference): 20–39: 2 / 0 / 2; 40–59: 5 / 5 / 0; 60–79: 13 / 18 / 5; 80–99: 20 / 16 / 4; 100–119: 6 / 7 / 1. The 60–79 and 80–99 bands exceed the limit of 2.
- The requested v2.1 wording is unchanged; no substitute wording has been drafted or applied. Resolution is blocked pending owner-approved wording for the failing matches and band counts (see Q6).

## Earlier milestone results

**Verify #163 (`e727e10`): GREEN.** #162 failed `static-checks` test typecheck (TS2339: an un-narrowed event union); `required-checks` failed as a consequence. The separate typed seat-ID fix kept all assertions unchanged.

**Local workflow restart:** A stale Vite/API process group from the previous run held ports 22814/8080. Only those identified old groups were stopped; the new processes now bind and serve on the configured ports.

**LP-8 Verify #156 (`3704b3d`): GREEN (19/19).** `audit`, `browsers (desktop, chromium)`, `browsers (Pixel, chromium)`, `browsers (iPhone, webkit)`, `browsers (iPad, webkit)`, `integration`, `property`, `unit`, `static-checks`, `lighthouse`, `rehearsal-live`, `merge-scenario-reports`, `required-checks` and all six scenario shards succeeded.

**Verify #155 (`8dca2ca`): CANCELLED, not green.** Its Unit command failed on three stale assertions in `tests/agent-readable-pages.test.ts`: they expected `/coming-soon` to have its own canonical URL and to appear in `llms.txt` and `sitemap.xml`, contrary to LP-8.2. The audit command itself passed; the Unit and Audit jobs later concluded cancelled, and `required-checks` failed. GitHub reported no cancelling actor and no competing Verify run; the workflow permits same-branch concurrency cancellation, but the available data does not expose the cancellation trigger. The Unit failure was a deterministic test assertion, not a browser or runner failure. The expectations were corrected without changing application behavior.

**Attachment cleanup:** The 12 old-name text attachments and two supplied screenshots were present only in a local-only commit, not on GitHub. They are now untracked and remain on disk; exact-path ignore entries were added after confirming no build or source code uses them. The 31 older tracked attachment files are unchanged.

**Server coverage:** Started at 81.59% lines (1,206/1,478) with all 94 selected tests passing, but the 85% coverage command correctly exited red. Added integration coverage for coordinator delegate, presence and takeover paths plus departed-seat restrictions. It now passes at 85.79% (1,268/1,478), with all 94 tests passing and the threshold unchanged. The standalone GitHub Verify workflow does not run this coverage command; `pnpm run verify` does.

**Ubuntu runner review (19 October):** 12 jobs use `ubuntu-24.04` (11 Verify, one promote); no change recommended. GitHub refreshes the image behind this label, so OS packages can drift.

**Phase A:** Read-only publish checklist added to `docs/HOSTING.md`. No deployment, settings, domain, DNS, secrets or paid service were changed.

**LP-8 local status:** All six static pages and coming-soon rules are implemented. Targeted unit tests, typecheck, lint, format, production build, static build, desktop Chromium, Pixel Chromium and local Firefox pass. Lighthouse scores are 1.00 for all required categories on all six public pages. iPhone/iPad WebKit cannot launch locally because this Nix container lacks Playwright's WebKit host libraries; Verify installs WebKit with its system dependencies.

| Route          | Purpose                          | Indexing                                                            | Canonical      | Links                                                                       |
| -------------- | -------------------------------- | ------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| `/`            | Coming-soon landing page         | Yes                                                                 | `/`            | About, How to play, FAQ, Compare, Stackstone Consulting                     |
| `/about`       | About and independence statement | Yes                                                                 | `/about`       | Home, About, How to play, FAQ, Compare, Stackstone Consulting               |
| `/how-to-play` | Play guide                       | Yes                                                                 | `/how-to-play` | Home, About, How to play, FAQ, Compare, Stackstone Consulting               |
| `/faq`         | Frequently asked questions       | Yes                                                                 | `/faq`         | Home, About, How to play, FAQ, Compare, Stackstone Consulting               |
| `/compare`     | Game-format comparison           | Yes                                                                 | `/compare`     | Home, About, How to play, FAQ, Compare, Stackstone Consulting               |
| `/coming-soon` | Reachable fallback page          | No separate index; canonical `/`, omitted from sitemap and llms.txt | `/`            | Home, About, How to play, FAQ, Compare, Stackstone Consulting, Back to home |

`app-shell.html` and `404.html` are noindex, have no canonical or structured data, and link back to Home. Verify does not run Firefox: its browser matrix is desktop Chromium, Pixel Chromium, iPhone WebKit and iPad WebKit. `playwright.public-firefox.config.ts` adds the six-page desktop Firefox check; both tests pass locally.

**Owner actions:** Rename `TURNSTONE_GITHUB_TOKEN` to `OATHSTONE_GITHUB_TOKEN` in Replit Secrets and `TURNSTONE_PROMOTION_ENABLED` to `OATHSTONE_PROMOTION_ENABLED` in GitHub Actions Variables, update consumers, then remove the old names. Preserve repository URL `https://github.com/WhisperingSquirrel-TD/Turnstone`.

**Exclusions:** Historical verification and release records retain the old name. Attachment files remain untracked and out of commits.

**Hard stops:** No publish, deployment, domain, DNS, production-secret or paid-service changes.

## Server coverage review — 19 October 2026

The 85% line threshold is configured by `test:server-coverage` in `package.json`. The GitHub Verify workflow runs Unit and Integration separately and does not invoke `test:server-coverage`; therefore Verify can be green without enforcing this threshold. The repository's `pnpm run verify` command does invoke it.

Current uncovered executable lines from the passing server-coverage report:

- `artifacts/api-server/src/app.ts` (178): 142, 195, 201–202, 205, 207, 209, 274, 427, 435, 575, 593–594, 617–618, 621–622, 626–627, 681, 793–794, 807–808, 826, 865–866, 891, 915–916, 919–920, 947, 951–952, 962, 968–969, 1007–1008, 1042–1043, 1104–1105, 1156–1157, 1161, 1167–1168, 1172–1173, 1177–1178, 1195–1196, 1200–1201, 1207–1208, 1225–1226, 1229–1230, 1235, 1237–1238, 1243, 1245, 1248–1249, 1261, 1280–1281, 1288, 1301–1302, 1352–1353, 1375–1376, 1385–1386, 1402–1403, 1413–1414, 1419, 1479–1480, 1512, 1562–1563, 1643–1644, 1660, 1671–1672, 1704–1705, 1745–1746, 1795–1797, 1813–1815, 1822–1824, 2012, 2029–2030, 2066–2067, 2087–2088, 2097, 2149, 2251, 2284–2285, 2318–2319, 2328, 2344–2345, 2366–2367, 2393, 2409–2410, 2431–2432, 2498, 2511, 2524–2525, 2530–2531, 2566, 2571, 2581, 2592–2593, 2599–2600, 2625, 2647–2648, 2656–2657, 2688, 2750–2751, 2782–2783, 2785–2786, 2797–2798, 2854, 2859, 2881, 2886, 2904–2905, 2936, 2940–2941, 2946–2949, 2951–2952, 2956–2957.
- `artifacts/api-server/src/realtime.ts` (25): 61, 105–107, 124, 151, 164–173, 180–182, 219, 244–246, 261, 285.
- `artifacts/api-server/src/deadline-scheduler.ts` (6): 33, 39, 41, 116, 129–130.
- `artifacts/api-server/src/config/env.ts` (1): 58.
- `artifacts/api-server/src/middlewares/security.ts`: none.

The initial 81.59% report included substantial uncovered coordinator-takeover handling in `app.ts`: 93 lines traced to the takeover implementation commit, alongside older API error paths. New tests exercise the coordinator routes and now leave 31 lines from that commit uncovered; most remaining uncovered app lines are older routes and error handling. The server's departed-seat guard is explicitly tested. Engine/reducer departure code is not part of this script's configured server-file include list, so this report does not measure its coverage.

## Ubuntu 24.04 runner review — 19 October 2026

All 11 jobs in `verify.yml` and the one job in `promote.yml` select `ubuntu-24.04`; neither uses `ubuntu-latest`. No runner change is recommended: this keeps the workflow on the supported Ubuntu 24.04 line rather than switching to an unpinned latest label. The label is not an immutable image version, so GitHub's image refreshes can change preinstalled OS packages and tools. The workflows pin Actions by full commit SHA, Node to major 24, pnpm to 10.26.1, and application dependencies through the lockfile; system-image drift remains the residual risk. Verify #159 passed all 19 jobs.

## Previous verification history

- Verify #127 (`39026343438`), commit `5654db3`: Success on the public run page; all 19 jobs passed, including every browser profile, Lighthouse, live rehearsal and scenario shard. M4b source and owner checklist verified; no deployment.

- Verify #126 (`39022854952`), commit `f61ff58`: Success on the public run page, all 19 jobs; final R5 themes, contrast, live rehearsal, all browser profiles and scenario shards green.

- Verify #125 (`39019746309`), commit `05119d7`: Success on the public run page; all 19 jobs passed, including every browser profile, live rehearsal and scenario shard. R5 commentary/explainers/layout group verified.
- Verify #124 (`39016771968`), commit `780f527`: Success — all 19 jobs passed, no annotations, including every browser profile and the real-server rehearsal. R5 item 10 accepted by CI.
- Verify #123 (`39016588173`), commit `61db039`: unit job failed on the old completed-role fixture; corrected by explicitly completing the roles and adding pre-completion and no-name assertions, not reducing the expected completed count.
- Verify #122 (`39015464423`), commit `917f32f`: Success — all 19 jobs passed with no annotations, including all four browser profiles, real-server rehearsal and all scenario shards.
- Verify #121 (`39014811224`), commit `1c83607`: Failure — original iPhone night-choice failures fixed; short-screen rehearsal layout still reserved space for a hidden organiser bar, failing the unchanged no-unnecessary-scroll assertion on all profiles.
- Verify #120 (`38982785132`), commit `f3ea909`: Failure — iPhone night-choice Confirm was covered by the fixed footer; all other substantive jobs passed. Reproduced locally in actual WebKit, then the unchanged tests passed after reserving the footer outside the scrollport.

- Verify #119 (`38981298067`), commit `156bc27`: Failure — all four browser profiles failed the same stale private-view/mock-screen assertions, and `rehearsal-live` stalled at final banishment after the human seat was removed. Other jobs passed.
- Verify #118 (`38976990728`), commit `a461063`: Success — all 19 jobs passed, including four browser profiles, rehearsal-live, six scenario shards, merged scenario report and required-checks. Zero annotations; `promote` was skipped.
- Verify #117 (`38975034331`), commit `9a4cc5e`: Failure — `rehearsal-live` asserted the all-voted message before the Next step request finished processing rehearsal bots; `required-checks` failed as a consequence. All other jobs passed. The test synchronization fix is in `a461063`.
- Verify #108 (`38950413086`), commit `d9f8fc5`: Success — all 19 jobs passed, including four browser profiles, rehearsal-live, six scenario shards, merged report and required-checks. Zero annotations; `promote` was skipped.
- Verify #107 (`38948886098`), commit `aa5d5b9`: Success — all 19 jobs passed, including four browser profiles, rehearsal-live, six scenario shards, merged report and required-checks. Zero annotations; `promote` was skipped.
- Verify #106 (`38947053863`), commit `6dc0d7a`: Failure — `rehearsal-live` assumed a fixed rehearsal seed would create a first-vote tie, but the fresh session secret changed derived bot seat IDs; iPhone and iPad WebKit failed because an enabled text input reports computed cursor `auto`, while the test required `text`. Every other job passed; `required-checks` failed as a consequence.
- Verify #95 (`38902154259`), commit `189f552`: Success — unit, property, static-checks, integration, audit, Lighthouse, iPhone WebKit, iPad WebKit, Pixel Chromium, desktop Chromium, rehearsal-live, scenario shards 0–5, merge-scenario-reports and required-checks. Zero annotations across 20 checks; `promote` was skipped.
- Verify #96 (`38903135176`), commit `72767e8`: Success — unit, property, static-checks, integration, audit, Lighthouse, iPhone WebKit, iPad WebKit, Pixel Chromium, desktop Chromium, rehearsal-live, scenario shards 0–5, merge-scenario-reports and required-checks. Zero annotations across 20 checks; `promote` was skipped.
- Verify #93 (`38899898260`): failure in `rehearsal-live` because the helper did not handle `FINAL_VOTE`; `required-checks` consequently failed. All other jobs passed: unit, property, static, integration, audit, Lighthouse, four browser profiles, six scenario shards and merged scenario report.
- Verify #92 (`38895856320`): `rehearsal-live` selected the first Shadow option and received HTTP 409. Browser profiles also had stale shield/action-bar and Notes cover assumptions. The local regression fix is in `3bcf506`.
- Verify #91 (`38894288932`) failed in the iPhone, iPad, Pixel and desktop browser profiles, plus `required-checks`; every other job passed. Each failed check had one generic exit-code annotation. The stale tests expected shield cards on banishment votes and Notes; the policy change correctly removed them, and Notes needed a direct private-view request. Fix pending.
- Verify #78: the public run page shows completed successfully; the annotations panel is empty. Verify #77 also succeeded with an empty annotations panel.
- Verify #79 per-job result: Success — static-checks, property, integration, Lighthouse, audit, all four browser profiles including both WebKit profiles, rehearsal-live, scenario shards 0–5 and merge-scenario-reports. Failure — unit (two sharding assertions still expected 13 goldens; 15 are now present) and required-checks. The scenario shards themselves completed successfully.
- Verify #80 per-job result: Success — unit, static-checks, property, integration, audit, Lighthouse, all four browser profiles, rehearsal-live, scenario shards 0–5, merge-scenario-reports and required-checks. `promote` was skipped. Zero annotations across all 20 check runs.
- Verify #72 per-job result: Success — unit, static-checks, property, integration, audit, Lighthouse, all four browser profiles, rehearsal-live, scenario shards 0–5, merge-scenario-reports and required-checks. `promote` was skipped. Zero annotations across all 20 check runs.
- Verify #71 per-job result: Success — unit, property, static-checks, integration, Lighthouse, audit, all four browser profiles, rehearsal-live, scenario shards 0–5, merge-scenario-reports and required-checks. `promote` was skipped. No annotations.
- Verify #67 per-job result: Success — property, integration, static-checks, Lighthouse, unit, rehearsal-live, scenario shards 0–5, merge-scenario-reports and audit. Failure — browsers (desktop Chromium), iPhone WebKit, iPad WebKit, Pixel Chromium, and required-checks. Skipped — promote. The four browser checks each have one generic exit-code annotation; every other check has zero annotations.
- Earlier local verification: no-votes, public-announcement and golden-scenario tests passed (11/11); the CI-sharding suite passed (5/5); typechecks, targeted lint, formatting and `git diff --check` passed. The mocked public-room test passed on Pixel Chromium (1/1).
- Push status: item 13 is pushed and accepted by Verify #68. It adds the Vercel static app shell and route rewrites, with the first-paint rule recorded in SPEC §29 and DECISIONS D78. Verify #67 exposed a test-only formatting mismatch: `innerText` inserts a newline between the visible “Turn” and “stone” spans. Commit `3bbe3e7` normalizes that text and confirms the gold span is visible; no app behavior changed. Item 14 is accepted by Verify #71: both internal player wordmarks use React Router, D79 records the rule, and the live rehearsal test checks route transitions and document requests. Browser Back remounts the rehearsal with its START guide followed by the FINISHED guide; both are asserted and dismissed. Route parity was pushed in `14fa2df` and accepted by Verify #72. Verify #73 exposed missing `serverNow` fields in socket, recovery and E2E fixtures; the fixtures were corrected in `41bfdd6`. Verify #74 succeeded with all required checks and zero annotations. Item 16 is pushed as `fe99659`; Verify #75 succeeded with an empty annotations panel. Item 17's refactor-only commit is pushed as `59d1d4f`; Verify #76 succeeded with an empty annotations panel. Item 18 is pushed as `a2e57f1`; Verify #77 succeeded with an empty annotations panel. SPEC §30/D80's planner cap is pushed as `ed4361c`; Verify #78 succeeded with an empty annotations panel.
- Open questions: none. Q1 is resolved; the launch-mode Lighthouse fixture remains test-only and real builds stay noindex. Q2 is implemented: permitted late joiners use fresh invitation links/QRs, approval and always-Faithful roles. Entry regressions distinguish the six-character shared code from each player's four-digit private PIN.
- Provisional decisions: none.
- Risks: Section 30 is in progress; the planner cap is green. No-vote and double-murder engine/oracle/browser coverage is pending. Hold-seal and organiser-bar extraction are deferred until those screens are next touched, following D41; NotesScreen is already separate. PIN pepper/join-storm capacity remains queued after the M5 hands-on gate. The new Oathstone emblem is approved for later use, not part of the current in-game header. Future attachments remain excluded by default. The ZIP is absent from the current tree. `PRE_LAUNCH_NOINDEX` remains on. No publishing, deployment or paid service is authorised. The hosting NOW decision remains recorded in §28/D71/HOSTING.md; no further hosting changes beyond this static shell. The API binds to port 8080 after a stale listener was stopped; deadline-scheduler errors remain.

# Progress

## Current status — Milestones 0–4 accepted; Milestone 5 in progress

Specification sections 1–27 and owner rulings are recorded, with the latest owner-approved clarification to sections 3 and 5 added. Milestones 0–4 are accepted; Milestone 2 acceptance is based on reviewer confirmation and GitHub Verify #8, #9 and #13. The independent oracle’s two engine defect regressions remain permanent. The Milestone 2 sample passes all 2,567 local scenarios; Verify #13 passed all 18 jobs, all six scenario shards, the exact 2,522-row coverage merger and all four browser profiles with no annotations. The 40-seat engine profile averaged 729 ms/game; the slowest shard was 84,404 ms against a 266,650 ms projection. Milestone 4 passed local verify and GitHub Verify #14. The separate M4 documentation push passed Verify #15 (all 18 jobs and annotations green); Milestone 5 is in progress.

### Rehearsal banishment vote fix — 15 October 2026

The fast-rehearsal vote could remain on screen after its deadline because the server scheduler explicitly skipped rehearsal games, while the engine correctly rejected votes submitted after the deadline. The scheduler now advances expired rehearsal phases, publishes the updated game view, and processes rehearsal bots. A PostgreSQL regression covers an expired vote moving into its re-vote and verifies publication and bot processing. The full server-backed rehearsal now relies on automatic deadlines rather than manual phase advancement. Pixel tests confirm vote choices are shuffled per seat and the full rehearsal completes on the shared player screens, without a presenter or manual refresh. Verify #46 (`38766301106`) passed all 19 required jobs with zero annotations, including integration, rehearsal-live, all six scenario shards, Pixel, desktop Chromium, iPhone WebKit and iPad WebKit; promote was skipped.

`docs/SPEC.md` includes sections 26 and 27 in order. Section 27 covers the dark-background Stackstone mark and contrast checks, responsive hero and seal demo, exact comparative FAQs, claims register and mobile/Lighthouse budgets. Verify #20 exposed an iPhone WebKit same-tab navigation race; the direct-route checks now run in fresh browser tests. Full local verify and GitHub Verify #21 are green with no annotations.

On 14 October, the `/play` security banner was traced to the development client requesting `/api-server/api/csrf`, which returned Vite HTML instead of the API JSON response. The client now uses the shared same-origin `/api` route in development; CSRF cookies, origin checks and double-submit validation remain unchanged. Pixel and desktop Playwright regressions pass, including the old-path regression; iPhone and iPad WebKit passed in Verify #21. The complete local verify is green.

The next rehearsal stall had a separate cause. Same-origin Socket.IO polling sends its initial GET handshake without an `Origin` header, while the server required one; the Replit development environment also had no explicit `APP_BASE_URL`, leaving its origin allow-list empty. The socket handshake now accepts a missing `Origin` only when the request Host exactly matches an allow-listed origin, and development derives that origin from the managed `REPLIT_DEV_DOMAIN` only when `APP_BASE_URL` is unset. Production still requires the explicit base URL. HTTP mutation CSRF checks and the game-scoped seat capability requirement are unchanged. Regression, database socket, browser and complete rehearsal tests pass locally.

GitHub Verify #25 then failed in all four browser jobs. The matrix command included `@rehearsal-live`, which expects the dedicated config to start a real API and PostgreSQL; the ordinary matrix config starts only Vite and a CSRF test server. Reproducing the test under the ordinary Pixel config timed out waiting for the game route after starting rehearsal. The public annotations were generic exit-code failures. The workflow now excludes the rehearsal tag from each browser profile and adds a required dedicated job with PostgreSQL, migrations, an isolated test session, Chromium and `playwright.rehearsal.config.ts`. The regression test and full local verify passed; GitHub confirmation is pending.

Milestone 0 is **accepted** following fully green GitHub Actions Verify runs #2 and #4, including iPhone WebKit and iPad WebKit. Local Replit verification may skip those profiles only with the explicit notice `WebKit profiles run in CI`. Milestone 4's latest local run passed the 85% server line-coverage gate at 85.28%, and public GitHub Verify #14 passed all 18 jobs with zero annotations.

The earlier Milestone 2 sample reported zero failures across 2,566 games (942 core sweep cells, 788 three-way rows, 792 high-seat pairwise rows, 32 fuzz games and 12 golden games; 395.4 seconds). That result does not meet the reviewer's differential-oracle requirement and is not acceptance evidence. The two fuzz failures from the first full run were reproduced at fixed seeds and traced to the test driver issuing `AdvancePhase` after a bot action had already finished the game; a regression test guards that terminal state.

### CI and hosting findings and verification status

- Root cause of the GitHub 30-second D13 property timeout: the test replayed the entire growing event log after every phase, repeating work quadratically. The test now advances an event cursor and retains a final full replay check. A strict performance-budget test logged the pre-fix random case at 32.6 s / 664.7 ms per step; after the change it logged 2.9 s / 58.5 ms per step. All seven bot cases passed locally with the 100 ms mean-step and 15 s per-game limits. Independent 40-seat scenario runs measured 0.62–1.07 s per game. The D13 property job passed in Verify #6; the full scenario job timed out before a complete remote scenario timing report could be produced.
- A focused planner property run exposed a second performance issue: one 14-day estimate constructed 622 `Intl.DateTimeFormat` objects, making the 80-case property occasionally exceed Vitest's 5-second per-test limit. Planning now reuses one formatter per call; a regression test checks the single construction, and the full property suite passes (13 tests).
- Verify is split into separate static, unit, property, PostgreSQL integration, scenario, four-profile browser, Lighthouse and audit jobs. Every job has its own timeout and a final required-checks aggregator. `actions/cache`, `pnpm/action-setup`, and the artifact actions are pinned to Node 24-compatible full SHAs; runners are pinned to `ubuntu-24.04` for review on 19 October 2026. Verify #13 confirms the artifact-action warnings are gone.
- The licensed Gitleaks Action has been removed. CI downloads Gitleaks v8.30.1, verifies the upstream checksum file against its pinned Linux x64 SHA-256, then scans all Git refs/history with redacted output. A regression test fails if checksum verification is removed or moved after the scan. The same checksum-verified full-history scan passed locally with no findings.
- The CI scenario sample runs one complete deterministic game per core/three-way/high-seat coverage row and 32 fuzz games; full repetition volumes remain in `verify:full`. Verify #13 proved the six-shard union covers all 2,522 rows exactly once. Per-shard actual times were 62,199–84,404 ms, all below the five-minute cap; measured projected times were 264,417–266,650 ms. Full repetition volumes remain in `verify:full`.
- One `PRE_LAUNCH_NOINDEX` security flag now controls app preview, built web-server and API headers. `vercel.json` contains the static security/cache headers; `robots.txt` blocks crawlers. Tests parse the full Vercel header set and exercise built HTML and API/web responses. Vercel itself has not been deployed or live-tested.
- Release promotion is guarded by `TURNSTONE_PROMOTION_ENABLED == 'true'`, unset by default, so a `main` push cannot automatically advance `release` or deploy to Vercel.

Milestone 3 adds the pure schedule planner: three estimates, UTC time windows with IANA-zone quiet hours across DST, departures, configuration warnings, odd half-cycles, ordered compression, and clear `STEP_CANNOT_FIT`/`WINDOW_TOO_SHORT` errors. Relaxed plans extend debates and add one extra mission only when it fits; planner options do not expose hidden roles or force recruitment outside its configured trigger. Its tests cover the §7 15-seat example, 5/40 seats, Quick/Day/Multi-day windows, mostly-blocked/too-short windows, departures, DST, recommendations, compression order and deterministic property checks.

The latest complete local `pnpm run verify` passed on 15 October 2026 after the WebKit assertion corrections: 263 unit tests, 20 property tests, 72 server/integration tests, 85.18% server line coverage, 2,567 scenarios with zero failures, 36 browser smoke tests, the complete live rehearsal (57.7 seconds), Lighthouse mobile home performance/accessibility/best-practices/SEO 100 and play accessibility 100, and zero high or critical audit findings. The browser suite printed `WebKit profiles run in CI`. Verify #27 (`38659325209`) passed every job except iPhone and iPad WebKit: their lobby test expected a Full screen button despite iOS lacking `requestFullscreen`, and their hold test used unsupported `mouse.wheel`. The app already gates fullscreen on API availability; the tests now check that capability and verify the CSS scroll lock through supported browser APIs. Verify #28 (`38661237240`) for `99b19b2` is Success across all 19 jobs, including both WebKit profiles and scenario report merge; there were no failure annotations. The homepage's initial JavaScript is 4.44 KB raw and the HTML, CSS, fonts and scripts are under the 200 KB pre-image budget. Actual pre-launch headers and `robots.txt` remain noindex. No Vercel deployment, Replit publish or paid service has been enabled.

### Reviewer projection correction — 13 October 2026

The new visitor property test was confirmed failing at `VERDICT` because the full projection exposed names and revealed ballots. The projection now returns a strict visitor view containing only game existence, phase, lobby-open status and seat count; its independent allow-list is checked after ballots are revealed. The scenario harness also checks visitor fields against that allow-list. Reviewer findings about decoy text-length distribution and identical shadow-target treatment, including the friendly-fire confirmation flow, are recorded in D36 and added to Milestone 5's browser uniformity acceptance tests; that UI work is not claimed complete.

GitHub Actions Verify run #1 for commit `947043607959b9e3146565217789406f80d5b6cb` failed on 13 October 2026. At that point the workflow had one `verify` job: setup, locked dependency installation and test database migrations passed; “Complete verification including all four browser profiles” failed when the D13 termination property exceeded its 30-second limit. The browser profiles and later suites did not run. The associated “Promote verified commit” run #1 was skipped because verification failed. The workflow therefore did not yet report independent browser, Lighthouse or audit results.

The engine fix, independent CI jobs, Ubuntu 24.04 pin, Node 24-compatible action pins and checksum-verified Gitleaks CLI were subsequently pushed to GitHub before Verify run #4. Gitleaks scanned the full history without findings. The current oracle-review commit `f6fc040` was pushed, and Verify run #6 completed: static-checks, unit, property, PostgreSQL integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit and iPad WebKit succeeded; scenarios was cancelled at its 15-minute limit and required-checks failed. This was the scenario workload limit, not a cancellation from a later push. No release promotion or Replit deployment occurred.

### Push authorisation and current state — 13 October 2026

The earlier owner-authorised `GIT_URL` push was rejected for repository access or authentication (D39). The owner replaced it with a fine-grained `TURNSTONE_GITHUB_TOKEN`, scoped to this repository with Contents and Workflows read/write permission and a 90-day expiry (D40). The presence-only check returned `token present`; the token was used only through a one-off credential helper and was never displayed, inspected or persisted.

The five restored commits were pushed to `main` at `c39fc9899b6f31626c23b57012e192bae815d3aa`; `git fetch origin` confirmed `origin/main` matches. The remote and `.git/config` remain credential-free. GitHub Actions Verify run #2 for this commit completed successfully: static-checks, unit, property, integration, scenarios, audit, Lighthouse, iPhone WebKit, Pixel Chromium, iPad WebKit, desktop Chromium and required-checks all passed. Promote verified commit run #2 was skipped; no release promotion occurred.

The separate documentation commit `3f9a3326a327b6ab996f0cbc394d25106486a411` was pushed next. Verify run #3's scenarios job exceeded its 15-minute maximum execution time (15m 25s) and GitHub cancelled it; `cancel-in-progress` did not cause the cancellation. All other reported jobs passed; the required-checks aggregator failed because scenarios did not complete. Promote run #3 was skipped.

The visual-direction commit `2297844858932ab21d84f004e401cecbdced34c1` was then pushed separately. GitHub Actions Verify run #4 completed successfully: static-checks, unit, property, integration, scenarios, audit, Lighthouse, iPhone WebKit, Pixel Chromium, iPad WebKit, desktop Chromium and required-checks all passed. Promote run #4 was skipped and the `release` branch remains absent. The workflow mirror and drift-check files remain removed.

GitHub Actions Verify run #5 (`38434899856`, commit `011d4dc`) passed static checks, unit, property, integration, audit, Lighthouse and all four browser profiles. Its scenarios job exceeded GitHub's 15m 0s maximum execution time; the required-checks aggregator failed. This repeats the same workload limit seen in run #3 and is not a green Milestone 2 CI gate. Run #4 (`2297844`) succeeded across all jobs, including all four browser profiles; Milestone 0 approval stands.

### Milestone 2 differential-oracle repair — 13 October 2026

The first full sample after the reviewer changes completed 2,567 games but reported 46 failures: 45 simulated-game mismatches and one golden outcome comparison. Reproducing those simulation seeds isolated two engine defects and one reference-model boundary omission: a second murder slot could reuse an already-consumed choice or invent a victim despite the configured `no murder` fallback; `DawnResolved` could announce later victims after an earlier removal had already reached parity/two-player finish; and the reference expected all selected victims instead of truncating its independently derived list at the terminal condition. The golden runner also treated a scenario assertion as an outcome field.

Under TDD, regression tests were observed failing for the repeated/invented murder and for the reference model's terminal-dawn list. The engine now resolves each slot from remaining picks and truncates announced victims at the first immediate win; the independent model applies the same written rules without importing engine decision logic. Golden assertions are separate from outcome expectations. All 45 previously failing simulation seeds now pass individually.

The full local `pnpm run verify` passed on 13 October 2026: 149 unit tests, 20 property tests, PostgreSQL integration, scenario worker smoke, 2,567 engine games with zero failures, Pixel and desktop smoke tests, Lighthouse accessibility 100 on both routes, and zero high or critical audit findings. Local smoke explicitly printed `WebKit profiles run in CI`. Commit `6251d6b` was pushed to `main`; Verify run #7 (`38453946502`) completed with static-checks, unit, property, integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit, iPad WebKit, core sweep, three-way coverage, and fuzz/golden green. The high-seat pairwise suite hit its 15-minute job limit, so required-checks failed. No push occurred while it ran. Under TDD, new tests first failed for missing workload partitioning and CI matrix entries; after implementation, the focused tests passed (4/4), and script/test type-checks passed. The 792 high-seat games are now split into four deterministic 198-game shards, balanced by estimated player-count-squared cost; the full coverage checker runs per shard. The latest local `pnpm run verify` passed after this split: 150 unit tests, 20 property tests, PostgreSQL integration, scenario worker smoke, 2,567 engine games with zero failures, Pixel and desktop smoke tests, Lighthouse accessibility 100 on both routes, and zero high or critical audit findings. Local browser smoke printed `WebKit profiles run in CI`. Commit `7594c18` passed GitHub Verify #8 (`38458930078`) with all 17 jobs green: static-checks, unit, property, integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit, iPad WebKit, core sweep, three-way, high-seat shards 0–3, fuzz/golden, and required-checks. Milestone 2's differential and scenario gates are green; Milestone 4 is starting per owner direction. Remote and `.git/config` remain credential-free; no release promotion occurred.

### Milestone 3 gate — 13 October 2026

Completed with strict TDD: planner tests were observed failing before implementation for the missing planner, unsupported half-cycle, incomplete schedules, balance warnings and the spare-time mission extension. The local verify gate passed after implementation. The planner remains a pure estimate; actual server scheduling and user-facing timetable UI are later milestones.

### Milestone 4 backend foundation — 13 October 2026 (historical checkpoint; superseded below)

The full local `pnpm run verify` passed: 165 unit tests, 20 property tests, 20 PostgreSQL integration tests, 43 server-coverage tests, the scenario worker check, and 2,567 complete engine scenarios with zero failures. The production web build passed; Pixel and desktop browser smoke passed, Lighthouse accessibility scored 100 on home and play, and the dependency audit found zero high or critical advisories with no exceptions. Local browser output explicitly said `WebKit profiles run in CI`; iPhone and iPad WebKit remain GitHub CI profiles. The app-server workflow restarted cleanly; `/healthz` returned `ok` and `/readyz` returned `ready`.

Commit `af78008b4294b74c7fc9a33cad8c7c3bb523635e` was pushed to `main`. GitHub Verify run #9 (`38469104044`) completed successfully with all 18 jobs green: static-checks, unit, property, integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit, iPad WebKit, core sweep, three-way coverage, all four high-seat pairwise shards, fuzz-and-golden, and required-checks. No release promotion or deployment occurred.

Implemented and exercised: PostgreSQL event persistence, replay/snapshots, idempotent versioned HTTP commands, security headers and CSRF, pseudonymous database-backed rate limits, 80%-capacity admission control for new games only, durable UTC deadline claims with `SKIP LOCKED`, and PostgreSQL-backed cross-instance Socket.IO notifications. The server-core coverage gate reports 86.11% lines across its declared runtime modules. Reduced-scale checks cover a 1,045-byte 15-seat view and 5/40-client realtime fan-out; `docs/CAPACITY.md` explicitly avoids production or p95 claims.

At that 13 October checkpoint, production viewer identity was still visitor-only and guest PIN/device recovery, injected-fault full games, and portability checks remained open. The owner then directed game-scoped capabilities before accounts; the current implementation and test status are recorded below and in D58.

### Milestone 4 guest identity and recovery — 14 October 2026

Implemented the owner-directed game-scoped seat and coordinator capabilities. Capability material is cryptographically random, stored hashed, delivered only in host-only HttpOnly/Secure/SameSite=Lax cookies, and the coordinator capability authorises logistics only. Coordinator transfer is one-use and rotates the capability. Seat recovery revokes prior device sessions. Five failed PIN attempts trigger a 15-minute lock and a coordinator-only alert; coordinator PIN reset is logged publicly without logging or revealing the PIN.

Milestone 4 integration coverage now includes capability handoff, unauthorised/stale operations, PIN lockout/reset/recovery and public/private projection checks. The existing 5-seat and 40-seat HTTP/socket games retain disconnect, duplicate/stale command, reordering, two-second delay and mid-game restart coverage; static-host, sibling-origin and independent server startup checks remain enabled in Task 4.

The full local `pnpm run verify` passed on 14 October 2026: 190 unit tests, 20 property tests, 64 server/HTTP/DB coverage tests at 85.28% server lines, 2,567 scenario games with zero failures, Pixel and desktop smoke, Lighthouse accessibility 100 on home and play, and zero high or critical audit findings. The smoke test printed `WebKit profiles run in CI`; GitHub Verify #14 passed both WebKit profiles. The API Server workflow restarted cleanly and listened on port 8080. Milestone 4 was accepted after Verify #14 succeeded; no deployment or paid service was used.

## Historical record before Amendment 6 (superseded acceptance state)

## Owner approval and scope

All seven SPEC parts are saved verbatim and numerically ordered. PLAN is approved. D3–D5 and D9–D16 have owner resolutions in DECISIONS. SPEC was not edited during this work. Finish Milestone 0 before starting Milestone 1; stop for review afterwards. No publishing, deployment or paid services.

## Milestone 0 — blocked, not accepted

Completed and verified:

- Real PostgreSQL committed foundation migration, connection and readiness; environment validation and missing-value tests.
- Type checks for application/tests, ESLint and formatting passed.
- Existing unit/property/integration tests pass. Added built-production HTTP test observed failing because the build was missing, then passing after the build: both routes use fresh CSP nonces, external-only scripts and the approved no-referrer/security headers.
- Brand contrast regression retained as approved.
- Unused component-preview source/dependencies removed after confirming no dependants and an empty component registry. Its managed service was removed using validated artifact metadata; the canvas board metadata remains.
- Patched brace-expansion; replaced Lighthouse CI CLI with maintained Lighthouse 13.5.0 Node API against Playwright Chromium. The production build receives accessibility scores of **100** on both home and play.
- Dependency audit reports **zero high and zero critical**, with **no exceptions**. The audit gate checks all dependencies, fails closed on invalid/unavailable reports and rejects every high/critical finding. Its new policy tests were observed failing before policy implementation.
- Pixel/Chromium and desktop/Chromium smoke tests passed: home/play, reload, axe and 320 px checks.
- Both managed application services restart and run cleanly.

Blocking evidence:

- iPhone/WebKit and iPad/WebKit could not complete the smoke journey.
- Initial browser launch failed on native libraries. Installed required native packages and supplied missing ABI-correct Nix runtime outputs.
- The Ubuntu WebKit launcher overwrites library paths and its ldconfig-cache check does not recognise Nix outputs. A test-only wrapper uses the same official WPE binary and explicit native/loader preflight; no application security checks or browser assertions were disabled.
- WebKit now launches but fails at page creation: **“Could not create EGL display: no supported platform available. Aborting...”**.
- Stopped retrying after several distinct native-runtime approaches. Do not count these profiles passed, replace them with Chromium, or start the engine to bypass the gate.

`pnpm run verify` is therefore **not green**. An independent check chain passed through types/lint/format/unit/property/integration; Lighthouse and audit then passed separately. The entire ordered gate was not successfully completed.

## Milestone 1 — not started

No game engine implementation, game schemas, model, phases, votes, murders, projections or gameplay property/replay tests were added. Its implementation remains blocked by Milestone 0 acceptance, not by missing owner plan approval.

## Amendment 5 identity and brand retrieval

Recorded all five owner decisions in SPEC section 23 and DECISIONS; replaced the prior mid-game logo-link restriction and updated PLAN/D16. Created the owner-dated naming record with the preliminary search explicitly attributed to the owner and register/domain/handle checks pending.

Set the confirmed product identity, derived tagline/byline and organisation details in the existing config; page/social titles now consume that source. The new identity tests were observed failing on the placeholder/template, then passed after implementation. Built production output, types, lint, formatting and all 34 unit tests pass; Pixel/desktop smoke plus axe pass; Lighthouse accessibility remains 100 on both built routes. These partial checks do not make the four-profile gate green.

Playwright Chromium retrieved six original official SVGs and source/date/size/font/colour metadata under `assets/brand/stackstone/`. Theme tokens and Arial are unchanged pending owner direction on observed brand differences. The mark's every-screen/link/navigation implementation remains planned for Milestone 5 onward, not claimed complete here. No publishing, deployment or paid service.

## Full-game and release status

`verify:full` remains an honest unavailable placeholder until Milestone 2. No game scenario success, installed-mode compatibility, real-device/assistive-technology coverage or launch readiness is claimed.

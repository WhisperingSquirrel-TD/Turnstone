# Progress

## Current status — Milestone 3 green locally; GitHub CI pending

Specification sections 1–25 and owner rulings are recorded. Milestone 1 has the owner's reviewer approval, recorded in DECISIONS; its engine and C5/C6 lifecycle/termination rules are complete. Milestones 2 and 3 are now complete locally; Milestone 4 has not started.

Milestone 0 remains **provisionally accepted** until the first fully green GitHub Actions Verify run executes the iPhone and iPad WebKit profiles. The approved local notice is `WebKit profiles run in CI`; local Replit has not run those profiles.

Milestone 2 meets its local acceptance criteria: the generated sample report records zero failures across 2,566 games. It covers 942 core sweep cells, 788 three-way rows, 792 high-seat pairwise rows, 32 fuzz games and 12 golden games. The current sample took 395.4 seconds. The two fuzz failures from the first full run were reproduced at fixed seeds and traced to the test driver issuing `AdvancePhase` after a bot action had already finished the game; a regression test now guards that terminal state.

### CI and hosting findings addressed locally; external validation pending

- Root cause of the GitHub 30-second D13 property timeout: the test replayed the entire growing event log after every phase, repeating work quadratically. The test now advances an event cursor and retains a final full replay check. A strict performance-budget test logged the pre-fix random case at 32.6 s / 664.7 ms per step; after the change it logged 2.9 s / 58.5 ms per step. All seven bot cases passed locally with the 100 ms mean-step and 15 s per-game limits. Independent 40-seat scenario runs measured 0.62–1.07 s per game. These are local-container measurements; GitHub-hosted runner readings remain pending.
- Verify is split into separate static, unit, property, PostgreSQL integration, scenario, four-profile browser, Lighthouse and audit jobs. Every job has its own timeout and a final required-checks aggregator. `actions/cache` and `pnpm/action-setup` are pinned to Node 24-compatible full SHAs; runners are pinned to `ubuntu-24.04` for review on 19 October 2026.
- The CI scenario sample now runs one complete deterministic game per core/three-way/high-seat coverage row and 32 fuzz games; full repetition volumes remain in `verify:full`. This retains each row's coverage and is recorded in PLAN/D32.
- One `PRE_LAUNCH_NOINDEX` security flag now controls app preview, built web-server and API headers. `vercel.json` contains the static security/cache headers; `robots.txt` blocks crawlers. Tests parse the full Vercel header set and exercise built HTML and API/web responses. Vercel itself has not been deployed or live-tested.
- Release promotion is guarded by `TURNSTONE_PROMOTION_ENABLED == 'true'`, unset by default, so a `main` push cannot automatically advance `release` or deploy to Vercel.

Milestone 3 adds the pure schedule planner: three estimates, UTC time windows with IANA-zone quiet hours across DST, departures, configuration warnings, odd half-cycles, ordered compression, and clear `STEP_CANNOT_FIT`/`WINDOW_TOO_SHORT` errors. Relaxed plans extend debates and add one extra mission only when it fits; planner options do not expose hidden roles or force recruitment outside its configured trigger. Its tests cover the §7 15-seat example, 5/40 seats, Quick/Day/Multi-day windows, mostly-blocked/too-short windows, departures, DST, recommendations, compression order and deterministic property checks.

The latest `pnpm run verify` gate passed after the visitor-projection correction: 130 unit tests, 12 property tests, the PostgreSQL integration test, scenario worker smoke, 2,566 engine scenarios with zero failures, Pixel/desktop smoke tests, Lighthouse accessibility checks and audit with zero high or critical findings. The local smoke command printed `WebKit profiles run in CI`; iPhone/iPad WebKit still await GitHub Actions. Client bundle was 80.46 KB gzip. No release promotion, Vercel deployment, Replit publish or paid service has been enabled.

### Reviewer projection correction — 13 October 2026

The new visitor property test was confirmed failing at `VERDICT` because the full projection exposed names and revealed ballots. The projection now returns a strict visitor view containing only game existence, phase, lobby-open status and seat count; its independent allow-list is checked after ballots are revealed. The scenario harness also checks visitor fields against that allow-list. Reviewer findings about decoy text-length distribution and identical shadow-target treatment, including the friendly-fire confirmation flow, are recorded in D36 and added to Milestone 5's browser uniformity acceptance tests; that UI work is not claimed complete.

The M2/M3 changes and this correction are committed locally. Before the earlier M3 push attempt, the unpushed paths and diff were checked for secret-bearing files and credential material; none were found. The workflow's `SESSION_SECRET` is generated at runtime from random bytes. `git push origin main` failed with “Invalid username or token. Password authentication is not supported for Git operations”; no remote ref changed. No credentials changed since that failure, so this correction remains local; the owner must use Replit Sync/Push after repairing GitHub authentication. The first GitHub Actions run is still pending.

### Milestone 3 gate — 13 October 2026

Completed with strict TDD: planner tests were observed failing before implementation for the missing planner, unsupported half-cycle, incomplete schedules, balance warnings and the spare-time mission extension. The local verify gate passed after implementation. The planner remains a pure estimate; actual server scheduling and user-facing timetable UI are later milestones.

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

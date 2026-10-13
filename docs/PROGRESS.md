# Progress

## Current status — Milestones 0, 1 and 3 approved; Milestone 2 local and GitHub sample gates green, reviewer acceptance pending; Milestone 4 acceptance open

Specification sections 1–25 and owner rulings are recorded. Milestones 0 and 1 have the owner's reviewer approval, recorded in DECISIONS; the engine and C5/C6 lifecycle/termination rules are complete. Milestone 3 was also approved. The Milestone 2 oracle and all 2,567 engine scenarios pass locally; reviewer acceptance remains open. GitHub Verify #12 for commit `d1ada52` passed all 18 jobs, including all six scenario shards, exact coverage merging, four browser profiles and required-checks. Its report verified all 2,522 rows; the slowest shard took 84,272 ms, with a 266,650 ms projection. The 40-seat engine profile averaged 711 ms/game, down from 2,982 ms before the reducer fix. The run's only annotations were non-blocking Node 20 warnings for artifact actions; the actions are now pinned to Node 24 releases and await the next CI confirmation. Milestone 4 acceptance remains open.

Milestone 0 is **accepted** following fully green GitHub Actions Verify runs #2 and #4, including iPhone WebKit and iPad WebKit. Local Replit verification may skip those profiles only with the explicit notice `WebKit profiles run in CI`. Milestone 4's backend core passes local verification, but its full acceptance criteria remain open as listed in PLAN.

The earlier Milestone 2 sample reported zero failures across 2,566 games (942 core sweep cells, 788 three-way rows, 792 high-seat pairwise rows, 32 fuzz games and 12 golden games; 395.4 seconds). That result does not meet the reviewer's differential-oracle requirement and is not acceptance evidence. The two fuzz failures from the first full run were reproduced at fixed seeds and traced to the test driver issuing `AdvancePhase` after a bot action had already finished the game; a regression test guards that terminal state.

### CI and hosting findings and verification status

- Root cause of the GitHub 30-second D13 property timeout: the test replayed the entire growing event log after every phase, repeating work quadratically. The test now advances an event cursor and retains a final full replay check. A strict performance-budget test logged the pre-fix random case at 32.6 s / 664.7 ms per step; after the change it logged 2.9 s / 58.5 ms per step. All seven bot cases passed locally with the 100 ms mean-step and 15 s per-game limits. Independent 40-seat scenario runs measured 0.62–1.07 s per game. The D13 property job passed in Verify #6; the full scenario job timed out before a complete remote scenario timing report could be produced.
- A focused planner property run exposed a second performance issue: one 14-day estimate constructed 622 `Intl.DateTimeFormat` objects, making the 80-case property occasionally exceed Vitest's 5-second per-test limit. Planning now reuses one formatter per call; a regression test checks the single construction, and the full property suite passes (13 tests).
- Verify is split into separate static, unit, property, PostgreSQL integration, scenario, four-profile browser, Lighthouse and audit jobs. Every job has its own timeout and a final required-checks aggregator. `actions/cache` and `pnpm/action-setup` are pinned to Node 24-compatible full SHAs; runners are pinned to `ubuntu-24.04` for review on 19 October 2026. Verify #12 warned that the prior artifact-action pins still targeted Node 20; they are now updated to official Node 24 releases with a regression test, pending CI confirmation.
- The licensed Gitleaks Action has been removed. CI downloads Gitleaks v8.30.1, verifies the upstream checksum file against its pinned Linux x64 SHA-256, then scans all Git refs/history with redacted output. A regression test fails if checksum verification is removed or moved after the scan. The same checksum-verified full-history scan passed locally with no findings.
- The CI scenario sample runs one complete deterministic game per core/three-way/high-seat coverage row and 32 fuzz games; full repetition volumes remain in `verify:full`. Verify #12 proved the six-shard union covers all 2,522 rows exactly once. Per-shard actual times were 56,859–84,272 ms, all below the five-minute cap; measured projected times were 264,417–266,650 ms. Full repetition volumes remain in `verify:full`.
- One `PRE_LAUNCH_NOINDEX` security flag now controls app preview, built web-server and API headers. `vercel.json` contains the static security/cache headers; `robots.txt` blocks crawlers. Tests parse the full Vercel header set and exercise built HTML and API/web responses. Vercel itself has not been deployed or live-tested.
- Release promotion is guarded by `TURNSTONE_PROMOTION_ENABLED == 'true'`, unset by default, so a `main` push cannot automatically advance `release` or deploy to Vercel.

Milestone 3 adds the pure schedule planner: three estimates, UTC time windows with IANA-zone quiet hours across DST, departures, configuration warnings, odd half-cycles, ordered compression, and clear `STEP_CANNOT_FIT`/`WINDOW_TOO_SHORT` errors. Relaxed plans extend debates and add one extra mission only when it fits; planner options do not expose hidden roles or force recruitment outside its configured trigger. Its tests cover the §7 15-seat example, 5/40 seats, Quick/Day/Multi-day windows, mostly-blocked/too-short windows, departures, DST, recommendations, compression order and deterministic property checks.

The latest complete local `pnpm run verify` passed on 13 October 2026 after the reducer and artifact-action changes: 173 unit tests, 20 property tests, 20 PostgreSQL integration tests, 43 server-coverage tests with 86.11% lines, scenario worker smoke, 2,567 engine scenarios with zero failures in 124,399 ms, Pixel/desktop browser smoke, Lighthouse accessibility 100 on home and play, and zero high or critical audit findings. The local browser suite printed `WebKit profiles run in CI`; its dedicated Vite server verified the pre-launch response header. Client bundle was 80.46 KB gzip. GitHub Verify #12 passed all jobs for the reducer fix; the artifact-action update is awaiting its own CI run. The promotion workflow was skipped. No Vercel deployment, Replit publish or paid service has been enabled.

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

### Milestone 4 backend implementation — 13 October 2026

The full local `pnpm run verify` passed: 165 unit tests, 20 property tests, 20 PostgreSQL integration tests, 43 server-coverage tests, the scenario worker check, and 2,567 complete engine scenarios with zero failures. The production web build passed; Pixel and desktop browser smoke passed, Lighthouse accessibility scored 100 on home and play, and the dependency audit found zero high or critical advisories with no exceptions. Local browser output explicitly said `WebKit profiles run in CI`; iPhone and iPad WebKit remain GitHub CI profiles. The app-server workflow restarted cleanly; `/healthz` returned `ok` and `/readyz` returned `ready`.

Commit `af78008b4294b74c7fc9a33cad8c7c3bb523635e` was pushed to `main`. GitHub Verify run #9 (`38469104044`) completed successfully with all 18 jobs green: static-checks, unit, property, integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit, iPad WebKit, core sweep, three-way coverage, all four high-seat pairwise shards, fuzz-and-golden, and required-checks. No release promotion or deployment occurred.

Implemented and exercised: PostgreSQL event persistence, replay/snapshots, idempotent versioned HTTP commands, security headers and CSRF, pseudonymous database-backed rate limits, 80%-capacity admission control for new games only, durable UTC deadline claims with `SKIP LOCKED`, and PostgreSQL-backed cross-instance Socket.IO notifications. The server-core coverage gate reports 86.11% lines across its declared runtime modules. Reduced-scale checks cover a 1,045-byte 15-seat view and 5/40-client realtime fan-out; `docs/CAPACITY.md` explicitly avoids production or p95 claims.

Milestone 4 is **not yet accepted**. Production viewer identity is still visitor-only pending the real account/session work; guest invite approval, PIN lockout/recovery/device migration, full games through real HTTP and sockets with injected disconnect/latency/restart faults, and the complete sibling-origin/static-host portability tests remain unchecked in PLAN. No placeholder identity or security bypass was added. Continue only after the reviewer confirms this scope or the remaining server work is completed.

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

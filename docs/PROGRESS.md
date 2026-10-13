# Progress

## Current status — Milestones 0, 1 and 3 approved; Milestone 2 awaits sharded CI

Specification sections 1–25 and owner rulings are recorded. Milestones 0 and 1 have the owner's reviewer approval, recorded in DECISIONS; the engine and C5/C6 lifecycle/termination rules are complete. Milestone 3 was also approved. Milestone 2's independent oracle repair now passes the local full sample, but GitHub Verify run #6 cancelled its monolithic scenario job at the 15-minute limit. The sample is being split into independently visible CI suites without dropping coverage; Milestone 4 waits for the next green GitHub run.

Milestone 0 is **accepted** following fully green GitHub Actions Verify runs #2 and #4, including iPhone WebKit and iPad WebKit. Local Replit verification may skip those profiles only with the explicit notice `WebKit profiles run in CI`.

The earlier Milestone 2 sample reported zero failures across 2,566 games (942 core sweep cells, 788 three-way rows, 792 high-seat pairwise rows, 32 fuzz games and 12 golden games; 395.4 seconds). That result does not meet the reviewer's differential-oracle requirement and is not acceptance evidence. The two fuzz failures from the first full run were reproduced at fixed seeds and traced to the test driver issuing `AdvancePhase` after a bot action had already finished the game; a regression test guards that terminal state.

### CI and hosting findings addressed locally; external validation pending

- Root cause of the GitHub 30-second D13 property timeout: the test replayed the entire growing event log after every phase, repeating work quadratically. The test now advances an event cursor and retains a final full replay check. A strict performance-budget test logged the pre-fix random case at 32.6 s / 664.7 ms per step; after the change it logged 2.9 s / 58.5 ms per step. All seven bot cases passed locally with the 100 ms mean-step and 15 s per-game limits. Independent 40-seat scenario runs measured 0.62–1.07 s per game. The D13 property job passed in Verify #6; the full scenario job timed out before a complete remote scenario timing report could be produced.
- A focused planner property run exposed a second performance issue: one 14-day estimate constructed 622 `Intl.DateTimeFormat` objects, making the 80-case property occasionally exceed Vitest's 5-second per-test limit. Planning now reuses one formatter per call; a regression test checks the single construction, and the full property suite passes (13 tests).
- Verify is split into separate static, unit, property, PostgreSQL integration, scenario, four-profile browser, Lighthouse and audit jobs. Every job has its own timeout and a final required-checks aggregator. `actions/cache` and `pnpm/action-setup` are pinned to Node 24-compatible full SHAs; runners are pinned to `ubuntu-24.04` for review on 19 October 2026.
- The licensed Gitleaks Action has been removed. CI downloads Gitleaks v8.30.1, verifies the upstream checksum file against its pinned Linux x64 SHA-256, then scans all Git refs/history with redacted output. A regression test fails if checksum verification is removed or moved after the scan. The same checksum-verified full-history scan passed locally with no findings.
- The CI scenario sample now runs one complete deterministic game per core/three-way/high-seat coverage row and 32 fuzz games; full repetition volumes remain in `verify:full`. This retains each row's coverage and is recorded in PLAN/D32.
- One `PRE_LAUNCH_NOINDEX` security flag now controls app preview, built web-server and API headers. `vercel.json` contains the static security/cache headers; `robots.txt` blocks crawlers. Tests parse the full Vercel header set and exercise built HTML and API/web responses. Vercel itself has not been deployed or live-tested.
- Release promotion is guarded by `TURNSTONE_PROMOTION_ENABLED == 'true'`, unset by default, so a `main` push cannot automatically advance `release` or deploy to Vercel.

Milestone 3 adds the pure schedule planner: three estimates, UTC time windows with IANA-zone quiet hours across DST, departures, configuration warnings, odd half-cycles, ordered compression, and clear `STEP_CANNOT_FIT`/`WINDOW_TOO_SHORT` errors. Relaxed plans extend debates and add one extra mission only when it fits; planner options do not expose hidden roles or force recruitment outside its configured trigger. Its tests cover the §7 15-seat example, 5/40 seats, Quick/Day/Multi-day windows, mostly-blocked/too-short windows, departures, DST, recommendations, compression order and deterministic property checks.

The last complete `pnpm run verify` before the oracle-repair batch passed after the visitor-projection correction: 130 unit tests, 12 property tests, PostgreSQL integration, scenario worker smoke, 2,566 engine scenarios, Pixel/desktop smoke, Lighthouse accessibility and audit with zero high or critical findings. Verify #6 later passed both WebKit profiles as well. The current sharding batch has passed its focused plan/matrix tests, scripts and test type-checks, and the 45-game fuzz/golden suite; the complete local verify is pending. Client bundle was 80.46 KB gzip. No release promotion, Vercel deployment, Replit publish or paid service has been enabled.

### Reviewer projection correction — 13 October 2026

The new visitor property test was confirmed failing at `VERDICT` because the full projection exposed names and revealed ballots. The projection now returns a strict visitor view containing only game existence, phase, lobby-open status and seat count; its independent allow-list is checked after ballots are revealed. The scenario harness also checks visitor fields against that allow-list. Reviewer findings about decoy text-length distribution and identical shadow-target treatment, including the friendly-fire confirmation flow, are recorded in D36 and added to Milestone 5's browser uniformity acceptance tests; that UI work is not claimed complete.

GitHub Actions Verify run #1 for commit `947043607959b9e3146565217789406f80d5b6cb` failed on 13 October 2026. At that point the workflow had one `verify` job: setup, locked dependency installation and test database migrations passed; “Complete verification including all four browser profiles” failed when the D13 termination property exceeded its 30-second limit. The browser profiles and later suites did not run. The associated “Promote verified commit” run #1 was skipped because verification failed. The workflow therefore did not yet report independent browser, Lighthouse or audit results.

The engine fix, independent CI jobs, Ubuntu 24.04 pin, Node 24-compatible action pins and checksum-verified Gitleaks CLI were subsequently pushed to GitHub before Verify run #4. Gitleaks scanned the full history without findings. The current oracle-review commit `f6fc040` was pushed, and Verify run #6 completed: static-checks, unit, property, PostgreSQL integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit and iPad WebKit succeeded; scenarios was cancelled at its 15-minute limit and required-checks failed. This was the scenario workload limit, not a cancellation from a later push. No release promotion or Replit deployment occurred.

### Push authorisation and current state — 13 October 2026

The earlier owner-authorised `GIT_URL` push was rejected for repository access or authentication (D39). The owner replaced it with a fine-grained `TURNSTONE_GITHUB_TOKEN`, scoped to this repository with Contents and Workflows read/write permission and a 90-day expiry (D40). The presence-only check returned `token present`; the token was used only through a one-off credential helper and was never displayed, inspected or persisted.

The five restored commits were pushed to `main` at `c39fc9899b6f31626c23b57012e192bae815d3aa`; `git fetch origin` confirmed `origin/main` matches. The remote and `.git/config` remain credential-free. GitHub Actions Verify run #2 for this commit completed successfully: static-checks, unit, property, integration, scenarios, audit, Lighthouse, iPhone WebKit, Pixel Chromium, iPad WebKit, desktop Chromium and required-checks all passed. Promote verified commit run #2 was skipped; no release promotion occurred.

The separate documentation commit `3f9a3326a327b6ab996f0cbc394d25106486a411` was pushed next. Verify run #3's scenarios job reached its configured 15-minute job limit and was cancelled before the later push; `cancel-in-progress` did not cause it. All other reported jobs passed; the required-checks aggregator failed because the scenarios job did not complete. Promote run #3 was skipped.

The visual-direction commit `2297844858932ab21d84f004e401cecbdced34c1` was then pushed separately. GitHub Actions Verify run #4 completed successfully: static-checks, unit, property, integration, scenarios, audit, Lighthouse, iPhone WebKit, Pixel Chromium, iPad WebKit, desktop Chromium and required-checks all passed. Promote run #4 was skipped and the `release` branch remains absent. The workflow mirror and drift-check files remain removed.

GitHub Actions Verify run #5 (`38434899856`, commit `011d4dc`) passed static checks, unit, property, integration, audit, Lighthouse and all four browser profiles. Its scenarios job was cancelled at its configured 15-minute limit, so the required-checks aggregator did not pass. Milestone 2 remains subject to the reviewer’s differential-oracle rework and a fresh green scenario run.

### Milestone 2 differential-oracle repair — 13 October 2026

The first full sample after the reviewer changes completed 2,567 games but reported 46 failures: 45 simulated-game mismatches and one golden outcome comparison. Reproducing those simulation seeds isolated two engine defects and one reference-model boundary omission: a second murder slot could reuse an already-consumed choice or invent a victim despite the configured `no murder` fallback; `DawnResolved` could announce later victims after an earlier removal had already reached parity/two-player finish; and the reference expected all selected victims instead of truncating its independently derived list at the terminal condition. The golden runner also treated a scenario assertion as an outcome field.

Under TDD, regression tests were observed failing for the repeated/invented murder and for the reference model's terminal-dawn list. The engine now resolves each slot from remaining picks and truncates announced victims at the first immediate win; the independent model applies the same written rules without importing engine decision logic. Golden assertions are separate from outcome expectations. All 45 previously failing simulation seeds now pass individually.

The fresh full local `pnpm run verify` passed on 13 October 2026: 149 unit tests, 20 property tests, PostgreSQL integration, scenario worker smoke, 2,567 engine games with zero failures, Pixel and desktop smoke tests, Lighthouse accessibility 100 on both routes, and zero high or critical audit findings. Local smoke explicitly printed `WebKit profiles run in CI`. Both managed services remain healthy; `/api/healthz` through the shared proxy returned HTTP 200. Commit `f6fc040` was pushed to `main`; Verify run #6 (`38448270800`) completed with static-checks, unit, property, integration, audit, Lighthouse, Pixel Chromium, desktop Chromium, iPhone WebKit and iPad WebKit green. The single scenario job hit its 15-minute limit, so required-checks failed. The TDD sharding tests first failed for the missing suite plan and CI matrix, then passed after implementation. Local verification confirms four distinct suites retain all 942 core cells, 788 three-way rows, 792 high-seat pairwise rows, 32 fuzz games and 13 goldens; no case was removed. Verify run #7 is pending after push. Remote and `.git/config` remain credential-free; no release promotion occurred.

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

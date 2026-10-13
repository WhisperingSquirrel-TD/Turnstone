# Progress

## Current status — Amendment 6

Section 24 and the owner's concluding directive are appended verbatim; earlier specification sections are unchanged. PLAN/DECISIONS/LAUNCH now reflect confirmed domains, primary passkeys, optional configured Google/Microsoft, removed providers, GitHub source/promotion/freezes and static-only Vercel builds.

Milestone 0 is **provisionally accepted by the owner**, pending its first fully green GitHub Actions Verify run with official iPhone/iPad WebKit. Milestone 1 has started under the owner's explicit browser-free exception. Historical “do not start the engine” notes below are superseded, not silently waived.

Repository configuration is written but no owner push, CI result, Vercel connection, production branch promotion, DNS change, Replit publish or paid service activation has been performed.

### Milestone 1 — in progress, not accepted

- Strict TDD: initial engine tests failed on absent exports; implementation made them green. Property testing initially failed on absent invariant checking, then passed after implementation. Entropy/domain tests failed on the absent adapter/config fields before implementation. New progress/minimum-time regression tests failed on departed-seat acknowledgements and prematurely closed private ballots, then passed after targeted fixes.
- Core shared settings/command/event/view schemas, injected-time/random pure decide/evolve, secure role deal/commitment, versioned replay, private acknowledgement/redeal, votes/reveal, shadow/protection, pause/resume, departures, sleeper precedence and endgame missing-vote behaviour are implemented/tested. A separate production adapter uses Node cryptographic randomness, never Math.random.
- Current targeted suite: 24 engine/property/pipeline/origin tests; 100 seeded property cases exercise varying 5–40 seat counts, valid Traitor counts, replay, explicit view keys and protected secret fields. A further regression failed because changing the selected sleeper left the commitment unchanged; the commitment now also binds that deal-time secret, disclosed only in the finished fairness view. This is **not** the full sweep/covering-array/scenario harness.
- C5 remains unresolved for task reports, penalties, missing answers and mid-cycle lifecycle. C6 records the conflict between guaranteed termination and repeated endgame no-banishment ties. Tasks-on start explicitly rejects pending rules; no invented task consequence or forced ending.
- Full Milestone 1 command/configuration variants and rejection coverage remain to finish after rules clarification; no universal termination, completed-Milestone-1, coverage threshold or full-game report is claimed.

### Delivery checks

Pipeline tests cover local explicit WebKit notice versus all-profile CI and freeze/tag validation. Full local `pnpm run verify` passed on 12 October 2026: application/test type checks, lint, formatting, built-production tests, 55 unit tests, 3 property tests, real PostgreSQL integration, 2 Pixel/desktop smoke tests with axe, Lighthouse accessibility 100 on both built routes, and audit 0 high/0 critical with no exceptions. It printed exactly `WebKit profiles run in CI`. The final sleeper-commitment regression then brought the unit count to 56; all affected application/test types, lint, formatting, unit and property checks were rerun and green. Browser/database/build/audit inputs were unchanged, so their passing checks remain valid. Both managed services restarted cleanly and are running; the public 320-pixel screenshot renders cleanly. Actual first CI success and duration remain unknown until the owner pushes; this local result does not finally accept Milestone 0 or complete Milestone 1.

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

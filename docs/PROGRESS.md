# Progress

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

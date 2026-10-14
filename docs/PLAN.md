# Delivery plan — complete specification

## Authority, approval and current status

`docs/SPEC.md` contains all seven supplied parts, with sections 1–19 in numerical order, followed by Amendments 1–10 as sections 20–27 and the owner hosting decision as section 28. Owner rulings on task timing, sleeper timing and termination are recorded in sections 5 and 22. Section 25 supersedes the previous light-palette decisions and section 2's light-public-site palette. Sections 20–28 add performance, positioning, task, branding, delivery, visual, real-phone entry, responsive public-site and single-origin hosting requirements. It is the binding source of requirements. Section references below point to it rather than duplicating changeable settings.

**Owner-approved, amended by §24–26 and all supplied rulings.** Milestones 0–4 are accepted by the owner’s reviewer/autopilot gate. Milestone 4's local `pnpm run verify` is green with 85.28% server line coverage, and public GitHub Verify #14 passed all 18 jobs with zero annotations. Game-scoped seat/coordinator capabilities, PIN lockout/reset and device recovery are implemented. Amendment 9 expands Milestone 5 to include the phone-first E1–E4 entry, optional-TV default, shared phone announcements, and the specified public-home subset. The Android CSRF failure was traced to a missing Vite development proxy; the preview now reaches the API without weakening CSRF. Local verify skips only WebKit with the exact notice “WebKit profiles run in CI”, retaining Pixel/desktop, axe, Lighthouse and all non-browser gates; CI runs all four browser profiles. C5, C6, D12–D19 and D43 are resolved as recorded in `DECISIONS.md`.

Section 24 is appended verbatim. Section 28 supersedes earlier hosting notes wherever they conflict: the intended host is a single Replit Reserved VM and API/socket paths are same-origin relative paths, not a build-time sibling origin. The owner pushes to the stated GitHub repository. Repository configurations do not mean a CI run has passed or a hosting service has been activated. No Replit publishing or paid services.

Stay on the free tier: no publishing, deployment or paid service activation. Runs must stay focused. Release-scale suites are planned, not run now; cost constraints never justify weakening a gate or claiming unrun checks passed.

## Working method and scope

- Strict TDD for every requirement: failing test first, confirm the intended failure, minimum implementation, refactor green; preserve tests with code. If test/spec conflict or ambiguity occurs, record it in `DECISIONS.md`, ask, and stop the affected work.
- Every milestone is sequentially gated by `pnpm run verify` plus its criteria in SPEC §19. Sample suites expand as their capabilities become available; do not mark an unimplemented suite passed.
- `[M]` is required; `[S]` is planned unless it threatens a Must, with any deferral explained in `DECISIONS.md`; `[C]` is not implemented until requested. Feature flags must not silently enable Could items.
- Keep a requirement-to-test traceability register using section/requirement IDs, planned milestone, failing-test evidence, implementation and acceptance evidence. Include all 40 numbered edge cases from §17.
- Maintain `PROGRESS.md` at each milestone; maintain decisions and scenario reports without copying authoritative configuration values into multiple sources.
- No mock authentication, fake provider connections, security bypasses, advisory exclusions, disabled tests or fabricated full-game success outside test code.

## Amendment 6 delivery and authentication mapping

- **Foundations/current delivery:** GitHub push-to-main verify on Ubuntu with official Chromium/WebKit system dependencies, pnpm/browser caches and a 15-minute job limit. Least-privilege jobs, full-SHA action pins and same-repository successful-main verification precede exact-commit promotion to release. Inclusive repository UTC freezes block promotion except the exact `[security]` commit-message tag. Measure actual runtime and obtain the first green CI run; local green is not final Milestone 0 acceptance.
- **Milestone 2:** Accepted by the reviewer. Preserve the independent event oracle, its five mutation checks, both engine regression defects, deterministic CI sharding and honest pending labels for unbuilt layers. Nightly full runs remain conditional on the configured workflow.
- **Milestone 4:** The accepted work tested the then-current configured-origin and sibling-domain topology, host-only cookies, explicit CORS/CSRF/CSP/socket origin checks and long-lived server portability. Section 28 now chooses one origin; retain those existing regression tests but add no further split-host or N-1 compatibility work.
- **Milestones 5/9:** Keep the player/app shell and prerendered public outputs static, served from the same Replit app as the game server after owner approval. Do not configure Vercel; API and socket paths are relative to the current origin. Complete the single-origin cache/security/header/budget checks before launch.
- **Milestone 8:** Primary coordinator passkeys with required user verification, no attestation, production RP ID derived from config, multiple credentials and no recovery bypass. Lost passkey means a new account; co-coordinator transfer preserves games. Players remain guests. Optional Google/Microsoft OIDC only with configured client IDs/required server secrets. Remove LinkedIn/Facebook/Apple and the Meta callback from the active scope. Resolve trusted admin allow-list binding for passkey-only accounts; never trust self-asserted email.
- **Milestone 10/LAUNCH:** Present the Reserved VM size, separate production `PIN_PEPPER`, 123-reg DNS, spend cap and seasonal capacity checklist from `docs/HOSTING.md`. Prove CI, full suites, real-device checks and launch safety before connecting a playable production release. No deployment, production secret or DNS change without explicit owner approval.

## Amendment 1 milestone mapping (SPEC §20)

Thresholds and exact wording stay authoritative in SPEC §20. Add automated size checks to `pnpm run verify` when each real route is introduced, not just at final hardening. The existing minimal foundation placeholders are not evidence of the later static-site/player-route budget gates.

| §20 item                                                                                                                 | Implementation milestone                                                           | Verification and evidence                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One domain; static public front door; Start/Join app links; direct join QR links; game-server-only API/socket traffic    | 4 routing/server boundary; 5 join paths; 9 static public site                      | Routing tests and game-server request counters prove public page/asset traffic is isolated; no infrastructure activation now                               |
| Public static prerendered HTML, JavaScript-off content, same-origin static serving and hashed-asset/HTML cache policies  | 9, then hosting checks after the M5 gate                                           | Raw HTML/header/cache tests; static output served with the Node app after separate owner approval; no separate Vercel/CDN deployment                       |
| Public page/JavaScript/image budgets, §25 self-hosted font pair, image format/lazy loading                               | 9, as each public route exists                                                     | Build-output size checks in verify, including shared imported assets rather than entry files alone; track the 80 KB total font budget separately           |
| Player first-load JavaScript/total budgets; §25 font pair only, no game images/third-party scripts; cached repeat visits | 5                                                                                  | Build dependency-graph/transfer-size checks in verify and network/cache assertions; preserve no-secret-cache requirements                                  |
| Coordinator/presenter/wizard/admin lazy chunks                                                                           | First route introduction: 5–6 for player/coordinator/wizard/presenter; 8 for admin | Per-route initial-load size checks in verify; assert these chunks are absent from player initial requests                                                  |
| Low-end Android/slow-4G usability target                                                                                 | 5 baseline, 10 full performance validation                                         | Measured cold/warm browser runs; record emulation conditions and eventual real-device evidence, not size alone                                             |
| Small typical views; no client polling; heartbeat frequency                                                              | 4 transport contracts; 5 client integration                                        | Payload-size tests, socket settings and no-polling assertions in verify; count requests/reconnect behaviour separately from server deadline polling        |
| PostgreSQL snapshot/recent events, optimistic command versions, pooled connections, released game memory                 | 4                                                                                  | Real database concurrency/restart/version tests; reduced-scale resource measurements in verify                                                             |
| No-extra-paid-service cross-instance socket adapter; lock-claimed deadlines; instance-independent requests               | 4 design and `[S]` multi-instance capability                                       | Two-process integration tests for cross-instance authorised views and exactly-once deadline effects; Redis requires separate owner approval                |
| Reduced-scale steady/fan-out/deal-spike/join-storm/static-isolation/soak capacity checks                                 | 4 as server capabilities exist; 5–9 as relevant routes/features land               | Bounded local tests in verify; document measured hardware, sample sizes, resource usage and labelled extrapolations in `CAPACITY.md`                       |
| Full steady load, fan-out, start-of-day spike, join storm, static throughput, long soak; players per CPU core/GB         | 10                                                                                 | Full target suites and measured `CAPACITY.md`; gated on owner's paid production VM/database decision, not run on the free tier or claimed by extrapolation |
| Admission control based on measured capacity; existing games/joins remain served                                         | 4 server policy; 5–6 user-facing busy response                                     | Verify boundary tests around the measured admission threshold and existing-game priority; do not guess a production capacity value                         |
| Advance scheduling and admin per-day load forecasts                                                                      | 3 plan data; 6 coordinator scheduling; 8 admin forecasts                           | Verify scheduled-game forecast calculations and UI behaviour; no aggregate report exposes unfinished secrets                                               |
| Peak-day change freezes; public status page `[S]`                                                                        | 8 admin freeze configuration; 9 status page; 10 release-safety checks              | Freeze enforcement/status tests as implemented; peak-day hosting only on separate approval; the game remains year-round                                    |

React is retained. If the actual route budget cannot be met, record measured options and ask before changing the framework. Reduced-scale checks use existing/free resources only and never claim proof of full production targets. Hosting/paid scale tests are pending owner decisions, not authorised work in this amendment.

## Task 0 — Finish and accept foundations

**References:** §1–4, §15–16, §18–19 and original Milestone 0 acceptance.

- [ ] Resolve the audit blockers without waiving findings; justify and exactly pin all direct dependencies used by the product/tooling, including inherited manifests that currently use ranges/catalog ranges.
- [ ] Reconcile baseline headers with §15, including the referrer-policy mismatch and production nonce/external-script behaviour; preserve secrecy and ask about conflicting tests before edits.
- [ ] Execute the four configured device smoke profiles, axe and Lighthouse on the minimal responsive home and `/play`, including 320 px and zoom. Confirm nonce headers on actual web/API responses and readiness failure on database/schema unavailability.
- [ ] Confirm strict TypeScript, ESLint/Prettier, Vitest/fast-check, Supertest, socket client, Playwright, axe and Lighthouse tooling; fail-fast secret configuration; PostgreSQL connection and committed development migration.
- [ ] Keep both verify commands honest: foundation verification can pass only its real implemented checks; full verification remains explicitly unavailable until the scenario harness exists.
- [ ] Review current infrastructure against the completed SPEC; update the documentation skeleton/status and resolve blocking decisions. Do not invent a game schema or rules.

**Exit:** The complete local `pnpm run verify` gate is green, and the owner has provisionally accepted Milestone 0. Final acceptance remains pending the first fully green GitHub Actions run, including iPhone and iPad WebKit.

## Task 1 — Pure game engine and shared parameter model

**References:** §3, §5–6, §8, §9–12, §17–19, §22.

- [x] Build the typed shared rule model, defaults, validation, constraints, recommendations and task settings needed by the pure engine. The later wizard consumes this source; the engine does not duplicate settings in UI copy.
- [x] Implement pure `decide`/`evolve`, injected clock and random source, neutral phases, pause overlay, engine-owned command outcomes, deterministic event replay and explicit event schemas. No I/O in the engine.
- [x] Implement role-deal commitment, acknowledgements/redeal, core votes and ties, shadow choices, protection, removals, sleeper precedence, win checks and bounded cycle/endgame transitions. C5/C6/D12/D13 owner rulings are resolved and tested.
- [x] Use `viewFor(viewer, state)` as the explicit allow-list projection, including legitimate Traitor knowledge and an announced all-seeing host. Tests preserve blind coordinator and unfinished-admin views.
- [x] Property-test core invariants, projection leakage, replay equality and termination with all seven named bot strategies. Engine command paths are tested; lobby/device recovery, full recruitment/powers, mission administration and account/admin command matrices remain in their assigned later milestones.
- [x] Include the §22 task parameter model and deterministic task/decoy assignment, deadline reporting, voiding, shared completion, cancellation, no-carry-over, sleeper assignment, and private disclosure contracts. The editable library and player/admin experiences remain in Task 7/8.
- [x] Test task replay/projection and departed-seat behavior; a uniform assignment/result event is recorded for each living player so hidden task roles do not change public event-version increments. Recruitment transitions and server/browser delivery remain in their later milestones.

**Exit:** Met locally: `pnpm run verify`, core property/no-leak/replay tests and the D13 termination property are green. Milestone 1 is complete and awaits owner review. Final-delivery coverage targets remain ≥95% engine lines and ≥90% branches.

## Task 2 — Full-game scenario harness

**References:** §7 example, every §17 edge case, §18, §22.

- [ ] Implement the seven specified bot behaviours, including an adversarial coordinator; deterministic seeds and minimal reproductions retained as regression tests.
- [ ] Sweep every supported seat count, every valid Traitor count and all formats. Generate constrained three-way coverage over all rule-affecting settings plus two-way coverage for 30–40 seats; verify coverage independently and record the generator choice.
- [ ] Add illegal-command/fault fuzzing and a separately written reference model comparing eliminations, winners and pot. Do not share engine decision/evolution logic with the reference.
- [ ] Create readable golden YAML complete-game scenarios: one per each of the 40 §17 cases, plus the §7 acceptance example and each format; at least 40 overall. Clearly mark future server/browser-dependent scenarios as pending until their milestones, never passed.
- [ ] After every game step check invariants, viewer leakage, private-moment contracts, replay, termination, non-negative pot and schedule exclusions.
- [ ] Replace the full-verifier placeholder with real reporting: games, combinations covered, timings, failing seeds and implemented-layer status. Expand to server/browser layers as Tasks 4–7 land.
- [ ] Extend constrained covering arrays and independent coverage checks to every rule-affecting Traitor-task setting/filter. Extend bots and the separate reference model for task completion/misses and consequences; retain task-off coverage.
- [ ] Add §22 golden scenarios for completion, a missed task cancelling a murder, banishment mid-task and a new recruit receiving a task. Check task delivery/reporting leakage, same-shaped decoys, replay and termination after each step; mark future UI/server layers pending until implemented, not passed.
- [x] Model D43's two equal hidden SHADOW choice windows for every role, one unanimous re-vote, one-Traitor automatic agreement and configured no-decision fallback. Add the golden split-after-re-vote case and have the independent oracle verify the exact fallback candidate set and selected seat. Exercise the fixed-window rule and termination across every bot strategy.

**Status:** Accepted by the owner’s reviewer. D43's fixed re-vote, exact random-candidate validation and fixed-window termination checks are implemented, with a golden split-after-re-vote case. The separate reference oracle checks event outcomes; five test-only engine faults (wrong tie-break, runner-up banishment, shielded murder, missed-task cancellation and parity threshold) are rejected by the oracle. The oracle-detected multi-murder and terminal-dawn engine defects remain guarded by permanent regression tests. The local sample passes with zero failures across 2,567 games after the reducer copy-on-write optimization. GitHub Verify #8, #9 and #13 passed, including all shards, four browser profiles and the exact 2,522-row coverage merger. The full 40-case §17 golden matrix and server/browser-dependent cases remain pending; pot validation remains pending Milestone 7.

**Exit:** Accepted. Local engine/scenario verification and the oracle mutation suite are green; Verify #8, #9 and #13 passed. Preserve the full §17 golden matrix and Milestone 7 pot check.

## Task 3 — Schedule planner and recommendation validation

**References:** §6–7, §17.

- [x] Produce Relaxed/Standard/Compressed estimates with predicted survivors and configuration warnings, observing blocked/quiet windows, leave times and the organiser's IANA time zone.
- [x] Implement elimination arithmetic, the odd banishment-only half-cycle, format durations and ordered compression. Relaxed extends debates and adds one mission only when it fits; no Seer or other Could item is offered. A recruitment-only night is not forced when its configured eligibility trigger is unknown; see D35.
- [x] Test the full §7 example; boundary seat counts/window lengths; insufficient/mostly-blocked windows; leave times, DST/time zones and early endgame.
- [x] Distinguish an estimated timetable from an actual game's earlier win/parity outcome. Return a clear error when no contiguous phase slot or full compressed plan fits.
- [x] Implement and test D19's single pre-launch privacy flag on web/API preview responses and `robots.txt`. No deployment.

**Exit:** Example, Quick and Multi-day planner tests pass; clear too-short/step-fit errors; local verify green. Met on 13 October 2026. Milestone 4 implementation is underway; full acceptance remains open as listed in Task 4.

## Task 4 — Persistent server, deadlines and realtime

**References:** §3–5, §9, §11, §15, §17–18, §20, §22.

- [x] Transactional append-only game events with sequence/version checks, snapshots and replay; committed migrations; durable UTC deadlines polled every second or approved pg-boss implementation.
- [x] HTTPS POST commands with idempotency and expected-version checks where required; boundary Zod validation; generic errors; no secret-bearing logs.
- [x] Authenticate coordinator capabilities independently from seat sessions; authorise logistics commands only; ensure coordinator views and sockets use the blind-coordinator allow-list. Issue a 256-bit game-scoped capability at CreateGame, store only its hash, and support single-use transfer to a co-coordinator.
- [x] Authenticate and origin-check sockets; server-only private-room joins; every response/pushed whole view built by the projection. Re-watch/reconnect receives a fresh whole view; browser pageshow/visibility refresh belongs to the player client in Task 5.
- [x] Implement guest invite/code approval, seat identity/PIN lockout/recovery, authorised device migration and single-use presenter pairing with game-scoped sessions. Bind account identity additively in Task 8; do not use test-only identity as a production substitute.
- [x] Add CSRF, origin restrictions, rate limits and route/event authorisation matrix; fake-clock deadline pause/shift/restart checks.
- [x] Run complete 5-seat and 40-seat games through real HTTP and private sockets; restart mid-game; exercise dropped sockets, duplicate/stale commands and a two-second connection stall; compare persisted events and every captured viewer projection.
- [x] Design for §20: any instance can serve commands/views from PostgreSQL snapshots/recent events; every command has optimistic version checks; bounded connection pools and released finished-game memory; no authoritative instance-only state.
- [x] Claim durable deadlines using `FOR UPDATE SKIP LOCKED` and transactional completion/idempotency; test competing schedulers and crash/reclaim behaviour. Separate database deadline polling from the prohibited client polling loops.
- [x] Add a no-extra-paid-service cross-instance Socket.IO adapter (evaluate PostgreSQL), private-room isolation and cross-instance pushes; multi-instance support is `[S]`, no longer out of scope. Redis remains unapproved.
- [x] Implement admission control for new games only, preserving join/play traffic for existing games. Add typical-view payload and reduced-scale realtime checks to verify; begin `CAPACITY.md` with measured results and explicit extrapolation limits.
- [x] Make the production API/socket/scheduler a portable long-lived Node process, with standard environment configuration/PostgreSQL and no Replit-only runtime dependency. Validate the configured sibling API origin with host-only cookies, CSRF, credentialed exact-origin CORS, socket-origin checks and the static CSP; same-origin remains available through `'self'`. Do not broaden allow-lists or expose secrets.
- [x] Test static-host app/API separation, sibling-origin credentialed HTTP/socket operation and independent server startup without a static host. Document always-on startup/migrations/configuration; this portability work authorises no hosting, containers in this workspace, publishing or paid plan.

**Exit:** Coordinator capabilities and transfer are covered by the authorization/no-leak matrix; full-stack restart/fault games and integration no-leak are green; `pnpm run verify` passes with server line coverage ≥85%; push and public GitHub CI are green. Met 14 October 2026 with local verify and GitHub Verify #14; continue to Task 5 without pausing for review.

## Task 5 — Player entry, journeys, privacy shield and app mode

**References:** §2–3, §9–10, §12, §16–18, §20, §22–23, §25–26.

- [x] Fix and regression-test the mobile CSRF failure: development uses the shared same-origin `/api` service path, and no CSRF cookie, origin, or token check is weakened. Pixel, desktop, iPhone and iPad E2E verify the JSON response, cookie attributes, matching double-submit token, no banner and enabled join/rehearsal actions, including regression coverage for the old path; plain recovery guidance appears on real failures. GitHub Verify #21 passed.
- [x] §27 complete locally and in GitHub Verify #21: use the dark outlined Stackstone mark and test every fill against its actual background; remove hero/demo glow edges with Playwright screenshot checks at 320/390/768/1280 px; verify layout, tap targets and safe areas at 320/375/390/414/768 px and mobile Lighthouse scores ≥95; add the three exact FAQs and answers to `/faq`, `/compare`, `llms.txt` and FAQPage JSON-LD; maintain `docs/CLAIMS.md` with owner-supplied dated sources and a pre-launch recheck/removal check.
- [ ] Implement the E1 title card, E2 one-question-per-screen join flow, E3 minimal CreateGame organiser flow/lobby, and E4 solo rehearsal settings as specified in §26. E1 has no form fields; E2 accepts code paste/autofill and skips it when supplied by a join link; E3 seats the organiser as a player; E4 offers 6–15 seats, Fast/Normal and first name only, with no user PIN.
- [ ] Make the presenter optional and off by default. Every public moment is rendered from shared public data on each phone with identical wording/layout; a complete golden scenario and a real-server/browser rehearsal must finish with zero presenter connections. Any narration is optional and runs only on the organiser’s phone.
- [ ] Generate a lobby QR and six-character code, provide Web Share with clipboard fallback, display incoming requests with Approve actions, and start only when the organiser confirms. Default to the standard configuration; planner, themes and advanced controls remain in Task 6.
- [x] Bring forward only the specified public-home subset from Task 9: prerendered answer-first content, four steps, formats, exact §21 FAQ questions/facts, the exact §26 title tag and WebApplication/Game JSON-LD. Preserve noindex on every route while pre-launch is on; the rest of the agent package remains Task 9. Local tests and GitHub Verify #21 pass.
- [ ] Joining/lobby/device-check/recovery, paired and pass-and-play seats, departure/late-join paths, voting/shadow/decoys and ghost participation with real server views.
- [ ] Rehearsal: one real player on a phone, bots filling the remaining seats, fast timers, and every bot action sent through the real HTTP/socket server using the real engine rules.
- [ ] Shield/countdown/acknowledgement/hold pad, fetch-on-hold, deliberate confirmation, immediate DOM/memory clearing on every specified interruption and per-hold timeout. Tap and screen-reader equivalents; all private screens uniform in layout, option count, text band, timing, sounds/vibration.
- [ ] Assign Faithful decoy instructions randomly from a pool whose text-length distribution matches the Traitor task library. Extend the browser uniformity suite to compare task/decoy text-length bands across role cohorts and randomized assignments.
- [ ] Use server-offset countdowns; role-uniform offline UI; idempotent retry/resync; wake lock fallback, safe areas, zoom, target sizes and reduced motion.
- [ ] Implement standalone manifest/icons/iOS tags, install guidance, Android full-screen, app back/refresh, iPhone hand-off/rejoin and static-only service-worker caching. No native app.
- [ ] Test iPhone WebKit, Pixel Chromium and iPad WebKit in browser and installed-display contexts; DOM/storage/URL/title/cache leakage, uniform bounding boxes/colours/element counts and minimum duration; axe on every screen. For shadow choices, include every other living seat (including fellow Traitors) with identical count and styling; never hide, disable or restyle targets by role. Verify a friendly-fire choice uses the same confirmation layout before the private “choose someone else” response.
- [ ] Plan opt-in generic Web Push `[S]` with no email/SMS; only activate a service if it meets the free-tier constraint and receives any required approval.
- [ ] Enforce §20's tighter player first-load/total budgets with build-output checks in verify once the real player route exists; split non-player routes, prohibit game images/fonts/third-party scripts, cache only safe static assets and measure low-end/slow-4G usability.
- [ ] Verify no client polling, bounded typical view sizes and heartbeat cadence against server contracts; add route-relevant reduced-scale fan-out/admission checks without weakening privacy uniformity.
- [ ] Build the app shell to portable pure static output, independent of the game server. Use validated configurable API/socket origins rather than hard-coded Replit domains/runtime helpers; test same-origin and sibling-subdomain deployments with secure credentials, CSRF, reconnect, hold-to-reveal and installed-app/rejoin behaviour. Static caches still never contain API responses or secrets.
- [ ] From Milestone 5, build one reusable Stackstone mark/layout for every public/player/coordinator/presenter/admin screen as those routes arrive. Use an inline SVG under §23's size limit with identical role-neutral position, size and colour; respect safe areas and never overlap hold pads, countdowns or controls. Test computed geometry/colour, SVG size, narrow/zoomed/installed layouts and private-moment uniformity.
- [ ] From Milestone 5, extend the existing confirmed identity config to product logo/domain/social links. Add a failing-on-hard-coded-product-name test and sentinel rename test to verify; cover every later route, metadata, manifests, agent/facts surfaces and links. The owner's Amendment 5 name is already set in that config; further renames need one config change, not scattered edits. No deployment authorised.
- [ ] Enforce Amendment 5's replacement link policy: every screen's Stackstone logo links to the configured organisation URL. Public pages use the same tab; game/coordinator/presenter screens use a new tab with `rel="noopener noreferrer"`; installed-app mode opens the system browser. Test navigation, game continuity, role-identical geometry/colour and no overlap with holds/countdowns/controls. The former mid-game-link prohibition is superseded.
- [ ] Apply §25's charcoal/hearth/stone palette and Playfair Display/DM Sans hierarchy to player screens. Self-host the subsetted Latin WOFF2 pair and SIL licences within the separate 80 KB budget; preload during lobby/device check, use immutable caching and size-adjusted fallbacks, and prevent font shifts during private holds. Keep the role-uniform mark and private-screen geometry.
- [ ] Capture the E1–E4 and complete rehearsal journeys with Playwright on iPhone WebKit, Pixel Chromium and iPad WebKit; save the actual screenshots under `docs/screens/` for reviewer inspection before the owner’s real-phone test.

**Exit:** Device journeys in both modes, E1–E4, no-presenter rehearsal, shared announcements, uniformity, brand geometry/link policy, public-home subset and single-source rename tests green; `pnpm run verify` and public GitHub CI green. Save screenshots in `docs/screens/`, then stop for the owner to play a full rehearsal on a real phone using the Replit development URL, with pre-launch noindex still enabled. Do not continue to Task 6 until that hands-on review.

## Task 6 — Blind coordinator console and public presenter

**References:** §3, §9, §11, §16–18, §25.

- [ ] Phone-first logistics, count-only private progress, public logs, extension/pause/resume/shift, seat management, PIN reset approvals, co-coordinator rights and early-end confirmation.
- [ ] Safe undo window only when no private information was released; offline takeover/co-coordinator prompting and majority approval.
- [ ] Paired `/tv` public view, QR/lobby/timetable/countdowns, private warnings, vote reveals, mission/pot/endgame/reveal displays, text-mirrored narration and sound consent.
- [ ] Use the shared §25 palette and typography on coordinator and presenter screens; preserve role-neutral styling and room-readable type.
- [ ] Keyboard, large-screen readability, wake-lock fallback and reduced-motion tests; adversarial coordinator/presenter payload and route checks.
- [ ] Keep coordinator, presenter and wizard separately lazy-loaded, add initial-load size checks when each route exists, and connect advance scheduling/busy messaging to the measured-capacity server policy.

**Exit:** Journeys, takeover and schedule shifts pass; no secret disclosure; verify green.

## Task 7 — Complete game features and rehearsal

**References:** §5–8, §11–12, §17–18, §22.

- [ ] At least 24 original admin-editable missions with all required fields and accessibility/category coverage; custom missions; result/pot validation and display-only units.
- [ ] Public/secret shields and permitted allocation paths; recruitment/offer/ultimatum, sleeper `[S]`, endgame voting/results and full fairness reveal. Never enable Could powers automatically.
- [ ] Awards `[S]`, ghost features and private chat entitlements; new recruits see Traitor chat only from acceptance.
- [ ] Participant-only recap, first-name share image, no indexing, attribution and consent-aware Stackstone calls to action.
- [ ] Extend the Milestone 5 rehearsal into the complete-game practice and public-demo flows, using real engine rules and bots. Include in-app quiz/poll missions `[S]` unless explicitly deferred to protect a Must.
- [ ] Complete all golden cases, engine/full-stack scenarios and browser complete games; test votes/recruitment/shield choices only reveal when entitled.
- [ ] Deliver §22's coordinator task toggle/settings/filters, at least 40 original safe/legal/kind tasks as tagged admin-editable reference data, and offensive-filtered coordinator additions. Cover setting, minimum age, accessibility and difficulty; review every task against all stated safety prohibitions. Integrate task-reference controls into existing Task 8 administration, not a secret-reading admin route.
- [ ] Deliver tasks at each cycle's first private moment with same-shaped non-Traitor decoys; at the next shadow show the identical “Anything to report?” interaction to every living player. Record done/missed by honour system, share only entitled reports in Traitor chat and apply the resolved missed-task consequence. No automatic social-spotting mechanic.
- [ ] Reveal task history only at final reveal/recap and award “smoothest operator” for most completed; preserve participant-only recap defaults. Complete all four task golden scenarios, delivery/reporting no-leak/uniformity/browser tests, mid-task elimination and recruitment cases.

**Exit:** All golden scenarios pass; no-leak/uniformity and verify green.

## Task 8 — Passkeys, optional providers, account lifecycle and administrator

**References:** §2, §13, §15, §18–19, §25, overridden by §24.

- [ ] Select/pin/record a maintained WebAuthn library; primary coordinator passkeys, required user verification, no attestation, configured RP ID, multiple passkeys, and no lost-passkey recovery bypass. Players remain guests; games survive account loss through co-coordinator transfer.
- [ ] Add Google/Microsoft OIDC `[S]` only when configured; hide unconfigured providers, require complete server credentials when enabled, and never mock sign-in outside tests. LinkedIn/Facebook/Apple and the Meta deletion callback are removed, not deferred.
- [ ] PKCE/state/nonce/redirect/token checks; PostgreSQL session rotation/sliding expiry/all-device logout; host-only secure cookies; no automatic email merging; deliberate verified provider linking.
- [ ] Account/history/consent preferences, data export, deletion/anonymisation and delayed hard deletion; age confirmation and guest/paired alternatives.
- [ ] Test WebAuthn challenge/origin/RP ID/user-verification/replay/credential ownership and hostile optional OIDC responses with test-only authenticators/providers.
- [ ] Resolve trusted admin identity binding for passkey-only accounts before authorisation tests: a self-asserted email cannot confer privileges. Implement audited user/reference management, aggregate usage, consent-only lead CSV, health/freeze controls; unfinished secrets remain inaccessible.
- [ ] Keep admin code in its own lazy chunk with verify size checks; calculate per-day load forecasts from scheduled games and configure peak-day change freezes without exposing hidden state.
- [ ] Apply the shared §25 palette and font tokens to account and admin screens; keep the Stackstone mark role-neutral.

**Exit:** Passkey, configured optional-provider, account and admin security tests green; admins cannot see live secrets; verify green. No removed-provider callback or developer-programme dependency.

## Task 9 — Public website and agent-readable content

**References:** §2, §14–16, §20–23, §25.

- [ ] Deliver every §14 public page as meaningful prerendered HTML with JavaScript off; original UK English copy; required legal/accessibility templates marked for solicitor review.
- [ ] Include §27's `/compare` page categories and exact additional FAQs; retain the shared locale source for `/`, `/faq`, `/compare`, `llms.txt` and FAQPage JSON-LD. Keep `docs/CLAIMS.md` as the pre-launch evidence/recheck record.
- [ ] Apply Milestone 5's shared Stackstone mark/config/rename checks to every public page. Add §23's exact independence statement to the footer and `/about`, substituting the configured APP_NAME; name no TV programme. Test raw prerendered HTML, renamed output and Amendment 5's context-specific link behaviour.
- [ ] Keep D19's pre-launch flag as the single switch for public crawler policy. The §14 robots, sitemap and llms.txt allow-list applies only after the owner declares launch and the flag is turned off.
- [ ] Use the confirmed tagline/byline and organisation name/site/Abingdon, Oxfordshire details from the shared config in sales copy, structured data and `/about`; do not invent an address, social handles or production domain.
- [ ] Maintain the existing `docs/NAMING.md` `[S]`: owner-confirmed choice/date, owner-reported preliminary web search, and pending owner trade mark/domain/handle checks. Add dated evidence as supplied, not fabricated clearance or paid registrations.
- [ ] Apply §21's exact lead message and everyone-plays/even-the-host positioning; explain the full original game loop, phones as the private channel and narrated TV. Render the required proof points across sales/agent surfaces only when the claims gate permits them.
- [ ] Add `/compare`, `/large-groups` and `/no-host`, each opening with a one-paragraph direct answer. Compare only the specified categories and ours, never competitor brands/products; preserve §20 static/JavaScript-off and budget requirements.
- [ ] Store all eight §21 FAQ questions verbatim in one keyed content source; mirror them on `/faq`, in `llms.txt` and FAQPage structured data. Test exact wording and cross-surface equality.
- [ ] Add the interactive `/formats` “Plan a game” form with players/start/end/blocked times, a real timetable from the same planner used by the public API, and a pre-filled create-wizard link. Test planner/API/form consistency, validation and human sign-in/confirmation; preserve static content and §20's public JavaScript budget.
- [ ] Render one shared facts record (players, duration, devices, price, privacy, builder) identically on home, `/faq`, `/llms.txt`, JSON-LD and `/api/public/v1/facts`. Test all five representations against the source and claims eligibility, never maintain separate hand-written copies.
- [ ] Use §21's ordinary game vocabulary. Scan copy, metadata, alt text, URLs, structured data and configured domain against forbidden TV branding and official/inspired-by claims; exceptions require explicit owner-confirmed legal sign-off.
- [ ] Bind public capacity/privacy/fairness claims to recorded passing tests. Until evidence exists, publish design intent without numbers; test that unverified or stale evidence cannot silently enable numeric/proven claims on HTML, agent or facts surfaces.
- [ ] Serve public page output as static files only, isolated from the game server, with same-domain Start/Join/direct-join routing and §20 cache policies. No Node/per-page public rendering.
- [ ] Produce portable pure static public-site/app-shell artifacts deployable independently to any CDN, including a potential Vercel front end. Test static-only serving and configured same-origin/sibling-subdomain API/socket wiring; preserve §20 traffic isolation/cache/size checks, CSP policy approval and §21 claims gates. No actual hosting activation.
- [ ] Add public page, JavaScript, image-format/size/lazy-load and §25 font budget checks to verify as each route exists. Self-host and preload the font pair; keep its separate 80 KB budget outside the §20 page and JavaScript limits. Add a public status page `[S]` and reduced-scale static-throughput/game-server-isolation checks.
- [ ] Contact/team-building enquiry persistence with consent, honeypot and rate limits; no email sending or personal data in public APIs.
- [ ] Config-driven crawler policy, robots/sitemap, canonical/social metadata, validated structured data, `llms.txt`/full text, Markdown alternates and content negotiation.
- [ ] Versioned GET-only public facts/rules/planner/missions API with permitted CORS; OpenAPI links; pre-filled wizard hand-off requiring human sign-in/confirmation, never agent-created live games.
- [ ] Private game/coordinator/presenter/recap/account routes send noindex/nofollow and stay out of sitemap/caches. Plan aggregate crawler counts and IndexNow `[S]` without deploying or guessing a production domain.
- [ ] Test raw HTML/content variants/contracts and §14 Lighthouse/performance budgets, applying §20's stricter client/public size budgets instead of the conflicting §16 initial-bundle limit.

**Exit:** Public-site/Lighthouse budget tests, new sales pages, exact FAQ mirroring, shared facts, real public planner and agent links/hand-offs pass; shared branding/rename, exact independence statement, trademark and evidence-based claims checks green; verify green. Naming-record Should completed or explicitly deferred. MCP remains Could, not part of this task.

## Task 10 — Hardening, privacy and release evidence

**References:** §15–20.

- [ ] ASVS level 2 security review and adversarial authorisation/no-leak checks; DPIA recommendation, lawful-basis/retention inventory and solicitor-review templates; offence controls and children's guest protections.
- [ ] WCAG 2.2 AA manual audit, VoiceOver/TalkBack and real supported browsers/devices in browser/installed modes; lock/unlock, battery saver, casting and a five-person-or-larger playtest.
- [ ] Capacity `[M]`: implement every full steady/fan-out/deal-spike/join-storm/static-throughput/long-soak target in §20 and report measured players per CPU core/GB in `CAPACITY.md`. §20 replaces the conflicting §18 smaller load target; reduced tests remain in verify. Full-volume execution requires the owner's paid VM/database decision and is not authorised on the free tier.
- [ ] Retain non-conflicting §18 chaos/clock-change scenarios `[S]` and mutation `[S]` (Stryker engine score ≥80%); distinguish those from §20's required long capacity soak.
- [ ] Validate measured-capacity admission thresholds, existing-game priority, peak-day forecasts/freezes, client performance and public/game traffic isolation. Label any unrun full capacity target pending, never passed from extrapolation.
- [ ] Versioned event upgraders and safe-deploy replay of every in-progress game; reject differences, enforce admin change freezes/security-fix exceptions and feature flags. Test safe-deploy without performing a deployment.
- [ ] Finish README setup/secrets/running-a-game/deployment guidance and LAUNCH checklist. Meet coverage and scenario volumes below; every Must has a test that fails without it.
- [ ] Record every Should as completed or explicitly deferred with consequence/reason. No high/critical audit findings.

**Exit:** Real `pnpm run verify:full` green, coverage met, full §20 capacity evidence measured on owner-approved resources, all Musts done and Shoulds done or recorded as deferred. Unrun paid-resource capacity targets block launch. Free-tier/no-deployment instruction still applies; release readiness is not permission to publish.

## Task 11 — Could-haves only on explicit request

**References:** §8, §14–15, §19, §22.

MCP server, in-person murder, seer, double vote and encryption at rest remain off/unbuilt. Each requested feature needs scope, its own failing tests, scenario-model/covering-array updates and security review. Any schedule extension suggesting a Could feature must not enable it without owner approval.

All-Vercel hosting is `[C]`, not the Must split-host portability architecture. Do not build it now; revisit current WebSocket/fan-out/scheduler limits only when generally available and explicitly requested. Hosting/paid plans remain owner decisions.

## Verification volumes and evidence (SPEC §18)

| Suite                      | `pnpm run verify` sample                                     | `pnpm run verify:full`                                          |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Exhaustive core sweep      | 1 complete game per cell                                     | At least 20 per cell                                            |
| Constrained covering array | 1 complete game per 3-way row                                | At least 50 per row                                             |
| High-seat covering array   | 1 complete game per 2-way row                                | At least 50 per row                                             |
| Fault fuzzing              | 32 deterministic games                                       | 100,000 fuzzed games                                            |
| Real HTTP/socket games     | 3 full-stack games                                           | 20 full-stack games                                             |
| Browser engines            | Device smoke tests                                           | Complete games on every profile, browser and installed modes    |
| Route sizes (§20)          | Automated checks as each real client/public route exists     | Same hard budgets plus full network/performance evidence        |
| Capacity (§20)             | Bounded reduced-scale checks as relevant server/routes exist | Full target suites in Task 10, only on owner-approved resources |

Every suite checks its invariants, leakage, replay and termination after each step. Reports include coverage evidence, timings and failing seeds/reproductions. Browser/full-stack scenarios are added at their relevant milestones, not falsely claimed at Task 2. No production deployment before full-volume success and all release criteria; currently no deployment at all.

The fast verification sample runs every generated coverage row once; the repeated/full volumes remain reserved for `verify:full`, per decision D32.

## Retained workspace mapping

| Specification location          | Actual template location                              |
| ------------------------------- | ----------------------------------------------------- |
| `packages/engine`               | `lib/engine`                                          |
| `packages/shared`               | `lib/shared`                                          |
| `apps/server`                   | `artifacts/api-server`                                |
| `apps/web`                      | `artifacts/party-game`                                |
| Database/schema/migrations      | `lib/db`                                              |
| API contract/generated types    | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` |
| Cross-service response security | `lib/security`                                        |
| Browser tests and documentation | `e2e/`, `docs/`                                       |

Use pnpm wherever SPEC mentions npm. Keep the existing workspace and artifact-managed services. Resolve the open choices in `DECISIONS.md` before their affected tasks; do not change the verbatim SPEC to resolve them.

# Delivery plan — complete specification

## Authority, approval and current status

`docs/SPEC.md` now contains all seven supplied parts, with sections 1–19 in numerical order and their text unchanged. It is the binding source of requirements. Section references below point to it rather than duplicating changeable settings.

**Awaiting owner approval. Do not start Milestone 1.** Approval alone does not waive Milestone 0's verification gate or unresolved rule conflicts. No implementation, dependency changes, testing runs or deployment are authorised by this document update.

Milestone 0 is implemented in part but **not accepted**: the last recorded type, lint, formatting, unit, property and PostgreSQL integration checks passed; four-device Playwright/axe and Lighthouse execution remain unproven; the last audit had five high advisories and no critical advisories. This update does not rerun or replace that evidence. Resolve the issues and obtain a genuinely green `pnpm run verify` before progression.

Stay on the free tier: no publishing, deployment or paid service activation. Runs must stay focused. Release-scale suites are planned, not run now; cost constraints never justify weakening a gate or claiming unrun checks passed.

## Working method and scope

- Strict TDD for every requirement: failing test first, confirm the intended failure, minimum implementation, refactor green; preserve tests with code. If test/spec conflict or ambiguity occurs, record it in `DECISIONS.md`, ask, and stop the affected work.
- Every milestone is sequentially gated by `pnpm run verify` plus its criteria in SPEC §19. Sample suites expand as their capabilities become available; do not mark an unimplemented suite passed.
- `[M]` is required; `[S]` is planned unless it threatens a Must, with any deferral explained in `DECISIONS.md`; `[C]` is not implemented until requested. Feature flags must not silently enable Could items.
- Keep a requirement-to-test traceability register using section/requirement IDs, planned milestone, failing-test evidence, implementation and acceptance evidence. Include all 40 numbered edge cases from §17.
- Maintain `PROGRESS.md` at each milestone; maintain decisions and scenario reports without copying authoritative configuration values into multiple sources.
- No mock authentication, fake provider connections, security bypasses, advisory exclusions, disabled tests or fabricated full-game success outside test code.

## Task 0 — Finish and accept foundations

**References:** §1–4, §15–16, §18–19 and original Milestone 0 acceptance.

- [ ] Resolve the audit blockers without waiving findings; justify and exactly pin all direct dependencies used by the product/tooling, including inherited manifests that currently use ranges/catalog ranges.
- [ ] Reconcile baseline headers with §15, including the referrer-policy mismatch and production nonce/external-script behaviour; preserve secrecy and ask about conflicting tests before edits.
- [ ] Execute the four configured device smoke profiles, axe and Lighthouse on the minimal responsive home and `/play`, including 320 px and zoom. Confirm nonce headers on actual web/API responses and readiness failure on database/schema unavailability.
- [ ] Confirm strict TypeScript, ESLint/Prettier, Vitest/fast-check, Supertest, socket client, Playwright, axe and Lighthouse tooling; fail-fast secret configuration; PostgreSQL connection and committed development migration.
- [ ] Keep both verify commands honest: foundation verification can pass only its real implemented checks; full verification remains explicitly unavailable until the scenario harness exists.
- [ ] Review current infrastructure against the completed SPEC; update the documentation skeleton/status and resolve blocking decisions. Do not invent a game schema or rules.

**Exit:** Fully green `pnpm run verify` and owner-approved PLAN, with recorded evidence. Currently blocked, not completed.

## Task 1 — Pure game engine and shared parameter model

**References:** §3, §5–6, §8, §9–12, §17–19.

- [ ] Build one typed, validated rule-setting model shared by wizard and tests, with defaults, constraints, recommendations and invalid-combination explanations from §6. Keep reference data editable later without copying it into UI strings.
- [ ] Implement pure `decide`, `evolve`, injected clock/random source, neutral phases, pause overlay, legal commands/rejections, event replay and schema versioning. No database/network I/O in the engine.
- [ ] Implement deal/commitment events, acknowledgements and re-deal constraints; voting/ties, shadow choices/decoys, eligibility/protection, eliminations/departures, win/endgame checks and bounded progression. Resolve rule ambiguities first.
- [ ] Establish `viewFor(viewer, state)` as the single explicit allow-list projection for every viewer type, including announced non-playing host and configured spectator entitlements. Preserve blind coordinator/admin behaviour.
- [ ] Cover every command's success and rejection with tests; property-test §5 invariants, no-leak, replay equality and a defined termination bound. Add transition contracts for features completed in Task 7 without pretending they are finished.

**Exit:** Property, no-leak and replay tests green plus verify. Engine coverage target at final delivery: ≥95% lines, ≥90% branches.

## Task 2 — Full-game scenario harness

**References:** §7 example, every §17 edge case, §18.

- [ ] Implement the seven specified bot behaviours, including an adversarial coordinator; deterministic seeds and minimal reproductions retained as regression tests.
- [ ] Sweep every supported seat count, every valid Traitor count and all formats. Generate constrained three-way coverage over all rule-affecting settings plus two-way coverage for 30–40 seats; verify coverage independently and record the generator choice.
- [ ] Add illegal-command/fault fuzzing and a separately written reference model comparing eliminations, winners and pot. Do not share engine decision/evolution logic with the reference.
- [ ] Create readable golden YAML complete-game scenarios: one per each of the 40 §17 cases, plus the §7 acceptance example and each format; at least 40 overall. Clearly mark future server/browser-dependent scenarios as pending until their milestones, never passed.
- [ ] After every game step check invariants, viewer leakage, private-moment contracts, replay, termination, non-negative pot and schedule exclusions.
- [ ] Replace the full-verifier placeholder with real reporting: games, combinations covered, timings, failing seeds and implemented-layer status. Expand to server/browser layers as Tasks 4–7 land.

**Exit:** First genuine `SCENARIO_REPORT.md` with zero failures in implemented suites and transparent pending layers; verify green. Future-layer requirements remain release gates.

## Task 3 — Schedule planner and recommendation validation

**References:** §6–7, §17.

- [ ] Produce editable Relaxed/Standard/Compressed plans with predicted survivors and warnings, observing blocked/quiet windows, leave times and UTC/local-time handling.
- [ ] Implement elimination arithmetic, odd half-cycle, duration defaults and ordered compression/extension exactly as §7, subject to resolved Could-feature and player-count constraints.
- [ ] Test the full §7 example; boundary seat counts/window lengths; insufficient/mostly-blocked windows; leave times, clock changes, time zones and early endgame.
- [ ] Distinguish an estimated timetable from an actual game's earlier win/parity outcome. Report a clear minimum-time error when no valid plan fits.

**Exit:** Example, Quick and Multi-day planner tests pass; clear too-short error; verify green.

## Task 4 — Persistent server, deadlines and realtime

**References:** §3–5, §9, §11, §15, §17–18.

- [ ] Transactional append-only game events with sequence/version checks, snapshots and replay; committed migrations; durable UTC deadlines polled every second or approved pg-boss implementation.
- [ ] HTTPS POST commands with idempotency and expected-version checks where required; boundary Zod validation; generic errors; no secret-bearing logs.
- [ ] Authenticate/origin-check sockets; server-only private-room joins; every response/pushed whole view built by the projection. Re-fetch on reconnect/pageshow/visibility restoration.
- [ ] Implement guest invite/code approval, seat identity/PIN lockout/recovery, authorised device migration and presenter pairing with real security, not placeholder sessions. Coordinator sign-in production journeys remain unavailable until Task 8's providers exist; isolated identities belong only in test code.
- [ ] Add CSRF, origin restrictions, rate limits and route/event authorisation matrix; fake-clock deadline pause/shift/restart checks.
- [ ] Run complete games through real HTTP/sockets with 5–40 clients; mid-game restart; dropped sockets, duplicate/reordered commands and two-second latency; capture payloads for no-leak.

**Exit:** Full-stack restart/fault games and integration no-leak green; verify green. Final server line coverage ≥85%.

## Task 5 — Player journeys, privacy shield and website app mode

**References:** §3, §9–10, §12, §16–18.

- [ ] Joining/lobby/device-check/recovery, paired and pass-and-play seats, departure/late-join paths, voting/shadow/decoys and ghost participation with real server views.
- [ ] Shield/countdown/acknowledgement/hold pad, fetch-on-hold, deliberate confirmation, immediate DOM/memory clearing on every specified interruption and per-hold timeout. Tap and screen-reader equivalents; all private screens uniform in layout, option count, text band, timing, sounds/vibration.
- [ ] Use server-offset countdowns; role-uniform offline UI; idempotent retry/resync; wake lock fallback, safe areas, zoom, target sizes and reduced motion.
- [ ] Implement standalone manifest/icons/iOS tags, install guidance, Android full-screen, app back/refresh, iPhone hand-off/rejoin and static-only service-worker caching. No native app.
- [ ] Test iPhone WebKit, Pixel Chromium and iPad WebKit in browser and installed-display contexts; DOM/storage/URL/title/cache leakage, uniform bounding boxes/colours/element counts and minimum duration; axe on every screen.
- [ ] Plan opt-in generic Web Push `[S]` with no email/SMS; only activate a service if it meets the free-tier constraint and receives any required approval.

**Exit:** Device journeys in both modes and uniformity suite green; verify green. Real installed-mode device checks remain required in Task 10.

## Task 6 — Blind coordinator console and public presenter

**References:** §3, §9, §11, §16–18.

- [ ] Phone-first logistics, count-only private progress, public logs, extension/pause/resume/shift, seat management, PIN reset approvals, co-coordinator rights and early-end confirmation.
- [ ] Safe undo window only when no private information was released; offline takeover/co-coordinator prompting and majority approval.
- [ ] Paired `/tv` public view, QR/lobby/timetable/countdowns, private warnings, vote reveals, mission/pot/endgame/reveal displays, text-mirrored narration and sound consent.
- [ ] Keyboard, large-screen readability, wake-lock fallback and reduced-motion tests; adversarial coordinator/presenter payload and route checks.

**Exit:** Journeys, takeover and schedule shifts pass; no secret disclosure; verify green.

## Task 7 — Complete game features and rehearsal

**References:** §5–8, §11–12, §17–18.

- [ ] At least 24 original admin-editable missions with all required fields and accessibility/category coverage; custom missions; result/pot validation and display-only units.
- [ ] Public/secret shields and permitted allocation paths; recruitment/offer/ultimatum, sleeper `[S]`, endgame voting/results and full fairness reveal. Never enable Could powers automatically.
- [ ] Awards `[S]`, ghost features and private chat entitlements; new recruits see Traitor chat only from acceptance.
- [ ] Participant-only recap, first-name share image, no indexing, attribution and consent-aware Stackstone calls to action.
- [ ] Rehearsal/public demo using real engine rules and bots. Include in-app quiz/poll missions `[S]` unless explicitly deferred to protect a Must.
- [ ] Complete all golden cases, engine/full-stack scenarios and browser complete games; test votes/recruitment/shield choices only reveal when entitled.

**Exit:** All golden scenarios pass; no-leak/uniformity and verify green.

## Task 8 — Providers, account lifecycle and administrator

**References:** §2, §13, §15, §18–19.

- [ ] Select/record a maintained real OIDC/OAuth approach against the provider/session requirements. Connect Google, LinkedIn and Facebook first; Apple/Microsoft `[S]` next, without mocks outside tests.
- [ ] PKCE/state/nonce/redirect/token checks; PostgreSQL session rotation/sliding expiry/all-device logout; host-only secure cookies; no automatic email merging; deliberate verified provider linking.
- [ ] Account/history/consent preferences, data export, deletion/anonymisation and delayed hard deletion; age confirmation and guest/paired alternatives.
- [ ] Verify Meta signed deletion callback/status URL; test missing Facebook email and hostile OAuth responses with local **test-only** identity providers.
- [ ] Admin-email authorisation, audited user/reference-data management, aggregate usage, consent-only lead CSV exports, health view and change-freeze controls; unfinished roles/votes/choices remain inaccessible.

**Exit:** Security/provider/account/admin tests green, Meta deletion callback works, admins cannot see live secrets; verify green. Real provider approvals are required, not assumed.

## Task 9 — Public website and agent-readable content

**References:** §2, §14–16.

- [ ] Deliver every §14 public page as meaningful prerendered HTML with JavaScript off; original UK English copy; required legal/accessibility templates marked for solicitor review.
- [ ] Contact/team-building enquiry persistence with consent, honeypot and rate limits; no email sending or personal data in public APIs.
- [ ] Config-driven crawler policy, robots/sitemap, canonical/social metadata, validated structured data, `llms.txt`/full text, Markdown alternates and content negotiation.
- [ ] Versioned GET-only public facts/rules/planner/missions API with permitted CORS; OpenAPI links; pre-filled wizard hand-off requiring human sign-in/confirmation, never agent-created live games.
- [ ] Private game/coordinator/presenter/recap/account routes send noindex/nofollow and stay out of sitemap/caches. Plan aggregate crawler counts and IndexNow `[S]` without deploying or guessing a production domain.
- [ ] Test raw HTML/content variants/contracts and §14 Lighthouse/performance budgets. Initial game bundle must also meet §16's compressed-size limit.

**Exit:** Public-site/Lighthouse budget tests and agent links/hand-offs pass; verify green. MCP remains Could, not part of this task.

## Task 10 — Hardening, privacy and release evidence

**References:** §15–19.

- [ ] ASVS level 2 security review and adversarial authorisation/no-leak checks; DPIA recommendation, lawful-basis/retention inventory and solicitor-review templates; offence controls and children's guest protections.
- [ ] WCAG 2.2 AA manual audit, VoiceOver/TalkBack and real supported browsers/devices in browser/installed modes; lock/unlock, battery saver, casting and a five-person-or-larger playtest.
- [ ] Load `[S]`: 50 concurrent 15-seat games, p95 command latency <300 ms. Soak/chaos `[S]`: accelerated day and seven-day games. Mutation `[S]`: Stryker engine score ≥80%.
- [ ] Versioned event upgraders and safe-deploy replay of every in-progress game; reject differences, enforce admin change freezes/security-fix exceptions and feature flags. Test safe-deploy without performing a deployment.
- [ ] Finish README setup/secrets/running-a-game/deployment guidance and LAUNCH checklist. Meet coverage and scenario volumes below; every Must has a test that fails without it.
- [ ] Record every Should as completed or explicitly deferred with consequence/reason. No high/critical audit findings.

**Exit:** Real `pnpm run verify:full` green, coverage met, all Musts done and Shoulds done or recorded as deferred. Free-tier/no-deployment instruction still applies; release readiness is not permission to publish.

## Task 11 — Could-haves only on explicit request

**References:** §8, §14–15, §19.

MCP server, in-person murder, seer, double vote and encryption at rest remain off/unbuilt. Each requested feature needs scope, its own failing tests, scenario-model/covering-array updates and security review. Any schedule extension suggesting a Could feature must not enable it without owner approval.

## Verification volumes and evidence (SPEC §18)

| Suite | `pnpm run verify` sample | `pnpm run verify:full` |
| --- | --- | --- |
| Exhaustive core sweep | 2 complete games per cell | At least 20 per cell |
| Constrained covering array | 5 complete games per row | At least 50 per row |
| Fault fuzzing | Real documented sample, not skipped | 100,000 fuzzed games |
| Real HTTP/socket games | 3 full-stack games | 20 full-stack games |
| Browser engines | Device smoke tests | Complete games on every profile, browser and installed modes |

Every suite checks its invariants, leakage, replay and termination after each step. Reports include coverage evidence, timings and failing seeds/reproductions. Browser/full-stack scenarios are added at their relevant milestones, not falsely claimed at Task 2. No production deployment before full-volume success and all release criteria; currently no deployment at all.

## Retained workspace mapping

| Specification location | Actual template location |
| --- | --- |
| `packages/engine` | `lib/engine` |
| `packages/shared` | `lib/shared` |
| `apps/server` | `artifacts/api-server` |
| `apps/web` | `artifacts/party-game` |
| Database/schema/migrations | `lib/db` |
| API contract/generated types | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` |
| Cross-service response security | `lib/security` |
| Browser tests and documentation | `e2e/`, `docs/` |

Use pnpm wherever SPEC mentions npm. Keep the existing workspace and artifact-managed services. Resolve the open choices in `DECISIONS.md` before their affected tasks; do not change the verbatim SPEC to resolve them.

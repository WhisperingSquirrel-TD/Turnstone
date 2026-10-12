# Decisions and open choices — complete specification

## Authority and approval

All seven supplied parts are saved in `SPEC.md`, ordered as sections 1–19 without changing section text. The owner must approve PLAN before Milestone 1; a green Milestone 0 verification gate is also required. This turn updates documentation only, not implementation.

Each entry uses context, options, choice and consequence. **Pending** means no assumption is authorised. Requirements are referenced rather than copied into a second configuration source.

## D1 — Workspace and package manager (owner-confirmed)

**Context:** The initial summary named npm and apps/packages, but the owner explicitly instructed retention of Replit's pnpm template; the complete SPEC §4 names pnpm.

**Options:** Replace the template; or map the requested modules onto it.

**Choice:** Keep pnpm. Map `packages/engine` → `lib/engine`, `packages/shared` → `lib/shared`, `apps/server` → `artifacts/api-server`, `apps/web` → `artifacts/party-game`. Keep `e2e/` and `docs/`. Database is `lib/db`, infrastructure contracts are `lib/api-spec`, and response security is `lib/security`.

**Consequence:** Use `pnpm run verify`, `pnpm run verify:full` and the actual pnpm-lock audit wherever the source mentions npm. Existing npm-run aliases do not require a separate npm lockfile. This mapping is approved, not an outstanding stack deviation.

## D2 — Free-tier and approval limits (owner-confirmed)

**Context:** The owner instructed: stay on the free tier, do not publish, deploy or enable any paid service, and keep each run focused to save usage.

**Options:** None without a new explicit owner instruction.

**Choice:** No deployment or paid activation. Do not start Milestone 1 without plan approval and the foundation gate. Complete specification receipt is not implementation approval.

**Consequence:** Reserved VM is a later owner decision, not an action now. Full-volume testing and external providers must be planned honestly; resource constraints cannot waive a Must, fake coverage, or authorise spending.

## D3 — Milestone 0 acceptance and dependency remediation (blocked)

**Context:** Last recorded application/test type checks, lint, formatting, unit/property tests and real PostgreSQL integration passed. Health/readiness and development nonce responses were checked; a narrow-viewport home screenshot rendered. Four-device Playwright/axe and Lighthouse execution were not demonstrated. The last audit had five high advisories, zero critical; this documentation turn did not rerun it.

**Options:** Patch/upgrade affected dependencies; use a maintained compatible tool replacement after approval; or await upstream fixes. Suppressing advisories, excluding development dependencies or calling unrun tests green is not an option.

**Choice:** Gate remains **not green**, no milestone progression. Before any implementation resumes, recheck current advisories and resolve both patched and unpatched paths.

**Consequence:** Last findings: two `extract-zip` high advisories (Lighthouse CI dependency; no patched release reported), one unpatched `braces` high advisory (existing component-preview scaffold), two `brace-expansion` high advisories (patch available). Any proposed replacement/removal must keep the required testing capability and avoid unrelated destructive changes.

## D4 — Baseline header/test disagreement (pending owner review)

**Context:** Current foundation tests expect `Referrer-Policy: no-referrer`; complete SPEC §15 explicitly requires `strict-origin-when-cross-origin`. §15 also says “no inline scripts”, while Vite's development runtime can contain nonce-bearing inline modules. Production header/nonces have not yet been exercised in a browser.

**Options:** Align policy/test with the binding requirement as an explicit requirement change; or retain a stricter policy only with owner approval. Clarify whether the inline-script prohibition includes development tooling or only production application scripts.

**Choice:** Pending; no code/test changes in this turn. Do not silently weaken or rewrite an existing test to get a pass.

**Consequence:** Must resolve before Milestone 0 acceptance. Header settings and emitted HTML need actual checks in development and the built production response server; iframe preview restrictions must not be bypassed.

## D5 — Palette contrast and the earlier test correction (recorded, review required)

**Context:** Charcoal on the specified amber measures 4.32:1, not AA for ordinary text. The initial design used that combination. Buttons were changed to amber-light while amber remained decorative. The initially incorrect test for ordinary charcoal-on-amber text was changed into a regression forbidding that pairing.

**Options:** Use only supported AA text/background pairs while retaining exact brand tokens; or obtain an explicit approved token change. Do not claim the original pairing passes.

**Choice:** Existing implementation retains brand tokens and avoids text-bearing amber backgrounds. No further changes now.

**Consequence:** Supported pairs pass contrast checks, but the earlier test was revised before asking the owner about its invalid assumption. This does not meet the requested stop-and-ask process; it is disclosed, not presented as permission to change failing tests. Future test/spec disagreements must stop for a decision.

## D6 — Infrastructure database, migration and response serving (recorded)

**Context:** Milestone 0 needs a real PostgreSQL check without inventing game state. Per-response nonce CSP needs a response server rather than immutable static files.

**Options:** Minimal infrastructure table plus committed development migration; or prematurely invent game tables. Dynamic nonce response serving; or static hosting with a different policy.

**Choice:** Foundation metadata only, explicitly run committed development migration, no production startup DDL. Existing web response server serves the build with fresh nonces; static assets may still be served normally.

**Consequence:** Event/seat/deadline schema belongs to Milestone 4 after resolved engine contracts. Public-page prerendering remains required in Milestone 9; it is compatible with dynamic response headers. Production migration/publishing decisions remain deferred under the no-deployment instruction.

## D7 — Shared sources and logging (recorded)

**Context:** SPEC requires one authoritative model, locale strings, server truth and secret-safe outputs.

**Options:** Duplicate settings/strings across UI, tests and documentation; or consume shared definitions and reference SPEC.

**Choice:** One rule parameter model shared by wizard/tests; one brand token file; locale-keyed UI strings; one viewer projection for HTTP/sockets. Existing foundation has infrastructure lifecycle logs only.

**Consequence:** Future Pino logs must use explicit safe fields/redaction and never include roles/votes/choices/PINs/tokens/cookies. Lifecycle-only foundation logging is not evidence that full-game log leakage has been tested.

## D8 — Verification layers and placeholder (recorded)

**Context:** SPEC §18 requires real engine, server and browser complete-game evidence, but Milestone 2 precedes server/browser implementation.

**Options:** Fake all-layer success early; or report implemented layers and add subsequent layers at their milestones.

**Choice:** Honest staged harness, sample/full volumes exactly as §18 and documented in PLAN. Current `verify:full` placeholder remains explicitly unavailable, not green. No suite is marked passed merely because configuration exists.

**Consequence:** The first harness report covers real implemented engine layers; pending server/browser cases must remain visible until Milestones 4–7. Final release needs every layer, required coverage, full volume and real-device/real-person evidence.

## D9 — Covering-array generator and independent reference (pending)

**Context:** §18 requires constrained three-way coverage of all rule-affecting settings, plus two-way at larger seat counts, and a separately written reference implementation.

**Options:** A small reproducible in-repository constraint-aware generator with independent coverage verification; or an exactly pinned maintained generator justified by capability/maintenance/cost. Reference logic must not reuse engine decisions.

**Choice:** Pending Milestone 2 research/decision; no package installed or generator selected in this documentation turn.

**Consequence:** Record generator/version, constraint handling, seed, verified covered tuples and excluded invalid tuples. Never confuse unconstrained pairwise coverage with the required three-way model.

## D10 — Scheduler and OAuth implementation choices (pending)

**Context:** §4 permits a one-second durable deadline poller or pg-boss; sign-in requires a maintained library and §13's real provider/session controls.

**Options:** PostgreSQL-backed deadline polling or justified pg-boss; maintained identity-library approaches allowed by §4, evaluated against provider support, PKCE/nonce checks, Postgres sessions, deletion callback and approved costs.

**Choice:** Pending at Milestones 4/8. Do not provision services, obtain credentials in chat, add mock providers outside tests, or assume all provider approvals exist.

**Consequence:** Document exact dependency choices only after checking compatibility. No hand-written local-auth fallback or security stub. Guest-seat security can be real before provider sign-in; coordinator production journeys stay unavailable until real sign-in exists.

## D11 — Could features versus planner extensions (needs clarification)

**Context:** §7 recommends the seer as a spare-time extension, but §8/§19 classify seer as Could. Similar configurable entries exist for Could powers.

**Options:** Keep Could features disabled/unbuilt until requested; or explicitly approve a particular Could feature and add it to scope/testing.

**Choice:** Do not enable Could features implicitly. Owner clarification is pending for whether planner options should merely mention an unavailable extension or omit it.

**Consequence:** Covering arrays test implemented permitted settings; they cannot claim gameplay coverage for an unbuilt Could feature.

## D12 — Sleeper/terminal-state precedence (needs clarification)

**Context:** §5 prevents a Faithful win while a sleeper is waiting; §17 also requires only-Faithful states to end at once. Sleeper activation is limited to before endgame.

**Options:** Treat “only Faithful” as excluding an eligible waiting sleeper, with explicit activation precedence; or give immediate terminal-state rules priority. Define behaviour if a sleeper is waiting at endgame/two-player thresholds.

**Choice:** Pending owner resolution before Milestone 1 terminal-state tests.

**Consequence:** Cannot invent winners, activation order or termination properties from conflicting interpretations.

## D13 — Termination bound and manual controls (needs clarification)

**Context:** §5 demands every game ends within a computed maximum number of steps; §11 allows pause, extend and schedule shifts without explicit limits, and manual advancement is supported.

**Options:** Bound only rule-progress transitions with explicit exclusions for logistics/waiting; or impose owner-approved limits/forced closure for all commands/time.

**Choice:** Pending before engine/harness termination assertions.

**Consequence:** Define exactly what counts as a step and what fairness/eventual-progress assumption bots satisfy. Do not invent limits that change coordinator powers.

## D14 — Secrecy assertions and entitled viewers (needs clarification)

**Context:** §8 allows Traitors to know other Traitors; §6/§11 allow configured ghost spectators; §3 allows announced all-seeing host mode. §18's broad “no ... another seat's role” payload assertion needs those entitlements expressed explicitly.

**Options:** Apply the no-leak assertion to each viewer's configured allow-list, including deliberate host/spectator entitlements; or prohibit those modes by an explicit scope change.

**Choice:** Pending clarification; proposed test interpretation is per-viewer allow-lists with no blind-coordinator/admin entitlement to unfinished secrets.

**Consequence:** Tests must forbid unauthorised data, not reject legitimate Traitor knowledge or silently grant unrestricted rights.

## D15 — Seat/device recovery and later-rule details (needs clarification)

**Context:** §9 allows multiple devices per seat but recovery says the old device leaves. Several rule paths do not yet define all boundary outcomes.

**Options:** Distinguish authorised additional devices from recovery migration; or revoke all prior seat devices on recovery. Clarify reserve roles/late joins, unanimous endgame with abstentions, ghost collective/half-vote ties, shield lifetime when no murder occurs, and recruitment selection/no-response mechanics.

**Choice:** Pending targeted questions before affected engine/server tests; the supplied text remains unchanged.

**Consequence:** Recovery, lockouts, votes and recruitment cannot be implemented with silent fallback rules.

## D16 — Owner placeholders (unconfirmed)

**Context:** §19 expressly leaves these values open.

**Options:** Keep placeholders; or use values explicitly confirmed by the owner.

**Choice:** Leave unconfirmed:

- `APP_NAME`.
- Production domain.
- Font (Arial remains provisional).
- Retention period (the specification's default is not a separate owner confirmation).
- Crawler policy (implement the specified configurable default only when authorised).
- Change-freeze dates.
- Stackstone social links.
- Logo files.

**Consequence:** No invented domain, links, logo, policy confirmation or font substitution. Do not block local foundations merely to request release-stage placeholders.

## Dependency record

This is the foundation's previously recorded inventory, **not** a new install/audit or a complete claim of pinning compliance. New product/tooling direct dependencies were pinned; inherited scaffold manifests still require review for §1's exact-pinning requirement. Workspace references use `workspace:*`.

| Group | Recorded purpose |
| --- | --- |
| TypeScript 5.9.3, ESLint 10.12.0, typescript-eslint 8.71.1, Prettier 3.9.6 | Strict typing, lint/format |
| Vitest 5.0.3, fast-check 4.10.2 | Unit/property falsification |
| Supertest 7.3.1, types 7.2.1 | Real HTTP integration testing |
| Playwright 1.64.0 | Four browser/device profiles |
| axe-core 4.14.0, @axe-core/playwright 4.13.0 | Automated accessibility |
| @lhci/cli 0.15.1 | Requested Lighthouse tooling; audit blocker unresolved |
| Socket.IO/server and client 4.8.4 | Future realtime/testing; no active gameplay socket |
| Express 5.2.1, Zod 3.25.76, Drizzle 0.45.2, pg 8.23.0 | HTTP validation and PostgreSQL |
| React/DOM 19.1.0, React Router 7.18.4, Query 5.102.8 | Browser rendering/routing/server-view tooling |
| Vite 7.3.6, React plugin 5.2.0, Tailwind/plugin 4.3.3, tsx 4.23.13 | Dev/build and typed response/migration tools |
| Existing Pino/logger build dependencies | Safe lifecycle logging; exact-pin review outstanding |

Patched transitive overrides recorded previously: `proxy-addr`, `source-map-js`, `tmp`, `basic-ftp`. Keep advisories included; do not use this record as evidence that the audit is now green.

## Approval request boundary

Owner approval requested for PLAN, with unresolved choices above kept explicit. Plan approval is not a deployment instruction, acceptance of red verification, approval of Could features, or permission to guess missing rules. No Milestone 1 implementation has started.

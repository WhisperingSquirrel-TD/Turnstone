# Decisions and open choices — complete specification

## Amendment 5 — resolved owner identity and logo-link policy

These owner decisions supersede the corresponding D16/D17/D19 placeholders and Amendment 4 link restriction. Section 23 includes all five owner items and its previous mid-game-link prohibition has been replaced. No other SPEC section is changed by this amendment.

### D20 — Confirmed product name, tagline and byline

**Context:** The owner confirms APP_NAME and associated copy.

**Choice:** Set the confirmed name once in the existing application identity config. Derive the tagline from that name and store the owner's byline there. Build page title/social metadata from the same config rather than hard-coded HTML labels. Tests first failed on the placeholder identity and template; implementation follows those tests.

**Consequence:** D16's product-name placeholder is resolved. This is an authorised identity setting, not a framework/theme/gameplay change. The complete hard-coded-name/sentinel rename scan remains scheduled from Milestone 5; passing these foundation identity tests alone does not complete it.

### D21 — Logo always links, with context-specific navigation

**Context:** The owner explicitly replaces Amendment 4's public/end/recap-only outbound-link restriction.

**Choice:** Every screen's logo links to the organisation website. Public pages use the same tab; game, coordinator and presenter screens use a new tab with `rel="noopener noreferrer"`; installed-app mode opens the system browser. Geometry/colour stay identical for all roles, respect safe areas and never overlap holds/countdowns/controls.

**Consequence:** Update the Milestone 5 onward implementation/tests to this owner-authorised policy, not the superseded “never mid-game” rule. Device/browser external-navigation behaviour needs actual tests; no logo UI or universal installed-mode support is falsely claimed by this documentation update. Admin logo destination is specified; its non-installed tab target is not explicitly specified and can be resolved with the admin UX.

### D22 — Retrieved official brand assets; theme change pending approval

**Context:** Playwright Chromium rendered the client-side owner brand page successfully on 12 October 2026. It offers SVG/PNG assets but states no complete palette or typography guide.

**Choice:** Save six original SVG variants under `assets/brand/stackstone/` and keep source URL, exact retrieval timestamp, bytes and observations in `source.json`. All six are below §23's 5 KB limit. Do not change game theme tokens or load web fonts.

**Observed differences:** SVG artwork uses `#C8944A`, `#CA9449`, `#3D3A38`, `#5C5652`, `#6B6B6B`, and dark-background variants `#FAFAF5`/`#D4CDC4`, unlike §2's palette. Wordmark SVGs declare DM Sans; computed page fonts are DM Sans and Playfair Display, not the current Arial token. These are artwork/page observations, not an explicit published replacement token specification.

**Consequence:** Ask the owner before applying colour/font changes. Keep existing §2 tokens/Arial while approval is pending, and retain §20's no-web-font constraint. Saved original assets are not yet applied as UI marks; choose one role-uniform variant at Milestone 5, not role-specific light/dark marks. No logo upload is needed because retrieval succeeded.

### D23 — Confirmed organisation details

**Context:** The owner supplies the organisation identity for structured data and About.

**Choice:** Record Stackstone Consulting, `https://stackstoneconsulting.co.uk/`, and Abingdon, Oxfordshire in the shared identity config for Milestone 9 consumption.

**Consequence:** Do not invent a street address, postcode, social profiles or product production domain. The Stackstone organisation site is not the game's still-unconfirmed production domain.

### D24 — Naming record, owner-reported preliminary search

**Context:** The owner chose the product name on 12 October 2026 and reports a preliminary search with no existing game found.

**Choice:** Create `docs/NAMING.md` with that dated decision/report and trade mark register, domain and handle checks pending with the owner.

**Consequence:** Do not claim independent research or legal clearance. The record is historical documentation, not a second runtime identity config, and requires no paid registration/service.

## Amendment 4 — section 23 and authorised section 2 edit

**Context:** The owner explicitly authorises expanding the earlier attribution requirement and appending §23.

**Options:** Keep the prior footer/end/recap-only requirement or apply the owner's everywhere requirement while retaining role uniformity.

**Choice:** Append §23 verbatim and change only the attribution location clause in §2:

- Before: `"Built by Stackstone Consulting" in the footer, end screen and recap`
- After: `"Built by Stackstone Consulting" on every screen, plus the footer, end-of-game screen and recap`

**Consequence:** This is an owner-authorised SPEC amendment, not an undocumented deviation. All other text in sections 1–22 is unchanged. Milestone 5 starts the reusable mark and rename tests; Milestone 9 adds the independence statement and naming record. Current milestone work/gates, free-tier restrictions and unresolved WebKit acceptance are unchanged.

### D17 — Uniform mark on every screen

**Context:** The Stackstone mark must never signal a role or interfere with private interactions and accessibility.

**Options:** Separate screen/theme/role branding or one role-neutral component and layout/token contract.

**Choice:** From Milestone 5, use the same shared mark, position, size and colour on every screen; an inline SVG within §23's size budget. Apply the contract as coordinator/presenter/admin/public routes arrive in later milestones.

**Consequence:** Test all role/viewer variants, safe areas, narrow widths, zoom/large text and installed modes; measure clear bounds around holds/countdowns/controls. Do not alter the mark during private moments or use different theme/role colours as a tell. Amendment 5 supersedes the earlier mid-game restriction: every mark links to the organisation site using D21's context-specific navigation.

### D18 — Single-source identity and rename regression

**Context:** §23 expands the existing APP_NAME convention to product logo, domain and social links and requires a test that rejects hard-coded product names elsewhere.

**Options:** Scattered literals and manually coordinated renames or one canonical identity config consumed by all renderers.

**Choice:** Milestone 5 introduces the shared identity source, hard-coded-name regression and a config-driven sentinel rename test; extend coverage to later routes and public/agent surfaces.

**Consequence:** Test authored sources/templates/metadata/config inputs for stray product-name literals and verify that generated output follows the config, including manifests, structured data, links and statements. Expected values come from the same config, not a second list of copied names. Distinguish configuration-derived build output from authored hard-coding; no broad exemptions to excuse duplicate naming. Logo/domain/social placeholders remain until confirmed; a test rename is not permission for a real rename or deploy.

### D19 — Exact independence statement and good-faith record

**Context:** §23 supplies a programme-neutral statement and a Should naming record.

**Options:** Ad hoc statements naming programmes or one locale template using the configured product name and the owner's exact wording.

**Choice:** Milestone 9 renders §23's exact statement in the footer and `/about` with APP_NAME from the canonical config. Maintain `docs/NAMING.md` `[S]` with the chosen name/date and register/domain/web checks actually made.

**Consequence:** Test raw static HTML, statement equality and renamed output. Do not name a programme, imply endorsement, invent checks or treat a good-faith record as legal clearance. No new name, paid domain purchase or legal-sign-off assumption on this instruction; unperformed checks stay pending or the Should is explicitly deferred with reason.

## Amendment 3 — section 22 accepted and mapped

**Context:** The owner adds Traitor tasks `[M]` (optional per game, default Off), portable static front end/long-lived Node server `[M]`, and all-Vercel hosting `[C]`.

**Options:** Treat game-off settings as deferred features or include every task requirement in the scheduled milestones; retain host-specific assumptions or design portable outputs/configuration.

**Choice:** Append §22 verbatim without changing sections 1–21. Map Traitor task model/rules to Milestone 1, scenario coverage to Milestone 2 and complete task experiences/library to Milestone 7. Map hosting portability to Milestones 4, 5 and 9. Existing reference administration in Milestone 8 covers task-library management.

**Consequence:** No implementation, milestone restart, deployment, paid service or platform migration on this amendment. Current verification gates and the WebKit blocker remain unchanged.

### C1 — Optional game setting, required feature

**Context:** §22 specifies delivery at the first private moment of each cycle, reporting at the next shadow, honour-system completion and a configurable next-murder penalty.

**Options:** Role-specific screens/client-held secrets or server-owned assignment/report events projected only to entitled viewers, with uniform decoys.

**Choice:** Use the shared setting model, deterministic event/replay contracts and allow-list projection in Milestone 1. Extend bots, constrained arrays, independent reference and the four task golden scenarios in Milestone 2. Complete the actual library, setup controls, private delivery/reporting and final reveal/recap/award in Milestone 7.

**Consequence:** Default Off and no-consequence settings must preserve existing gameplay. Living non-Traitors receive same-shaped delivery/reporting decoys; Traitor chat receives only entitled task reports. Blind coordinators/admins never gain unfinished task secrets. No added mechanic for detecting tasks socially. No numerical/completion award tie-break is invented before rules are clear.

### C2 — Safe original task reference data

**Context:** The owner requires at least 40 original tagged tasks and filtered custom additions, with explicit safety/consent/accessibility constraints.

**Options:** Unreviewed generated tasks or original reference entries individually reviewed against §22.

**Choice:** Milestone 7 supplies the original library, tags and coordinator additions; existing Milestone 8 audited reference-management UI supports administration. Apply the offensive-word filter and validate metadata/custom input, without treating automated validation as proof of safety.

**Consequence:** Every task must be safe, legal and kind, respect consent, involve no eating/drinking pressure, venue departure, damage, embarrassment or targeting. Setting/minimum-age/accessibility/difficulty metadata guides selection; it does not require collecting children's birth dates or widening guest personal data.

### C3 — Portable front end and server, not all-Vercel

**Context:** §22 permits a static CDN/Vercel public site and app shell with the game server on a separate always-on host, connected through same-origin or sibling-subdomain configuration.

**Options:** Host-bound runtime/origin assumptions or pure static outputs plus an independently deployable long-lived Node/PostgreSQL/API/socket/scheduler process.

**Choice:** Milestone 4 implements validated server/origin configuration and both security topologies; Milestone 5 implements a static app shell and configurable browser connections; Milestone 9 completes independent static public outputs/routing/cache/security tests. Production must not require Replit-only runtime features.

**Consequence:** Scope credentialed cookies, CSRF, CORS, socket origin checks and CSP connect-src explicitly for each permitted topology, never wildcard trust or automatic auth fallback. Reconcile sibling-subdomain operation with existing host-only cookies rather than silently widening cookie Domain. Keep static caching free of secret/API content. Development artifact routing remains supported; portable design does not authorise running containers in this workspace or changing hosting now.

### C4 — All-Vercel hosting deferred as Could

**Context:** The owner supplies current Vercel WebSocket beta/function-duration/fan-out/free-cron limitations in §22. These are owner-provided constraints, not an independently verified current platform capability report.

**Options:** Build around those beta/serverless limits now or retain the portable split-host architecture and revisit later.

**Choice:** Do not build all-Vercel hosting. Revisit authoritative, then-current platform documentation when generally available and the owner requests this Could item; record the resulting compatibility/cost decision before implementation.

**Consequence:** No provider setup, paid plan, WebSocket workaround, scheduler workaround or extra service is activated. Hosting and any paid plan need an owner decision before launch.

### C5 — Task rule details to resolve before affected engine tests

**Context:** §22 specifies defaults and four golden outcomes but leaves some interactions unspecified.

**Open questions:** For one-each tasks, does any missed report cancel one group murder, and can multiple misses cancel multiple murders or stack across cycles? For one-shared tasks, who submits the authoritative report and how are disagreements handled? What happens to outstanding tasks/penalties on banishment/departure, and when does a mid-cycle recruit (or activated sleeper) receive a task? How are missing reports treated and equal “smoothest operator” scores awarded?

**Options:** Invent rules or obtain an owner resolution before implementing those transitions.

**Choice:** Pending; do not invent semantics or weaken tests. Resolve before affected Milestone 1 work and before the corresponding golden/reference cases, without interrupting the current foundation milestone for task implementation.

**Consequence:** The model/defaults, four required golden outcomes and secrecy/uniformity requirements are committed in the plan; ambiguous transition/award details are not silently filled in.

## Amendment 2 — section 21 accepted; Milestone 9 expanded

**Context:** The owner supplied binding positioning, sales-page, planner, shared-facts, trademark and claims requirements as §21.

**Options:** Keep the narrower §14 page/content set or incorporate every new Must into Milestone 9.

**Choice:** Append §21 verbatim after §20, preserve sections 1–20, and extend Milestone 9. Do not interrupt/restart the current milestone or introduce marketing implementation now.

**Consequence:** Current acceptance/status and the free-tier/no-deployment instruction are unchanged. The new work is a required part of Milestone 9, not a Could feature or immediate advertising campaign.

### B1 — Positioning and category-only sales pages

**Context:** §21 fixes the lead message, proof points, full-loop positioning and three new direct-answer pages.

**Options:** Shared original category-based copy or named competitor/product comparisons.

**Choice:** Use the owner's exact lead message in keyed UK English content. Deliver `/compare`, `/large-groups` and `/no-host` with the specified direct-answer openings. Compare only the listed categories and ours; no competitor brands/products.

**Consequence:** Ordinary game vocabulary is intentional, but it never permits TV-show branding, look, metadata/alt-text/URL/domain references or official/inspired-by claims. Legal sign-off must be explicitly confirmed by the owner before any such exception; none exists now. Privacy/fairness/capacity proof points remain subject to B4.

### B2 — One source for facts and FAQ questions

**Context:** §21 requires facts equality across five surfaces and exact mirroring of eight FAQ questions.

**Options:** Hand-maintained page/API/agent copies or one typed facts record and keyed FAQ collection.

**Choice:** Build one shared facts source and one shared FAQ question/answer source in Milestone 9. Render the facts record into home, `/faq`, `/llms.txt`, JSON-LD and `/api/public/v1/facts`; render the eight question strings verbatim into FAQ, `llms.txt` and FAQPage data.

**Consequence:** Test canonical semantic equality despite different HTML/JSON/Markdown encodings, plus exact question wording. Do not independently rewrite facts in templates or introduce divergent API defaults. Owner-supplied questions may contain numbers; that does not authorise untested numerical claims in their answers.

### B3 — Public planner without a second rules implementation

**Context:** `/formats` must show a real timetable and wizard hand-off while remaining a static public page under §20's JavaScript budget.

**Options:** A small progressive form enhancement invoking the public planner API or a budget-compliant client import of the same shared planner.

**Choice:** Reuse Milestone 3's planner, exposed through the existing public API contract; select the budget-compliant delivery mechanism in Milestone 9 after measurement. No mock timetable or duplicated planning algorithm.

**Consequence:** Include all four owner inputs, validation, blocked-window handling, output timetable and pre-filled wizard link with real sign-in/confirmation. Test the same inputs against planner/API/form results. Keep meaningful static fallback content and no per-page server rendering; any form-triggered planning request is explicit, not background polling.

### B4 — Evidence-gated public claims

**Context:** §21 forbids publishing capacity/privacy/fairness claims before their corresponding tests pass and requires design intent without numbers meanwhile.

**Options:** Treat targets/extrapolations as proven facts or link each public claim to passing evidence.

**Choice:** In Milestone 9, maintain a claim-to-test/evidence register and guard every public/agent/facts representation. Preserve required proof points as requirements, not unconditional permissions to advertise unverified capabilities.

**Consequence:** Missing, failing or invalidated evidence yields design-intent wording without numbers, not a weaker “designed for” numeric capacity claim. Reduced-scale extrapolations do not prove full §20 capacity. Distinguish the unchanged verbatim FAQ questions from answer/marketing assertions. Tests cover both enabled and unverified states and fail without these restrictions.

## Amendment 1 — section 20 accepted and mapped

**Context:** The owner supplied §20 verbatim as a binding amendment. It overrides conflicting requirements in §4, §16 and §18, not the secrecy/accessibility rules or free-tier instruction.

**Options:** Retain conflicting single-instance/larger-client assumptions; or adopt §20's static public front door, tighter budgets and scale-ready server design.

**Choice:** Adopt §20 and the milestone mapping in PLAN. Existing sections 1–19 remain unchanged. This documentation amendment does not restart the current milestone, authorise a framework switch, run full-capacity tests or activate hosting.

**Consequence:** The earlier single-instance/out-of-scope assumptions and Node-served public-site destination are superseded for the later product architecture. The existing Milestone 0 build/nonce fixture stays in scope for foundation verification, not as the final public CDN architecture. Its WebKit acceptance blocker is unchanged.

### A1 — Client and public budgets

**Context:** §20 tightens the player transfer budgets and introduces public-page/JavaScript/image limits, role-route chunk separation, no game images/fonts/third-party scripts and measured slow-device usability.

**Options:** Keep React and meet budgets through static generation/lazy loading and dependency reduction; or present measured alternative-framework options if that fails.

**Choice:** Keep React. Milestone 5 introduces player checks; Milestones 6/8 add coordinator/presenter/wizard/admin checks at first route introduction; Milestone 9 introduces static public-route checks. Add automated build/dependency-graph size checks to verify **once the corresponding real routes exist**, not at the end of Milestone 10.

**Consequence:** Count shared imports and complete initial resource loads, not just the entry chunk. Inspect public images/scripts/fonts and game resource types, cache behaviour, typical view payloads and heartbeat/no-polling contracts. Budget numbers stay authoritative in SPEC §20. Compression accounting and cold/warm test conditions must be recorded when implementing checks. No Preact compatibility swap without asking the owner.

### A2 — Instance-independent server and scheduler

**Context:** §20 requires PostgreSQL-backed state/versioning, multi-instance-safe deadline claims, pooled connections, finished-game memory release and cross-instance pushes without an extra paid service. Multi-instance support is now `[S]`.

**Options:** Instance-only state/in-memory timers; or PostgreSQL snapshots/recent events, optimistic command checks, lock-claimed deadlines and a compatible shared Socket.IO adapter.

**Choice:** Milestone 4 designs for any instance handling any request, with `FOR UPDATE SKIP LOCKED`, transactional/idempotent deadline effects and cross-instance authorisation tests. Prefer the PostgreSQL adapter after dependency/compatibility review; no Redis without owner approval.

**Consequence:** Existing PostgreSQL-poller preference remains compatible. “No polling loops” concerns clients, not the server's durable deadline poller. Single-instance-first hosting no longer restricts architecture to one instance. Scaling/paid infrastructure is not activated now.

### A3 — Reduced versus full capacity evidence

**Context:** Free-tier builds can measure smaller workloads and extrapolate, but §20's full targets need an owner-approved production VM/database plan.

**Options:** Run full load on unapproved resources or claim extrapolations prove production capacity; or maintain separate measured reduced-scale and measured full-target evidence.

**Choice:** Add bounded reduced-scale checks to verify from Milestone 4 as server capabilities exist, expanding with the relevant routes in Milestones 5–9. Milestone 10 implements every full §20 capacity target and records results in `docs/CAPACITY.md`; paid-resource execution awaits an explicit owner decision.

**Consequence:** Report steady play, private fan-out, deal spike, join storm, static throughput with game-server isolation, and soak/resource growth. Record hardware, workload, durations, command/fan-out percentiles, players per CPU core and per GB, errors and cost-per-player assumptions. Distinguish measurements from extrapolation; do not invent pricing, production capacity or a passing full test. Pending full-capacity evidence blocks launch, not free-tier development.

### A4 — Admission control, forecasts and peak days

**Context:** §20 protects existing games when capacity is near saturation, supports advance scheduling and requires peak-day load forecasts/change freezes; public status is `[S]`.

**Options:** Reject/throttle all traffic together or guess a capacity threshold; or use a measured threshold for new-game admission and preserve existing-game joins/play.

**Choice:** Milestone 4 admission policy and reduced boundary tests; Milestones 3/6 scheduling data and coordinator paths; Milestone 8 per-day admin forecasts/freezes; Milestone 9 public status `[S]`; Milestone 10 full validation.

**Consequence:** Busy copy is a locale key using the owner's wording. Test both sides of the threshold and existing-game priority. Peak-day examples do not make the game's brand or rules seasonal. No peak-day hosting is enabled on this instruction.

### A5 — Same-domain static front door and security-policy compatibility

**Context:** §20 requires static public pages with no per-page server work, while §15's nonce CSP requirement and the foundation's per-response Node nonce server remain. The amendment explicitly overrides §4/§16/§18, not §15.

**Options:** Separate static public content and app/API routing on one domain with a compatible approved public CSP; or another compliant static-hosting/header design. A hash/external-only public CSP in place of nonce-based public policy would need an explicit recorded approval, not an assumed amendment to §15.

**Choice:** Map traffic isolation/routing design to Milestone 4 and final static public output/cache headers to Milestone 9. Keep dynamic game/API policies secret-safe. Public security-header mechanism and final hosting topology remain implementation choices to resolve before Milestone 9; no hosting or public CSP deviation is silently approved here.

**Consequence:** Public-page/CDN traffic must not reach the game server. Existing data-submission/public API endpoints remain separately tested; static page delivery is not authority to weaken enquiry validation or guest/privacy boundaries. Do not change the current foundation server merely to simulate a future deployment.

## Active owner resolutions and PLAN approval

PLAN is approved as written. The following owner decisions supersede the historical pending entries below. SPEC is unchanged. Milestone 0 must be genuinely green before Milestone 1; stop for review after Milestone 1. No publishing, deployment or paid services.

| Item | Resolved choice and consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D3   | Patch all patchable advisories, including brace-expansion. Remove the unused component-preview scaffold only if nothing depends on it. First attempt a maintained alternative preserving Lighthouse (Node API against Playwright Chromium). Only if no alternative works, allow development/test-only advisory exceptions with package, advisory ID, development-only justification, 30-day expiry and milestone recheck. No production exceptions. Verify fails on expired exceptions or any new high/critical advisory. This resolves the policy, not the still-pending verification evidence. |
| D4   | Use no-referrer everywhere: stricter than SPEC §15 because join links carry tokens. Keep the existing regression. “No inline scripts” applies to production builds; development tooling is exempt. Test actual built-server headers and emitted HTML. This is an explicit owner-approved SPEC deviation.                                                                                                                                                                                                                                                                                         |
| D5   | Retroactively approved: amber decorative/accent only; AA-passing text-bearing controls; retain the regression.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D9   | Agent chooses at Milestone 2; prefer an in-repository constrained generator and independent coverage checker, no new dependency. Record the final implementation choice at that milestone.                                                                                                                                                                                                                                                                                                                                                                                                       |
| D10  | Agent chooses at the relevant milestones; prefer a PostgreSQL durable deadline poller without a new dependency. OAuth library choice still requires recording after compatibility checks.                                                                                                                                                                                                                                                                                                                                                                                                        |
| D11  | Planner offers only built and enabled features. Omit seer and all Could features until explicitly requested; overrides SPEC §7's suggested seer extension.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D12  | On removal of the last Traitor, an alive/non-departed eligible sleeper activates at the next private moment only before the endgame trigger and with more than three players remaining. Otherwise Faithful win immediately. Never activate in/after endgame. Run parity/two-player checks after activation.                                                                                                                                                                                                                                                                                      |
| D13  | Steps are rule-progress transitions: deal, each cycle step, each endgame round. Logistics pause/extend/shift/undo are not steps; deadlines eventually fire. Maximum cycles = planner cycle count + 3, then immediate endgame. Every bot strategy with firing deadlines must reach FINISHED within the bound.                                                                                                                                                                                                                                                                                     |
| D14  | No-leak assertions use each viewer's allow-list, including legitimate Traitor knowledge, announced all-seeing host and spectator ghosts. Blind coordinator/admins never receive unfinished secrets.                                                                                                                                                                                                                                                                                                                                                                                              |
| D15  | Recovery revokes every prior seat device. A second paired-seat device needs existing-device confirmation plus PIN. Late joiners are always Faithful: random-from-reserve is removed, an explicit deviation from SPEC §6. Missing/abstaining endgame votes count as continue. Collective ghost vote is majority of participating ghosts; tie means no vote. Half-vote round-table ties follow the configured tie rule. Shield expires at the end of the next DAWN even if unused. Recruitment target uses victim rule; timeout means decline.                                                     |
| D16  | Amendment 5 resolves APP_NAME, the organisation site/location and supplied logo files; other unconfirmed placeholders remain. Arial and 30-day retention stay defaults; observed brand styling is pending owner approval.                                                                                                                                                                                                                                                                                                                                                                        |

Historical context below is retained for accountability, not as an unresolved request for these owner decisions. Remaining implementation choices delegated to the agent are recorded at their milestones.

## D3 implementation result — audit resolved without exceptions

**Context:** The preview registry was empty and no other package referenced the component-preview scaffold.

**Choice:** Remove that unused scaffold/service. Override brace-expansion with exactly pinned 5.0.12. Replace @lhci/cli 0.15.1 with Lighthouse 13.5.0's maintained Node API, run against Playwright Chromium and the actual built production web server.

**Consequence:** The maintained alternative works and removes the vulnerable extract-zip dependency. The audit reports zero high and zero critical; no development exception is needed or authorised in the current list. The gate rejects every new high/critical finding and malformed/unavailable reports. A future exception would require D3's full record, expiry enforcement and production-tree exclusion before use; no exception machinery is used to excuse current findings.

Lighthouse reports accessibility 100 for home and play. Its dependency replaces the archived CLI entry below. All browser caches/reports are excluded from Git/deployment inputs.

## D4 implementation evidence — production headers verified

The new actual-build test first failed on missing build output, then passed after building. Both production routes emit fresh response-specific nonces and external-only script elements; no inline production scripts or unresolved nonce placeholders were found. Existing no-referrer tests are unchanged. Native browser assertions still apply.

## Native browser environment — unresolved Milestone 0 acceptance blocker

**Context:** Chromium profiles passed smoke/axe. Ubuntu-packaged WebKit depends on native loader assumptions and a headless EGL renderer not provided by the selected Nix execution environment.

**Options:** Supply a compatible software EGL backend or a supported headless display/runtime for the official WebKit binary, preserving both WebKit profiles and assertions; or obtain an approved supported test execution environment. Switching profiles to Chromium or skipping them would violate acceptance.

**Choice:** Stop retrying after native package installation, ABI-correct output wiring and a dependency-preflighted official-binary wrapper. No gameplay work while this gate is red.

**Consequence:** WebKit reaches launch but page creation aborts with “Could not create EGL display: no supported platform available.” Both iPhone/iPad profiles remain failed. A new approach is needed before further verification or Milestone 1.

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

## D16 — Owner identity partly resolved; remaining placeholders

**Context:** §19 expressly leaves these values open.

**Options:** Keep placeholders; or use values explicitly confirmed by the owner.

**Choice:** Amendment 5 resolves APP_NAME in the single config and supplies official SVGs plus the organisation website/location. Leave unconfirmed:

- Production domain.
- Font (Arial remains provisional).
- Retention period (the specification's default is not a separate owner confirmation).
- Crawler policy (implement the specified configurable default only when authorised).
- Change-freeze dates.
- Stackstone social links.

**Consequence:** The organisation website is confirmed; product domain/social links are not. No invented domain, policy confirmation or font substitution. Brand observation/approval is tracked in D22. Do not block local foundations merely to request release-stage placeholders.

## Dependency record

This is the foundation's previously recorded inventory, **not** a new install/audit or a complete claim of pinning compliance. New product/tooling direct dependencies were pinned; inherited scaffold manifests still require review for §1's exact-pinning requirement. Workspace references use `workspace:*`.

| Group                                                                      | Recorded purpose                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| TypeScript 5.9.3, ESLint 10.12.0, typescript-eslint 8.71.1, Prettier 3.9.6 | Strict typing, lint/format                             |
| Vitest 5.0.3, fast-check 4.10.2                                            | Unit/property falsification                            |
| Supertest 7.3.1, types 7.2.1                                               | Real HTTP integration testing                          |
| Playwright 1.64.0                                                          | Four browser/device profiles                           |
| axe-core 4.14.0, @axe-core/playwright 4.13.0                               | Automated accessibility                                |
| @lhci/cli 0.15.1                                                           | Requested Lighthouse tooling; audit blocker unresolved |
| Socket.IO/server and client 4.8.4                                          | Future realtime/testing; no active gameplay socket     |
| Express 5.2.1, Zod 3.25.76, Drizzle 0.45.2, pg 8.23.0                      | HTTP validation and PostgreSQL                         |
| React/DOM 19.1.0, React Router 7.18.4, Query 5.102.8                       | Browser rendering/routing/server-view tooling          |
| Vite 7.3.6, React plugin 5.2.0, Tailwind/plugin 4.3.3, tsx 4.23.13         | Dev/build and typed response/migration tools           |
| Existing Pino/logger build dependencies                                    | Safe lifecycle logging; exact-pin review outstanding   |

Patched transitive overrides recorded previously: `proxy-addr`, `source-map-js`, `tmp`, `basic-ftp`. Keep advisories included; do not use this record as evidence that the audit is now green.

## Approval request boundary

Owner approval requested for PLAN, with unresolved choices above kept explicit. Plan approval is not a deployment instruction, acceptance of red verification, approval of Could features, or permission to guess missing rules. No Milestone 1 implementation has started.

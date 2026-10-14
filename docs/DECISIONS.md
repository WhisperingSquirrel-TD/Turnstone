# Decisions and open choices — complete specification

## CI and hosting review — 13 October 2026

### D31 — Termination benchmark and bounded verification sample

**Context:** The owner’s reviewer reported a 30-second GitHub Actions timeout in the random-bot D13 termination property. Raising its timeout would conceal a performance defect.

**Options:** Increase the test timeout; remove repeated replay checking; or retain every replay assertion while advancing a replay cursor incrementally.

**Choice:** The measured hot path was the test re-running `replay(game.events)` from the beginning after every phase, making the test quadratic in its event-log length. The property now evolves each newly appended event once, compares the cursor at each transition, and performs one final full replay. It still asserts termination and replay equality. The performance budget is under 100 ms per rule-progress step on average and under 15 seconds per complete game, printed for each of the seven bots. Local before/after random-bot results were 32.6 s / 664.7 ms per step and 2.9 s / 58.5 ms per step; separate 40-seat full-game samples measured 0.62–1.07 s and 10.7–13.8 ms per rule step. These are Replit-container measurements, not GitHub-hosted-runner measurements; CI will report its own readings.

**Consequence:** No timeout was raised and no engine rule or assertion was weakened. The measured root cause was repeated verification work, not a demonstrated slow single engine transition. Preserve the benchmark and use the GitHub result to confirm performance on CI-class hardware.

### D32 — Fast deterministic scenario sample

**Context:** The reviewer requires a fast `verify` sample and reserves full-volume games for `verify:full`; the prior repeated sample was taking too long.

**Choice:** `verify` runs one complete deterministic game for every core-sweep cell, one for every constrained three-way row, one for every high-seat two-way row, and 32 fuzz games. This changes only the repetition counts; all valid matrix cells/rows and independent coverage checks remain in the sample. `verify:full` retains 20 games per sweep cell, 50 per covering row, 100,000 fuzz games and the full scenario report.

**Consequence:** This reviewer-directed fast sample supersedes §18’s smaller-verification repetition counts; full-volume acceptance criteria are unchanged. Keep the change visible in PLAN and reports, and do not describe the sample as full-volume validation.

### D33 — Independent CI suites and release protection

**Context:** The monolithic Verify job stopped before WebKit, and the reviewer confirmed Vercel’s production branch is `release`; the repository is public with secret and push protection enabled.

**Choice:** Verify is split into independent static, unit, property, PostgreSQL integration, scenario, per-device browser, Lighthouse and audit jobs, with a required-checks aggregator. Every job has an explicit timeout; WebKit iPhone/iPad jobs run on GitHub Actions. Use the full-SHA-pinned Node 24-compatible `pnpm/action-setup` 6.1.0 and `actions/cache` 6.1.0 actions. Pin runners to `ubuntu-24.04`; review the pin on 19 October 2026 after checking Playwright’s support for the newer image. Release promotion requires every Verify job to pass and the repository variable `TURNSTONE_PROMOTION_ENABLED` to equal `true`; the variable is unset/false by default.

**Consequence:** The promotion workflow cannot update `release` or trigger Vercel merely because this work is pushed to `main`. No production deployment or paid service is enabled. Keep secrets and personal data out of the public repository; CI secret scanning remains full-history and SHA-pinned.

### D34 — Static-host pre-launch headers

**Context:** Vercel serves the static app without the Express server, while every preview and production response must stay unindexed until the owner declares launch.

**Choice:** Use the single `PRE_LAUNCH_NOINDEX` security configuration flag. While enabled, Vercel applies `X-Robots-Tag: noindex, nofollow` globally; the app preview, built web server and API middleware use the same flag, and `robots.txt` disallows all crawlers. `vercel.json` carries the specified static, nonce-free CSP, HSTS, no-referrer, nosniff, COOP, Permissions-Policy and cache rules. Tests compare the Vercel JSON with the flag and exercise built production HTML/preview/API responses.

**Consequence:** The static headers are verified from repository configuration, not from a live Vercel deployment; no deployment was made. Because Vercel headers are literal static configuration, the sync test must remain green when the owner changes the flag and its matching Vercel header at launch.

## Amendment 6 — active owner authority

Section 24 is appended verbatim, including the owner's concluding delivery instruction. Sections 1–23 remain unchanged. Its domain, provider and pipeline decisions supersede conflicting historical entries below. Role labels remain the stated defaults; no theme/font decision is inferred.

### D25 — WebKit CI exception and provisional foundations

**Context:** Replit WebKit cannot create its EGL display; the owner explicitly approves official Ubuntu GitHub Actions instead and permits browser-free engine work immediately.

**Choice:** Local browser verification prints exactly `WebKit profiles run in CI`, then runs Pixel and desktop including axe. CI runs every configured profile, installs official Chromium/WebKit dependencies and avoids Nix/native-executable overrides. Milestone 0 is provisional until the first fully green Verify workflow; local green does not prove iPhone/iPad compatibility. Begin Milestone 1 now under strict TDD.

**Consequence:** This is an owner-approved location change, not deletion/weakening of mobile tests or a silent skip. No first CI result is claimed: the owner must push the repository. The prior “WebKit blocks engine work” instruction is superseded.

### D26 — Passkeys replace mandatory social providers

**Context:** The owner rejects providers requiring developer programmes/business verification and confirms guest players.

**Choice:** Milestone 8 selects an exactly pinned maintained WebAuthn library, with required user verification, no attestation, several passkeys/account and production RP ID from the single config. No passkey recovery bypass; loss means a new account and co-coordinator game transfer. Google/Microsoft OIDC are Shoulds enabled only with configured IDs/complete server credentials. LinkedIn, Facebook, Apple and Meta deletion callback are removed. Role labels stay Traitor/Faithful.

**Consequence:** No auth libraries, identity providers or fake authentication are installed now. Before Milestone 8, resolve trustworthy administrator identity binding: passkeys authenticate credentials, not self-asserted email addresses. Existing session/privacy/authorisation requirements remain unless expressly superseded.

### D27 — Confirmed domains and split static delivery

**Context:** The owner confirms the canonical public/app domain, planned sibling API origin, Vercel front end and a later always-on server-host decision.

**Choice:** Store domain/RP ID/planned API origin in the existing identity config; actual client API origin reads the public build-time `VITE_API_ORIGIN` variable, null when unconfigured, not a fabricated live service. Vercel configuration builds/output-selects only the web package and rewrites app routes to the static shell, never running/building the game server.

**Consequence:** The canonical domain placeholder is resolved; the server host is not. Connecting domains/DNS/Vercel is the owner's later step, not performed here. Actual API connections/topology validation belong to Milestone 4; complete prerendered public output/static CSP/caching/security/budgets belong to Milestone 9. The current nonce-served production fixture is not proof of final CDN security.

### D28 — Verify and exact-commit promotion

**Context:** The source of truth is the owner's stated GitHub repository; the owner pushes from Replit.

**Choice:** Push-to-main Verify uses Node 24, pinned pnpm, frozen lockfile, disposable PostgreSQL, masked generated test-session secret, pnpm/browser caches, official Playwright browser dependencies and a 15-minute job limit. All third-party actions are full-SHA pinned, resolved from official repositories. Permissions default to none; Verify gets contents read, only promotion gets contents write. Successful same-repository main push verification triggers exact-SHA checkout/ancestry/freeze checks and non-forced fast-forward release promotion. No `pull_request_target`, unchecked commit merge or Replit publish.

**Consequence:** Promotion honours latest main-branch UTC freeze dates; malformed ranges fail closed and only the exact `[security]` message tag bypasses a valid freeze. Empty initial dates are pending owner configuration, not invented freeze policy. Out-of-order/non-fast-forward promotions fail rather than overwrite newer release history. Add nightly full verification when Milestone 2 exists; never run the unavailable placeholder nightly. First CI success/actual runtime/Vercel integration remain unverified owner steps.

### D29 — Engine implementation boundary and cryptographic adapter

**Context:** Milestone 1 may proceed independently of browser compatibility. The owner has since resolved C5/C6 and directed that their rules be implemented and tested.

**Choice:** Implement/test the pure core with injected time/random source, strict shared config/command/event/view schemas, versioned event replay, dealing/commitment, voting/reveal, shadow/protection, pause/departure/sleeper/win checks and explicit projections. Node's deterministic SHA-256 hash needs no extra package. The production random adapter is outside the engine and uses only `randomInt`/`randomBytes`; seeded randomness exists only in test fixtures. No engine database/network/logging or default random fallback.

**Consequence:** This records the implementation boundary, not Milestone 1 acceptance or a playable game. Owner-resolved task rules are now in scope for the pure engine; remove the earlier `TASK_RULES_PENDING` limitation. Complete the applicable schema, transition, projection and termination tests before acceptance. No later milestone or unrun scenario/coverage result is claimed.

### C6 — Owner-resolved termination and endgame ties

**Context:** The owner resolved the otherwise conflicting endgame tie and termination rules.

**Choice:** Abstentions in endgame votes count as a tie among all eligible players. A tied `FINAL_BANISH` always re-votes among the tied players, then uses the injected random source; the cycle's `revote then no banishment` setting does not apply. Every final banishment therefore removes one player and the endgame takes at most `alive - 2` rounds. In cycles, stalls are bounded by the planner cycle count plus three; reaching that limit starts the endgame. Logistics commands are not rule-progress steps. With deadlines firing, prove the bound under every bot strategy.

**Consequence:** Add explicit property coverage; the choice resolves the former C6 blocker. A passing bounded property result is still required before claiming it.

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

### D22 — Official assets retained; candlelit palette approved

**Context:** Playwright Chromium rendered the client-side owner brand page successfully on 12 October 2026. The owner subsequently approved the darker candlelit palette in §25; that visual direction supersedes the earlier palette decision in D30.

**Choice:** Keep all six downloaded source SVGs unchanged. Use the approved §25 colour tokens and system font stacks. The four wordmark variants are outlined as product assets; product screens must use only these font-independent outputs, never the source wordmarks.

**Outline record:** The source lettering was rendered in Playwright Chromium with the DM Sans 400 and 700 static faces linked from the Google Fonts CSS endpoint, then converted to paths and optimized. A side-by-side Playwright screenshot comparison against each original showed matching lettering, spacing, placement and colour. Retrieved/derived 13 October 2026; every outlined wordmark is below 5,000 bytes. The source SVGs remain unchanged.

**Observed differences:** The owner-approved token palette is Peat `#16110D`, Walnut `#241C16`, Bark `#3D3A38`, Gilt `#C8944A`, Candle `#FAFAF5`, and Ash `#D4CDC4`. Normal-size Gilt text is permitted only on Peat or Walnut; it is not AA-compliant on Bark or Candle. The SVG wordmarks declare DM Sans, but product screens use system fonts and the wordmark must not rely on installed fonts.

**Consequence:** Theme-token and contrast-test updates precede screen work. Screen sets follow their specified milestones; avoid claims that unbuilt screens use the final presentation. No external runtime font or photo asset is permitted. Use the outlined wordmarks when the Stackstone mark is added in later screen milestones.

### D23 — Confirmed organisation details

**Context:** The owner supplies the organisation identity for structured data and About.

**Choice:** Record Stackstone Consulting, `https://stackstoneconsulting.co.uk/`, and Abingdon, Oxfordshire in the shared identity config for Milestone 9 consumption.

**Consequence:** Do not invent a street address, postcode or social profiles. Amendment 6 resolves the game's canonical domain/planned API origin in D27; the organisation site is a distinct URL and the always-on server host remains unchosen.

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

### C5 — Owner-resolved Traitor task lifecycle

**Context:** §22 gave task defaults; the owner has since supplied lifecycle, report, cancellation and reassignment rules.

**Choice:** Assign cycle 1 tasks at each Traitor's DEAL acknowledgement, using the same-shaped decoy for Faithful. Assign next-cycle tasks at DAWN in the uniform private moment. The active period ends at the start of the next SHADOW. At that SHADOW all living players receive the same report screen: Traitors report done/missed; a missing report by deadline is missed; Faithful decoy answers are retained for awards. A shared task counts as done if any living Traitor reports done. If any living Traitor's current task is missed and the consequence is “lose next murder”, cancel all murders scheduled in that same SHADOW; DAWN says only “no one was taken”, indistinguishable from protection. Only Traitors learn privately that the missed task cancelled the murder. With zero murders scheduled there is no penalty and no carry-over. A task is void, with no penalty from it, if its Traitor is banished/departs before reporting. A recruit or activated sleeper first receives a task at the next assignment point. Pauses freeze deadlines. “None” only retains reports for reveal and awards.

**Consequence:** Do not reveal a task assignment, report or penalty to an unentitled viewer. Preserve the decoy shape for every living role. Record one assignment per seat at each applicable checkpoint and one report/result per living seat at the shadow close, including decoys, so secret task roles do not change public version increments. A shared task's final `complete` value is the OR of its members' successful reports; the independent “any living Traitor missed” penalty still cancels that shadow's murder.

### D12 — Owner-resolved sleeper activation

When the last Traitor is removed, an eligible living, non-departed sleeper activates at the next private moment only if endgame has not begun and more than three players remain. Otherwise the Faithful win immediately. A sleeper never activates in or after endgame. Recheck parity and the two-player win immediately after activation.

### D13 — Owner-resolved termination bound

Rule-progress transitions are deal, cycle steps and endgame rounds. Logistics commands do not increment the count; deadlines eventually fire. Maximum cycles are planned cycles plus three; reaching the cap starts endgame immediately. Every bot strategy must reach FINISHED within the bound while deadlines fire.

### D14 — Projection entitlement ruling

No-leak checks use each viewer's allow-list, including Traitor knowledge, an announced all-seeing host and spectator ghosts. The playing blind coordinator and administrators are never entitled to unfinished-game secrets.

### D15 — Recovery, late entry, endgame vote and shield rulings

PIN recovery revokes all previous devices on that seat. Adding a device needs both the PIN and confirmation from a device already attached. Late entrants are always publicly Faithful; remove random-from-reserve. Endgame abstention/missing votes mean “continue”. A collective ghost vote is a majority of voting ghosts; a ghost tie counts as no vote. Half-votes follow the configured cycle round-table tie rule. A shield expires at the end of the next DAWN whether used or not. Recruitment targets use the victim-selection rule; no response by deadline is a decline.

### D30 — §25 visual direction supersedes prior palette decision

**Context:** The owner explicitly replaces the earlier light public palette and reversible palette decision with candlelit visual direction.

**Choice:** Append §25 verbatim. Update only `theme.css` and contrast tests now; leave screen designs for Milestones 5, 6 and 9. Use the six exact owner tokens, system serif headlines and system sans body. Do not add textures or screen layouts as part of this token update.

**Consequence:** The former pending-palette entry in D22 is superseded. Keep the font-independent logo work and no-web-font requirement. Follow §25's screen-by-screen design-plan and Playwright review gate when those screens are built.

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

## Native browser execution — owner-approved CI location

**Context:** Replit's Nix environment launches the official WebKit binary but cannot create its headless EGL display. Chromium profiles, axe and Lighthouse have passed locally.

**Options:** Keep retrying incompatible native WebKit setup in Replit; replace WebKit with Chromium; or run the iPhone/iPad WebKit projects in the owner-approved GitHub Actions environment.

**Choice:** WebKit runs in GitHub Actions with the official system dependencies. Local verify may omit only the two WebKit projects and must print exactly `WebKit profiles run in CI`; CI never omits them.

**Consequence:** Do not spend further Replit runs on EGL workarounds. Milestone 0 remains provisionally accepted until the first fully green Actions run; Milestone 1 is separately approved to proceed.

## Authority and approval

All supplied specification parts and amendments are saved in `SPEC.md` in numerical order. PLAN was approved; the reviewer approved Milestone 1. The owner explicitly authorised continuing Milestones 2 and 3 without pausing for review between them. Milestone 0's remote WebKit acceptance remains pending.

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

## D3 — Milestone 0 acceptance and dependency remediation (resolved locally)

**Context:** The owner required every patchable advisory to be fixed, removal of the unused preview scaffold, and a maintained Lighthouse alternative before accepting any development-only exception. Milestone 0 has since been verified locally with its retained gates.

**Options:** Patch affected dependencies; replace the Lighthouse CLI while retaining Lighthouse; or use an owner-approved, expiring exception only if no maintained alternative exists. No production-tree exception is allowed.

**Choice:** Patched `brace-expansion`, removed the unused component-preview scaffold and its `braces` dependency, and replaced Lighthouse CI CLI with Lighthouse's maintained Node API driven by Playwright Chromium. No exception list is needed or permitted for the current dependency tree.

**Consequence:** The local dependency audit has no high or critical findings. Milestone 0 remains provisional only until the first green GitHub Actions run includes WebKit; this does not block the already-authorised engine work.

## D4 — Baseline headers and built response tests (resolved)

**Context:** The owner chose a stricter referrer policy because join links carry tokens and clarified that the inline-script prohibition applies to production builds.

**Options:** Use the specification's baseline policy or the owner-approved stricter policy; treat development tooling as production code or test the built production server.

**Choice:** Keep `Referrer-Policy: no-referrer` and the existing regression test. Check security headers and emitted HTML on the built production response server; development tooling is exempt from the no-inline-script requirement.

**Consequence:** Built responses are tested for the stricter policy, nonce-based CSP, and absence of inline production scripts. No preview security bypass is allowed.

## D5 — Brand palette and contrast (resolved by SPEC §25)

**Context:** The owner's visual-direction amendment supersedes the prior light palette and the earlier brand-colour decision. Gold is not suitable for ordinary text on all surfaces.

**Options:** Keep the initial light brand palette or use the approved candlelit brown-and-gold direction with tested AA pairs.

**Choice:** Use Peat, Walnut, Bark, Gilt, Candle and Ash tokens from §25; Gilt normal-size text only on Peat/Walnut where measured contrast passes. System serif headlines and system sans body; no web fonts.

**Consequence:** Update tokens and contrast tests only ahead of the visual milestones. Screen redesign remains assigned to Milestones 5, 6 and 9; preserve the regression test.

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

## D8 — Verification layers and scenario runner (resolved in milestones)

**Context:** SPEC §18 requires real engine, server and browser complete-game evidence, but Milestone 2 precedes server/browser implementation.

**Options:** Mark the specification's eventual full-stack/browser suites as passed before their layers exist; or implement the real engine-level samples now and explicitly keep later suites pending.

**Choice:** `pnpm run verify` runs the engine sample sweep, five games per covering row, deterministic fuzz and YAML goldens. `pnpm run verify:full` runs the full-volume engine suite and writes `docs/SCENARIO_REPORT.md`. The real report lists unimplemented server/browser/capacity layers as NOT RUN.

**Consequence:** No pending layer counts as a pass. HTTP/socket and restart tests land in Milestone 4, browser complete games in Milestone 5, complete golden/game features through Milestone 7, and full capacity/soak/mutation evidence in Milestone 10. A report at Milestone 2 is not production approval.

## D9 — Covering-array generator and independent reference (resolved)

**Context:** §18 requires constrained three-way coverage of all rule-affecting settings, plus two-way at larger seat counts, and a separately written reference implementation.

**Options:** A small reproducible in-repository constraint-aware generator with independent coverage verification; or an exactly pinned maintained generator justified by capability/maintenance/cost. Reference logic must not reuse engine decisions.

**Choice:** Use a deterministic constrained generator implemented in-repository, with an independently written checker that re-enumerates legal three-way tuples. No generator dependency. Pin `yaml` 2.9.0 for readable golden scenario files. The separately written reference model replays events and independently checks eliminations, winners and the currently implemented pot state.

**Consequence:** Record the generator algorithm, fixed seeds, covered/total legal tuples and excluded invalid tuples in every report. Future Must rules extend the factor model. The reference currently treats pot as unchanged because mission/pot events are scheduled for Milestone 7; do not claim pot behavior is cross-checked until then.

## D10 — Durable deadline scheduler and authentication library (partly resolved)

**Context:** §4 permits a one-second durable deadline poller or pg-boss; sign-in requires a maintained library and §13's real provider/session controls.

**Options:** PostgreSQL-backed deadline polling or justified pg-boss; maintained identity-library approaches allowed by §4, evaluated against provider support, PKCE/nonce checks, Postgres sessions, deletion callback and approved costs.

**Choice:** Use a PostgreSQL deadline poller claiming due rows with `FOR UPDATE SKIP LOCKED`, with no new queue service or Redis. Choose and pin a maintained WebAuthn library during Milestone 8; SimpleWebAuthn is the initial candidate under §24, subject to compatibility and security review.

**Consequence:** Scheduler implementation belongs to Milestone 4 and must survive restart/multi-instance claims. Do not add mock authentication or hand-written passkey validation; coordinator production journeys remain unavailable until real passkeys exist. Optional Google/Microsoft providers require owner-supplied configuration.

## D11 — Could features versus planner extensions (resolved)

**Context:** §7 recommends the seer as a spare-time extension, but §8/§19 classify seer as Could. Similar configurable entries exist for Could powers.

**Options:** Keep Could features disabled/unbuilt until requested; or explicitly approve a particular Could feature and add it to scope/testing.

**Choice:** The planner offers only features already built and enabled. Omit Seer and every other Could item from planner extensions until the owner requests them.

**Consequence:** Could values stay disabled/unbuilt in the parameter model and planner. Tests must not treat an unavailable feature as an available timetable option.

## D12 — Sleeper/terminal-state precedence (resolved by owner)

**Context:** §5 prevents a Faithful win while a sleeper is waiting; §17 also requires only-Faithful states to end at once. Sleeper activation is limited to before endgame.

**Options:** Treat “only Faithful” as excluding an eligible waiting sleeper, with explicit activation precedence; or give immediate terminal-state rules priority. Define behaviour if a sleeper is waiting at endgame/two-player thresholds.

**Choice:** When the final Traitor is removed, an alive, non-departed eligible sleeper activates at the next private moment only if the endgame trigger has not been reached and more than three players remain. Otherwise the Faithful win immediately. A sleeper never activates in or after endgame.

**Consequence:** Run parity and two-player win checks after activation. This precedence applies to engine, reference, scenarios and planner estimates.

## D13 — Termination bound and manual controls (resolved by owner)

**Context:** §5 demands every game ends within a computed maximum number of steps; §11 allows pause, extend and schedule shifts without explicit limits, and manual advancement is supported.

**Options:** Bound only rule-progress transitions with explicit exclusions for logistics/waiting; or impose owner-approved limits/forced closure for all commands/time.

**Choice:** A step is a rule-progress transition (deal, cycle step, endgame round), not pause/extend/shift/undo. Deadlines must eventually fire. Maximum cycles equal the planner cycle count plus three; when reached, begin endgame immediately.

**Consequence:** Under every bot strategy, with deadlines firing, each game reaches FINISHED within the bound. This is a property test; logistics actions cannot extend the rule-progress bound.

## D14 — Secrecy assertions and entitled viewers (resolved by owner)

**Context:** §8 allows Traitors to know other Traitors; §6/§11 allow configured ghost spectators; §3 allows announced all-seeing host mode. §18's broad “no ... another seat's role” payload assertion needs those entitlements expressed explicitly.

**Options:** Apply the no-leak assertion to each viewer's configured allow-list, including deliberate host/spectator entitlements; or prohibit those modes by an explicit scope change.

**Choice:** Test no-leak against each viewer's explicit allow-list, including legitimate Traitor knowledge, an announced all-seeing host and spectator ghosts. Blind coordinators and admins are never entitled to unfinished secrets.

**Consequence:** Apply the same policy to projections, HTTP responses, socket payloads, DOM, browser storage, URLs and logs. All-seeing mode must be announced to every player before joining.

## D15 — Seat/device recovery and later-rule details (resolved by owner)

**Context:** §9 allows multiple devices per seat but recovery says the old device leaves. Several rule paths do not yet define all boundary outcomes.

**Options:** Distinguish authorised additional devices from recovery migration; or revoke all prior seat devices on recovery. Clarify reserve roles/late joins, unanimous endgame with abstentions, ghost collective/half-vote ties, shield lifetime when no murder occurs, and recruitment selection/no-response mechanics.

**Choice:** Recovery revokes every earlier device on that seat. Adding a second paired-seat device requires confirmation on a device already on the seat plus the PIN. Late joiners are always Faithful; remove random-from-reserve. Missing/abstaining endgame votes mean continue. Ghost collective vote is a majority of ghosts who voted, with ties as no vote; half-vote round-table ties use the configured rule. Shields expire at the next DAWN whether used or not. Recruitment targets use the victim-selection rule; no response by the deadline is a decline.

**Consequence:** These owner rules override conflicting specification options and are test requirements for their assigned milestones. Seat recovery and recruitment delivery remain later server milestones.

## D16 — Owner identity and brand decisions

**Context:** §19 expressly leaves these values open.

**Options:** Keep placeholders; or use values explicitly confirmed by the owner.

**Choice:** The owner selected Turnstone, tagline “Turnstone: the traitor game where everyone plays.” and byline “A Stackstone game”. Amendment 5 supplies the organisation site/location and SVG brand assets; Amendment 6 resolves the canonical site and production passkey RP ID. Section 25 resolves the dark visual direction. Keep system fonts and the 30-day retention default. Leave unconfirmed:

- Crawler policy (implement the specified configurable default only when authorised).
- Change-freeze dates.
- Stackstone social links beyond the confirmed main site.

**Consequence:** Use one identity config and the outlined brand mark. The owner-reported preliminary name search is not legal clearance; trade mark/domain/handle checks remain pending. Do not invent a legal approval, social account, hosting choice or change-freeze date.

## D17 — Milestone 1 review approval (resolved)

**Context:** The owner reported that their reviewer approved Milestone 1 and asked that work continue into Milestones 2 and 3.

**Options:** Keep Milestone 1 in review; or record the explicit reviewer approval and proceed.

**Choice:** Milestone 1 is approved. Continue Milestone 2 then Milestone 3, with a green local `pnpm run verify` gate at each milestone.

**Consequence:** This approval does not waive the still-provisional Milestone 0 GitHub Actions/WebKit acceptance, any milestone gate, or the no-deployment rule.

## D18 — Push and secret scanning after each green milestone (resolved)

**Context:** The owner connected the Turnstone repository and requires each green milestone to be pushed when this Repl has push access; GitHub CI provides the approved WebKit environment.

**Options:** Rely on local verification alone; or scan and push the exact green milestone commit to `origin/main`, leaving owner Sync as the fallback when credentials do not permit push.

**Choice:** Before every push, inspect the staged file list and confirm that no secrets, tokens, `.env` files or credentials are staged. CI scans full Git history using the checksum-verified pinned Gitleaks CLI described in D38.

**Consequence:** If this Repl cannot push, record that fact in `PROGRESS.md` and ask the owner to press Sync. A push targets `main` only; no release promotion or deployment is authorised in this work.

## D19 — Pre-launch privacy flag (resolved; implementation assigned to Milestone 9)

**Context:** Until the owner declares launch, every preview and production response must be excluded from indexing.

**Options:** Apply scattered route-specific noindex rules; or use one configuration flag that controls response headers and robots policy.

**Choice:** Implement one pre-launch flag: while enabled, every response carries `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallows everything. Turn it off only at launch in one configuration change; the normal crawler policy applies only then.

**Consequence:** Add a test for every response class and robots output when the public response/server work is introduced. No preview or production deployment is permitted here.

## D35 — Planner time windows and available extensions (resolved)

**Context:** §7 plans across blocked periods, overnight quiet hours and clock changes, while §11 permits pausing/shifting a timetable and D11 limits extensions to built, enabled features.

**Options:** Treat every time as a fixed UTC wall-clock value; or store absolute UTC instants and interpret recurring quiet hours in the organiser's IANA time zone. For extensions, add every §7 suggestion regardless of whether its rule is available; or offer only extensions that can be represented without changing rules or exposing hidden eligibility.

**Choice:** Plan start/end and blocked-window boundaries as absolute instants; evaluate recurring quiet hours in the supplied organiser time zone for each local date, then convert them to instants so DST changes are respected. A scheduled phase must fit wholly outside blocked and quiet intervals. If no contiguous slot can fit a phase, return `STEP_CANNOT_FIT`; if a complete compressed timetable exceeds the horizon, return `WINDOW_TOO_SHORT` with the required minimum duration. Plans are estimates and do not claim the game will use every scheduled step.

The Relaxed option lengthens debates and adds one extra mission only when the full option fits; otherwise it falls back to the longer-debate option without the extra mission. Compression follows the §7 order, skips adjustments that cannot change the plan, and never raises the final size above eight. Do not schedule a forced-recruitment night because recruitment eligibility depends on hidden game outcomes and the planner must not override the configured trigger. D11 excludes the Seer and all other Could extensions.

**Consequence:** Quiet hours cannot be bypassed to force a step into the horizon. A coordinator can shift the schedule through the later console, but this planner itself returns explicit estimates/errors and never reads hidden role state.

## D36 — Visitor projection and private-moment uniformity (review findings)

**Context:** The reviewer found that the existing visitor view exposed seat names and revealed ballots, and identified text-length and target-list differences that could reveal roles during private moments.

**Options:** Reuse the full participant view for visitors and rely on the UI to hide fields; or use a separate strict visitor schema and explicit allow-list. For role-uniformity, use fixed decoy wording and role-filtered targets; or balance decoy text lengths and render target options without role-dependent treatment.

**Choice:** A visitor receives only `exists`, `phase`, `lobbyOpen` and `seatCount`; a separate strict schema and allow-list enforce this in the projection. A property test exercises a visitor view after ballots are revealed and proves no names, ballots, pot or commitment are present. Milestone 5 must select decoy instructions randomly from a pool matched to the task library's text-length distribution and compare text-length bands across roles. Its shadow-choice UI must render every other living seat, including fellow Traitors, without hiding, disabling or restyling by role; a rejected friendly-fire choice follows the same confirmation layout before privately showing “choose someone else”.

**Consequence:** Visitors cannot inspect participant data before taking a seat. The text-length, option-list and friendly-fire interaction assertions remain Milestone 5 browser-uniformity acceptance tests; they are not claimed complete before that UI exists.

## D37 — Stackstone talk-slide visual direction (resolved by owner)

**Context:** The owner replaced the candlelit deep-brown visual direction with the look of the Stackstone talk slides. The new direction also specifies Playfair Display and DM Sans, conflicting with the earlier system-font/no-web-font rules.

**Options:** Keep the prior palette and system fonts; or apply the revised §25 tokens and typography while preserving existing foundation-screen aliases until their screen milestones.

**Choice:** Use Charcoal `#3D3A38`, Hearth `#2E2B29`, Stone `#55504B`, Gilt `#C8944A`, Candle `#FAFAF5` and Ash `#D4CDC4`. Use Playfair Display 400 for headlines/subtitles and DM Sans 400/500 for body/buttons/labels. Self-host subsetted Latin WOFF2 files with SIL Open Font Licence files, no Google-hosted fonts, within the separate 80 KB font budget; preload on public pages and before private moments, use immutable caching and size-adjusted swap fallbacks. This §25 decision supersedes §20's no-web-font rule. Existing foundation-screen aliases remain stable until the relevant screen milestones adopt the new direction.

**Consequence:** Contrast tests now cover all primary/secondary text against Charcoal, Hearth and Stone; Gilt is tested at the large-text threshold on Charcoal and excluded from small text there. The theme tokens and design plans are updated; font assets/loading and screen styling remain for their planned milestones.

## D38 — Open-source Gitleaks CLI with a verified release checksum (resolved)

**Context:** The reviewer noted that `gitleaks/gitleaks-action` can require a paid licence for GitHub organisation repositories, while full-history secret scanning is required before every push and in CI.

**Options:** Keep the action and depend on repository account/licence configuration; or download the upstream CLI release directly and verify its published checksum before execution.

**Choice:** Use Gitleaks v8.30.1 on the Ubuntu x64 runner. Download the archive and the release's official `gitleaks_8.30.1_checksums.txt`; require exactly one matching Linux x64 entry, compare it with the pinned SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, and run `sha256sum --check --strict` before extracting or executing the binary. Scan all refs and history with `gitleaks git --redact --log-opts="--all" .`. A pipeline regression test requires the pinned version, checksum verification before execution, full-history scan, and absence of the licensed action.

**Consequence:** Secret scanning uses no paid licence or token. Missing, duplicated or mismatched checksum records fail CI before Gitleaks runs; any detected secret fails the scan.

## D41 — Milestone 0 and Milestone 3 reviewer approvals (resolved)

**Context:** The reviewer confirmed that GitHub Verify runs #2 and #4 were fully green, including both WebKit profiles, and approved Milestone 0 and Milestone 3. The reviewer also asked why Verify run #3's scenario job was cancelled.

**Options:** Keep the previous provisional/pending status; or update the record from the completed GitHub runs and reviewer decision.

**Choice:** Record Milestone 0 and Milestone 3 as approved. Verify run #3's scenario job reached its configured 15-minute limit and was cancelled before the subsequent push; `cancel-in-progress` was not the cause.

**Consequence:** Milestone 0's WebKit gate is satisfied. Milestone 3 needs no further work. Milestone 2 remains unaccepted until its differential reference implementation meets the reviewer's findings and the sample is rerun green.

## D42 — Independent scenario oracle review correction (resolved; pot check pending Milestone 7)

**Context:** The reviewer found that the first reference model trusted engine elimination events and could not detect incorrect votes, murders, shields, missed-task handling or parity. The report also must not claim an independent pot comparison before missions exist.

**Options:** Keep the former outcome-only replay; or independently derive rule outcomes from public event inputs and recorded random draws, then compare engine events.

**Choice:** Replace the outcome-only replay with an independent model that tallies ballots, validates exact random candidate sets and choices, resolves shadow picks, shields, task cancellation, sleeper activation/D12, recruitment trigger eligibility, parity and terminal events. Random choices are now recorded in events. A scripts-only fault-injection seam tests five required engine faults plus an incorrect random candidate set. The report labels pot validation `pending Milestone 7`; it does not compare the model's pot placeholder with engine state.

**Consequence:** The reviewer accepted Milestone 2 based on GitHub Verify runs #8, #9 and #13; the deterministic sample and oracle mutation checks are green. Pot validation remains explicitly pending Milestone 7. Recruitment offer/response outcomes will be added to the oracle when those engine events exist; this deferred comparison does not block the accepted Milestone 2 scope.

## D43 — Unanimous Traitor decision after its re-vote (resolved)

**Context:** §6 configures victim choice as “Unanimous with re-vote”, but does not state what happens if the Traitors still disagree after that re-vote. The current engine treats the setting like a majority choice, which is not a justified interpretation.

**Options:** Apply the configured no-decision rule after one split re-vote; cancel the murder; or continue private re-votes until unanimous.

**Choice:** Allow exactly one re-vote, then apply the configured no-decision rule if the Traitors still disagree. With one living Traitor, that Traitor's submitted choice is automatically unanimous. Every SHADOW always contains two equal hidden choice windows for every living player, even when the first choices agree. Traitors see each other's live picks in both windows; Faithful see same-shaped decoys for the same total duration, so no one can infer whether a re-vote occurred.

**Consequence:** The engine uses a fixed midpoint transition and resets second-window picks before resolving the murder. A golden complete game covers a split after re-vote; the independent oracle validates the configured fallback and exact random candidate set. Do not reveal the re-vote to Faithful, visitors, the coordinator or presenter.

## D44 — Sequential murder slots and terminal dawn outcomes (resolved)

**Context:** The first full sample after strengthening the differential oracle found two linked outcome mismatches in multi-murder cycles: the engine could reuse an already-consumed Traitor pick (or invent another victim under the `no murder` fallback), and the engine announced later victims even when parity or the two-player rule ended the game after an earlier removal. The independent reference also initially predicted every selected victim without applying the immediate-finish rule within the dawn batch.

**Options:** Treat all configured murders as one fixed target list regardless of intervening eliminations; or resolve each slot against the remaining eligible choices and stop when the game's win conditions end play.

**Choice:** For each murder slot, exclude targets already selected and resolve the current picks under the configured choice/no-decision rules. If no eligible current pick remains, use the configured no-decision outcome; `no murder` does not invent or carry a later victim. Build `DawnResolved.victims` sequentially and stop at the first no-Traitor, parity or two-player finish, with the normal per-removal win check. The independent oracle separately derives this truncated list from roles, config, choices, shields, task reports and recorded random choices. Golden behavioral assertions such as “split after re-vote” are stored separately from the expected game outcome.

**Consequence:** Regression tests cover a missing second murder choice and a multi-victim dawn that ends on its first removal. The reference-model test proves it stops its expected victim list at that same terminal boundary. The first failing sample's 45 simulation seeds now replay without differential failures. The fresh sample and full local `pnpm run verify` are green; GitHub Actions validation is pending.

## Dependency record

This is the foundation's previously recorded inventory, **not** a new install/audit or a complete claim of pinning compliance. New product/tooling direct dependencies were pinned; inherited scaffold manifests still require review for §1's exact-pinning requirement. Workspace references use `workspace:*`.

| Group                                                                      | Recorded purpose                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript 5.9.3, ESLint 10.12.0, typescript-eslint 8.71.1, Prettier 3.9.6 | Strict typing, lint/format                                                                     |
| Vitest 5.0.3, fast-check 4.10.2                                            | Unit/property falsification                                                                    |
| Supertest 7.3.1, types 7.2.1                                               | Real HTTP integration testing                                                                  |
| Playwright 1.64.0                                                          | Four browser/device profiles                                                                   |
| axe-core 4.14.0, @axe-core/playwright 4.13.0                               | Automated accessibility                                                                        |
| Lighthouse 13.5.0 Node API                                                 | Maintained Lighthouse audits against Playwright Chromium without the vulnerable CLI dependency |
| yaml 2.9.0                                                                 | Parse readable golden scenario fixtures                                                        |
| Socket.IO/server and client 4.8.4                                          | Future realtime/testing; no active gameplay socket                                             |
| Express 5.2.1, Zod 3.25.76, Drizzle 0.45.2, pg 8.23.0                      | HTTP validation and PostgreSQL                                                                 |
| React/DOM 19.1.0, React Router 7.18.4, Query 5.102.8                       | Browser rendering/routing/server-view tooling                                                  |
| Vite 7.3.6, React plugin 5.2.0, Tailwind/plugin 4.3.3, tsx 4.23.13         | Dev/build and typed response/migration tools                                                   |
| Existing Pino/logger build dependencies                                    | Safe lifecycle logging; exact-pin review outstanding                                           |

Patched transitive overrides recorded previously: `proxy-addr`, `source-map-js`, `tmp`, `basic-ftp`. Keep advisories included; do not use this record as evidence that the audit is now green.

## D39 — Owner-authorised GitHub push via GIT_URL (rejected)

**Context:** The owner authorised a push to `WhisperingSquirrel-TD/Turnstone` using the Replit secret named `GIT_URL`, superseding the earlier workflow-scope workaround. A presence-only check returned `GIT_URL present`.

**Options:** Inspect and persist the credential; use it only by reference in the push command; or use Replit's Git connection or an owner-operated push.

**Choice:** Use the secret only by reference in `git push "$GIT_URL" main:main`. Do not display, inspect, persist or write it into Git configuration, remotes, files, commits or logs. Keep `origin` as the plain HTTPS repository URL.

**Consequence:** GitHub rejected the push for repository access or authentication. `git fetch origin` succeeded; the remote and `.git/config` were verified credential-free. The remote branch did not move. The detailed push output was withheld to avoid exposing any credential-bearing URL.

## D40 — Fine-grained repository token for Git pushes (resolved)

**Context:** The owner created a fine-grained token restricted to `WhisperingSquirrel-TD/Turnstone`, with Contents and Workflows read/write permission and a 90-day expiry, stored as the Replit secret `TURNSTONE_GITHUB_TOKEN`.

**Options:** Continue using the rejected `GIT_URL`; use the new token only through a one-off credential helper; or rely on Replit Sync.

**Choice:** Do not use `GIT_URL` again for this repository. Use `TURNSTONE_GITHUB_TOKEN` only by reference through a one-off Git credential helper at runtime. Never display, inspect, persist, or store the token in a remote, file, commit, or log.

**Consequence:** The five restored commits were pushed successfully to `main` at `c39fc9899b6f31626c23b57012e192bae815d3aa`. The remote and `.git/config` remain credential-free. GitHub Verify run #2 completed successfully with every job green; the promotion workflow was skipped.

## Approval request boundary

Owner approval requested for PLAN, with unresolved choices above kept explicit. Plan approval is not a deployment instruction, acceptance of red verification, approval of Could features, or permission to guess missing rules. No Milestone 1 implementation has started.

## D45 — Scenario CI execution split by suite (resolved)

**Context:** GitHub Actions Verify run #6 for `f6fc040e8f78b89d36ba184c4b1bb65424bc6002` completed on 13 October 2026. Static checks, unit, property, PostgreSQL integration, Lighthouse, audit, Pixel Chromium, desktop Chromium, iPhone WebKit and iPad WebKit all succeeded. The single scenario job was cancelled at its configured 15-minute limit; no push occurred during the run, so `cancel-in-progress` was not responsible. The local complete sample had already measured 2,567 games in 472,339 ms on a multi-worker container.

**Options:** Raise the scenario job timeout; reduce or skip sample coverage; or preserve the sample and divide its independent categories into separately visible CI jobs.

**Choice:** Keep the 15-minute job limit and all sample cases. Run the core sweep, three-way array, high-seat pairwise array, and fuzz/golden scenarios as a four-entry matrix. Each job builds only its requested suite; a regression test checks that the matrix matches the runner's suite list and that the four plans are disjoint and retain the full expected counts and independent coverage checks.

**Consequence:** No scenario is dropped or sampled less often. Local `pnpm run verify` still runs the combined 2,567-game sample and writes the complete report. GitHub Verify run #7 is required to confirm every suite finishes within its own budget before Milestone 2 is accepted or Milestone 4 begins.

## D46 — Further split high-seat scenario workload (resolved)

**Context:** GitHub Actions Verify run #7 for `6251d6baa9afeb6bb41fb48b7d7307bcda6cd1ad` completed on 13 October 2026. Static checks, unit, property, PostgreSQL integration, audit, Lighthouse, all four browser profiles, core sweep, three-way coverage, and fuzz/golden scenarios succeeded. The 792-row high-seat pairwise job was cancelled at its configured 15-minute limit; no subsequent push occurred, so this was not `cancel-in-progress`.

**Options:** Raise the timeout; sample fewer high-seat rows; or subdivide the unchanged pairwise workload into smaller, independently checked jobs.

**Choice:** Keep every generated pairwise row and the 15-minute limit. Split high-seat jobs into four deterministic shards of 198 games. Balance estimated work using each row's player count squared, keep the full pairwise coverage check in each shard, and test exact seed partitioning, row counts, workload balance and CI-matrix parity.

**Consequence:** The full local scenario report remained unchanged. Commit `7594c18` passed Verify run #8 (`38458930078`) on 13 October 2026: all seven scenario entries, static/unit/property/integration/audit/Lighthouse checks, four browser profiles and required-checks succeeded. This run does not close reviewer concerns subsequently raised about oracle mutation evidence and scenario-job flakiness; Milestone 2 is not reviewer-accepted. D48 supersedes this decision's four-entry-matrix choice.

## D48 — Six-shard scenario CI with complete-report gate (resolved)

**Context:** The owner’s reviewer confirmed that Verify #3 exceeded the scenario job limit at 15m25s and Verify #5 exceeded GitHub’s 15m00s maximum. The required-checks aggregator failed for incomplete scenario runs. This was workload exhaustion, not `cancel-in-progress`. The sample contains the complete core sweep, three-way array, high-seat pairwise rows, fuzz set and golden cases; removing rows or increasing the time limit would weaken the intended fast CI gate.

**Options:** Raise the CI timeout; reduce or omit sample coverage; or split the same deterministic work across parallel shards and prove the complete union.

**Choice:** Use six deterministic, cost-balanced shards. Keep every repeated game for one coverage row together; assign every generated row to exactly one shard. Each shard writes a partial report with coverage IDs, measured wall time and a per-seat-count game profile. A required merge job rejects missing/duplicate/unexpected rows, a missing shard, or actual/projected shard time over five minutes. The shard workflow has a ten-minute timeout only as a safety margin. The initial plan-time projection is 50 seconds for planning/start-up plus 0.70 ms per seat-square workload unit. Upload the merged `SCENARIO_REPORT.md` as a short-lived CI artifact. Artifact actions are pinned by full commit SHA.

**Consequence:** No sample row or suite is dropped. Verify #12 (`38480622636`, commit `d1ada52`) and #13 (`38482305521`, commit `a77497c`) each passed all 18 jobs, including the four browser profiles, six shards, the coverage merger and required-checks. Both mergers verified all 2,522 rows. Run #12 shard actual times were 56,859, 84,126, 84,272, 76,661, 76,598 and 61,934 ms; run #13 measured 62,489, 83,940, 78,129, 62,199, 84,404 and 78,430 ms. Projections remained 264,417–266,650 ms. Every shard stayed below five minutes; the maximum actual was 84,404 ms, so the post-optimization projection is conservative. Run #12's Node 20 artifact-action annotations are resolved in D51; run #13 had none. This does not waive Milestone 2's differential-oracle review.

## D47 — Milestone 4 backend infrastructure choices (resolved; acceptance pending)

**Context:** The server/realtime implementation needs durable state and deadlines, cross-instance pushes, admission control and measurable local checks while remaining within the free-tier restriction. Coordinator passkey sign-in is Milestone 8; the server must not simulate an identity before then.

**Options:** Keep authoritative state or deadlines in process memory; add a separately paid Redis/queue service; or use PostgreSQL transactions and claims. For realtime, use a paid Redis adapter or PostgreSQL notifications.

**Choice:** PostgreSQL is authoritative for append-only events, snapshots, idempotency, deadlines, active-game counts and pseudonymous rate-limit buckets. Use transactional optimistic versions and `FOR UPDATE SKIP LOCKED` deadline claims; use PostgreSQL notifications for cross-instance Socket.IO fan-out. Apply the 80%-of-configured-capacity refusal only to new-game creation. Keep the coverage gate at 85% lines for the declared API runtime modules, with bootstrap and test harness excluded. Keep reduced-scale performance evidence in `docs/CAPACITY.md`; do not extrapolate to production capacity.

**Consequence:** No Redis, paid service, or Replit-only runtime feature was added. The initial backend commit passed GitHub Verify run #9 (`38469104044`) with all 18 jobs green, including both WebKit profiles. At that 13 October checkpoint, capability identity, PIN/device recovery, fault games and portability remained open; the 14 October implementation and local verification are recorded in D58 and the current Milestone 4 progress section. The completed Milestone 4 push passed Verify #14 with all 18 jobs green and no annotations.

## D49 — Browser smoke tests use a dedicated Vite server locally and in CI (resolved)

**Context:** The local smoke run checked the pre-launch `X-Robots-Tag` but received no header because its base URL was `localhost:80`, the Replit preview proxy, and only CI started the test-owned Vite server. After both environments used the dedicated server, Replit's app preview occupied port 22814 and prevented the test server from starting. The assertions were correct; the local test target needed its own port.

**Options:** Weaken the header assertion; keep testing through the preview proxy; or have both local and CI Playwright runs start and test the same dedicated Vite server.

**Choice:** Keep the assertions and configure Playwright's local and CI runs to launch the party-game Vite server on dedicated port 3000. Local smoke continues to skip WebKit only with the explicit `WebKit profiles run in CI` notice; CI runs all four device profiles.

**Consequence:** The regression test failed on the previous conditional configuration, then passed after the change. A pipeline test now guards the dedicated port against the running Replit preview. Both local browser profiles passed against the dedicated server, including the pre-launch header check. GitHub Verify #12 passed Pixel Chromium, desktop Chromium, iPhone WebKit and iPad WebKit. The run also confirmed the reducer performance fix; its non-blocking artifact-action runtime warnings are recorded in D51.

## D50 — Event reducer uses copy-on-write (resolved; CI confirmed)

**Context:** Verify #11's CI sample profile showed average game time rising from 163 ms at 15 seats to 2,982 ms at 40 seats, with high-seat outliers. A V8 profile of a reproducible 40-seat game attributed 539.5 ms to `evolve` and 133.5 ms to `structuredClone`; `evolve` deep-cloned the entire authoritative state for every event. This repeated work grew with both event count and state size.

**Options:** Keep the whole-state clone; make state mutable and weaken replay guarantees; or preserve immutable state while copying only branches an event changes.

**Choice:** Use event-level copy-on-write in `evolve`. Unchanged branches are shared; changed arrays, records and seat/task objects are copied before updates. Keep event-schema validation, prior-state immutability, full replay equality and the scenario checks.

**Consequence:** A regression test first failed because `evolve` cloned an unchanged config branch. After the change it passed, along with the targeted engine/scenario tests and type-check. The same local 40-seat game completed in 456 ms, and `structuredClone` no longer appeared among the top CPU-profile frames. GitHub Verify #12 and #13 measured 40-seat averages of 711 and 729 ms/game (maximums 2,112 and 2,427 ms), versus 2,982 ms/game before the change: about a 75% reduction. The 15-seat averages were 79 and 80 ms/game. All 2,522 coverage rows and the termination property passed in both runs; full local verification also passed. The engine's independent pot check remains explicitly pending Milestone 7.

## D51 — Pin Node 24 artifact actions (resolved; CI confirmed)

**Context:** Verify #12 passed every required job, but its public annotations warned that the pinned upload/download artifact actions targeted Node 20 and were being forced to run on Node 24. The warning appeared on the six scenario shards and report merger; it did not fail verification.

**Options:** Leave the old action versions and warning, or move to maintained Node 24 releases with full commit-SHA pins and a regression check.

**Choice:** Pin `actions/upload-artifact` v7.0.2 to `cf430e030ddbb5b0abf93d22962f4752f3646cd9` and `actions/download-artifact` v8.0.2 to `9000827ccba6bdab643e8b6fd33ac0654aef8333`. Their official `action.yml` files declare `runs.using: node24`. Add a pipeline test for the exact pins. The Verify #12 promotion check was skipped; this change does not enable deployment.

**Consequence:** The new regression test failed against the prior pins, then passed after the update. Full local `pnpm run verify` is green. GitHub Verify #13 (`38482305521`, commit `a77497c`) passed all 18 jobs, and every public check run had zero annotations, confirming the Node 20 warnings are gone. The promotion run was skipped. No deployment or paid service is authorised.

## D52 — Separate scenario bot randomness from engine randomness (resolved)

**Context:** The new real-server replay test compared a deterministic scenario's event trace with the same commands sent through PostgreSQL and Socket.IO. Random endgame tie-breaks diverged even though the API used the same seed. Scenario bot decisions were consuming the engine's random stream, while a real server replay receives already-chosen bot commands and must not consume those extra draws.

**Options:** Keep one shared random stream and accept that scenario command traces cannot replay through the server; change only the server's random position; or give bot behaviour and engine decisions separate deterministic streams.

**Choice:** Keep the engine stream seeded directly for engine decisions and derive an independent deterministic stream for bot choices. Production game randomness remains cryptographically secure; only the test harness injects seeded sources.

**Consequence:** Full 5-seat and 40-seat games now replay through real HTTP and sockets with exact persisted-event equality, private-view equality and a mid-game restart. Bot strategy choices no longer shift engine tie-breaks or deal randomness.

## D53 — One-time presenter pairing credentials (resolved)

**Context:** A TV or laptop presenter needs a public-info-only view without an account, while an uninvited visitor must not join a game's presenter room.

**Options:** Reuse a static game code, persist a reusable pairing secret, or issue a short-lived one-use credential and exchange it for a game-scoped session.

**Choice:** Generate a 256-bit random code, store only its SHA-256 digest, expire it after five minutes, and atomically permit one claim. Exchange it for a 30-day HttpOnly, Secure, SameSite=Lax, host-only session bound to that game. Return only the presenter projection and use generic failures for invalid or reused codes.

**Consequence:** Pairing and session state are PostgreSQL-backed and rate-limited. Tests verify one-time use, hashed storage, cross-game isolation, the cookie attributes, and private Socket.IO room access; no presenter secret is placed in a URL or browser storage.

## D54 — Milestone 2 accepted by reviewer (resolved)

**Context:** The owner’s reviewer accepted the scenario harness after the independent oracle, mutation checks, deterministic CI sharding and sample gates passed.

**Choice:** Record Milestone 2 as accepted based on GitHub Verify runs #8, #9 and #13, including all scenario shards. Keep the oracle-detected multi-murder/terminal-dawn engine regressions as permanent tests; do not weaken or remove them.

**Consequence:** Milestone 2 is closed. Continue from Milestone 4 under the owner’s autopilot rules; the incomplete 40-case §17 golden matrix and Milestone 7 pot check remain explicitly pending.

## D55 — Autopilot and review gates (resolved)

**Context:** The owner instructed continuous milestone work without waiting for review between steps.

**Choice:** Complete milestones in order with strict TDD and a green local `pnpm run verify` before each push. After every push, inspect the public GitHub Actions run for that commit, including job results and annotations; a red or cancelled run blocks the next milestone. Keep the “Status for reviewer” block at the top of `docs/PROGRESS.md` and update it at every push. Record questions in `docs/QUESTIONS.md` with a recommended answer and reasoning; use provisional, feature-scoped defaults only when safe.

**Hard stops:** Stop after Milestone 5 for the owner’s real-phone rehearsal review, and for payment, publishing, deployment, DNS/Vercel work, or any change to §3 security, privacy or secrecy principles. Stay on the free tier; use only `TURNSTONE_GITHUB_TOKEN` through the established one-off credential helper.

**Consequence:** No milestone is considered complete from local checks alone; its public CI result must also be green before work advances.

## D56 — Game-scoped coordinator capability (resolved)

**Context:** Milestone 4 must work before account/passkey sign-in exists, without giving the blind coordinator access to hidden game state.

**Choice:** Create a separate 256-bit opaque coordinator capability at game creation. Deliver it in a host-only, HttpOnly, Secure, SameSite=Lax, game-scoped cookie; persist only its SHA-256 hash and expiry. It authorises logistics commands and the coordinator allow-list projection only. Keep a nullable account-binding column so Milestone 8 can attach passkey identity additively. For transfer, use a short-lived, single-use handoff code claimed from the target’s already authenticated seat device; rotate the capability and revoke the prior token only when the target claims it.

**Consequence:** Coordinator identity is independent of guest seat identity. Handoff codes and raw capabilities never enter URLs or logs; the recipient must prove control of the selected game seat. The cookie/token lifetime follows the existing 30-day session default until the owner changes it.

## D57 — Rehearsal brought forward to Milestone 5 (resolved)

**Context:** The owner wants a playable phone experience as soon as possible.

**Choice:** Milestone 5 includes rehearsal: one real player on a phone, bots filling the remaining seats, fast timers, and all game commands/views flowing through the real server. Apply the confirmed Stackstone talk-slide style, self-hosted Playfair Display and DM Sans, and the role-uniform gold-seal hold-to-reveal. The previous Milestone 7 rehearsal item is moved here.

**Consequence:** At Milestone 5 completion, pause for the owner to play a full rehearsal game on a real phone via the Replit development URL. Keep the pre-launch noindex flag enabled; this is not permission to publish, deploy or enable a paid service.

## D58 — Guest capability, PIN lockout and device recovery (resolved)

**Context:** The owner required production game-scoped identity in Milestone 4 before account/passkey sign-in, while preserving the blind coordinator and no-secret logging rules.

**Options:** Use a test-only identity until Milestone 8; reuse one credential for seats and coordinator; or issue distinct game-scoped capabilities with separate viewer allow-lists.

**Choice:** Keep seat and coordinator credentials separate. Issue cryptographically random opaque capabilities, store only hashes, and deliver them in game-scoped host-only HttpOnly, Secure, SameSite=Lax cookies. Coordinator capability authorises logistics only. Five failed seat-PIN attempts lock recovery for 15 minutes and add a coordinator-only alert. Coordinator reset is publicly logged without recording the PIN. Successful recovery revokes all earlier device sessions and logs the move.

**Consequence:** Integration tests cover capability transfer, lockout/alert separation, reset without PIN disclosure, stale PIN rejection and old-device revocation. The full local `pnpm run verify` is green at 85.28% server line coverage. GitHub Verify #14 (`38524115466`, commit `1c8f52b`) passed all 18 jobs, including all six scenario shards, both WebKit profiles, report merge and required-checks, with zero annotations. Promotion run #14 was skipped; no deployment occurred.

## D59 — Single execution of integration tests in aggregate verify (resolved)

**Context:** `pnpm run verify` exceeded the local command budget because it ran `tests/database.integration.test.ts` once through `test:integration` and a second time inside `test:server-coverage`.

**Options:** Keep the duplicate run; remove the integration tests from the coverage gate; or retain both standalone commands while running the shared integration suite once in aggregate verify.

**Choice:** Keep `test:integration` available as a standalone command. The aggregate `verify` runs `test:server-coverage` once, which includes the database integration, HTTP and environment suites and enforces the same 85% server-line threshold. A pipeline regression test guards this composition.

**Consequence:** Integration coverage is not reduced or omitted; the full local `pnpm run verify` now completes within the available run budget and passes.

## D60 — Self-hosted typefaces without a runtime dependency (resolved)

**Context:** Milestone 5 requires Playfair Display 400 for headlines and DM Sans 400/500 for body text, self-hosted from the product origin, with both SIL Open Font Licence notices retained and a combined font budget below 80 KB.

**Options:** Load fonts from a third-party font service; keep system fonts only; or vendor the required Latin WOFF2 subsets and licence notices.

**Choice:** Vendor Playfair Display 400 and DM Sans 400/500 Latin WOFF2 files from the pinned Fontsource 5.2.6 packages. Keep each SIL OFL licence beside the assets. Remove the temporary package dependencies after copying; the product has no runtime font dependency or third-party font request.

**Consequence:** The three WOFF2 assets total 50,248 bytes, below the 80 KB budget. Serve them from the app origin with immutable one-year caching and use size-adjusted local fallback faces to limit layout shift.

## D61 — Same-origin development API proxy for mobile CSRF (resolved)

**Context:** The owner reproduced a persistent security banner and disabled join/rehearsal actions on an Android phone using the Replit development URL. The browser requested `/api-server/api/csrf`, which missed the API artifact’s declared `/api` route and fell through to Vite HTML instead of the API JSON response.

**Options:** Weaken CSRF or origin checks; point a phone at a loopback API address; add an application-level development proxy; or use the shared same-origin `/api` service route already declared by the API artifact.

**Choice:** In development, clear the configured base URL even when a production API origin variable is present, so `/api/csrf` and generated `/api/...` calls use the shared same-origin service path. Keep application runtime free of a custom Vite proxy; the isolated Playwright server may enable a test-only `/api` proxy. Keep the existing HttpOnly cookie and double-submit token validation unchanged. Add a mobile E2E regression on Pixel and iPhone that checks the JSON token response, cookie attributes, matching CSRF header/cookie, and enabled actions.

**Consequence:** A direct request to the shared `/api/csrf` route returns JSON and the Replit preview no longer shows the failure banner; join and rehearsal actions are enabled. The preview’s proxy supplies secure cookie attributes, and the browser successfully receives the token response without relaxing CSRF. Pixel and desktop Playwright regressions pass locally, including the assertion that rejects the old `/api-server/api/csrf` path. iPhone and iPad WebKit remain delegated to the configured GitHub browser jobs.

## D62 — Amendment 9 moves phone-first entry and public announcements into Milestone 5 (resolved)

**Context:** Real-phone feedback showed the existing form-first `/play` experience was too dense and assumed a room display. The owner specified E1–E4 entry, an organiser-as-player lobby, phone-only public announcements, a presenter off by default, and a limited public-home subset.

**Choice:** Build the amendment's complete E1–E4 flow and shared phone announcements in Milestone 5. Keep the presenter disabled by default and do not require a TV connection for any complete game. Bring forward only the home-page content, title and JSON-LD explicitly named in §26; keep the rest of agent optimisation in Milestone 9. Preserve the site-wide pre-launch noindex policy. The owner requires Playwright screenshots in `docs/screens/` before hands-on rehearsal review.

**Consequence:** Milestone 5's plan and design wireframes are expanded. The existing advanced planner, themes and presenter console remain in their later milestones.

## D63 — Amendment 10 home-page work sequencing (resolved)

**Context:** The owner reviewed the desktop home page and specified dark-background logo contrast, a cleaner radial glow, mobile-first layout/performance requirements, three additional FAQ entries and a documented, rechecked basis for comparative claims.

**Choice:** Record the owner's Amendment 10 verbatim as SPEC section 27. Complete the current announcement-test correction and CSRF verification/push/green-CI gate first; implement section 27 before starting the M5 screen-design brief work. Test logo-fill contrast against every used background, remove visible hero/demo shadow edges, verify the named responsive widths and mobile Lighthouse scores, and add the exact FAQ answers to all specified surfaces. Maintain the competitor claims and their cited sources/date in `docs/CLAIMS.md`, rechecking before launch and removing claims that are no longer accurate. Do not name the competitor product, its maker or the TV programme.

**Consequence:** Section 27 is queued after the current CSRF/push gate and before the M5 design brief. No section 27 UI, copy or asset changes are made until that gate is green.

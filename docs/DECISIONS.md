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

**Choice:** Before every push, inspect the staged file list and confirm that no secrets, tokens, `.env` files or credentials are staged. CI scans full Git history using Gitleaks pinned to a full commit SHA.

**Consequence:** If this Repl cannot push, record that fact in `PROGRESS.md` and ask the owner to press Sync. A push targets `main` only; no release promotion or deployment is authorised in this work.

## D19 — Pre-launch privacy flag (resolved; implementation assigned to Milestone 9)

**Context:** Until the owner declares launch, every preview and production response must be excluded from indexing.

**Options:** Apply scattered route-specific noindex rules; or use one configuration flag that controls response headers and robots policy.

**Choice:** Implement one pre-launch flag: while enabled, every response carries `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallows everything. Turn it off only at launch in one configuration change; the normal crawler policy applies only then.

**Consequence:** Add a test for every response class and robots output when the public response/server work is introduced. No preview or production deployment is permitted here.

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

## Approval request boundary

Owner approval requested for PLAN, with unresolved choices above kept explicit. Plan approval is not a deployment instruction, acceptance of red verification, approval of Could features, or permission to guess missing rules. No Milestone 1 implementation has started.

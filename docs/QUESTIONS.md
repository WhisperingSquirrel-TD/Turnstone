# Open owner questions

## Amendment A versus older hosting wording — non-blocking reconciliation

Amendment A designates https://stackstoneconsulting.co.uk/oathstone as the
single findable home and explicitly says not to redirect it. SPEC section 28
and older HOSTING wording instead expect that company page to redirect to the
game host; older requirements also describe a marketing home at `/`.

Applied the approved decision to the game-host entry only: paper entry,
company canonical/About link, legacy `/play` redirect and information pages
preserved. No SPEC, hosting setting or company site was changed.
Recommendation: the owner should formally reconcile that older wording in a
later documentation-only decision. This is non-blocking for the explicitly
approved entry work, not permission to deploy or change DNS.

## Q12 — Finished-game roster regression found after the slot-2 repair

**Evidence:** Verify #282 on `5329db7` passed every suite except
rehearsal-live (and its required-checks dependency). H1, disconnected-player
and cold-restart tests passed. The remaining failure is
`e2e/rehearsal-live.spec.ts:2439`: the finished roster still contains
“Playing”. The shared Players roster uses the live-seat label even at
FINISHED, and displays public roles only for banished seats. This is a
product presentation regression from moving the roster, not a stale
appearance assertion to remove.

**Resolution (owner-approved):** At FINISHED only, restore the existing
final-result roster presentation: no “Playing” labels, and display only
roles already supplied by the public projection. During play, retain the
current banished-only role display. Never infer or restore a role suppressed
by the disconnected-removal rule. Keep all existing result and privacy
assertions, add a regression first, and make no server or rule change.

The owner approved this narrowly scoped finished-roster correction in chat.

## Q11 — Local rehearsal received a join-request 429 (resolved)

During a combined local rehearsal, `GET /api/games/:id/join-requests` returned
HTTP 429 while the Create game page waited for the lobby code. The H1 rehearsal
and disconnected-player journey both pass when run separately; the full player
rehearsal also passes separately. The coordinator poller uses a 5-second base
interval. Current evidence does not identify a harness action that exceeds
human timing, and no request body or player data was logged.

**Resolution (reviewer decision, 24 October 2026):** Treat the combined-run
429 as accumulated local rate-limit state. It recurred in Verify #266, so the
single-worker rehearsal now waits 65 seconds before the disconnected-player
journey (the 60-second window plus a 5-second margin). This is harness pacing
only. Never change a rate limit.

**Status:** Resolved. No rate limit or production polling behaviour changed.

## Q7 — Required night action with no eligible target

**Found 22 October 2026 while implementing Q6.** The unchanged
`pnpm exec vitest run tests/scenario-vote-targets.test.ts` reaches cycle 5,
SHADOW slot 1 round 1, with six living Traitors and parity victory disabled.
Every living seat is required to act, but Traitors may target neither themselves
nor another Traitor. There is no legal submit and the phase cannot progress.
The same issue needs consideration in a second murder slot after eligible
targets have been exhausted.

**Resolved by the owner, 22 October 2026:** after every banishment, murder,
removal and departure, if no living Faithful remains, the Traitors win
immediately, regardless of parity. Existing zero-living-seat behaviour stays
unchanged under Q6. This replaces the proposed extra acknowledgement.

For an exhausted second murder slot, every seat still sees every configured
slot with identical layout, copy and timing. Accept whatever a Traitor submits,
or nothing, for an exhausted slot; treat it as complete and resolve no victim.
No extra screen/button, different wording/timing, role-dependent public count,
or disclosure of remaining role numbers is permitted.

**Required tests:** parity on/off wins; exhausted slot completes with no victim;
role-neutral DOM, timing, projections and public log; existing scenario-vote-targets
completes without weakened assertions; idempotent retries.

**Status:** Rule resolved; implementation and verification in progress. SPEC §3
remains unchanged. See SPEC §33 and decision D92.

## Q8 — Reconciling Q7 no-submission completion with Q6 waiting privacy

**Finding, 22 October 2026:** the new failing regression
`tests/q7-rules.test.ts` → “does not reveal hidden eligibility through a deadline
transition without a submission” constructs two second-slot states with identical
public progress, deadline and submissions. Only hidden eligibility differs.
At the same deadline, Q7's exhausted-Traitor exemption advances one state to the
second window; Q6's required-action gate keeps the other in the first window.
The public transition therefore distinguishes hidden eligibility even though
the projected counts, screens and configured slots remain identical.

The organiser UI also still disables advance while the actual pending count is
nonzero. Enabling it based on the exemption would expose another eligibility
signal; moving the same check into the scheduler does not remove the signal.

**Owner/reviewer ruling, 22 October 2026:** use the same deadline no-action
default for every role, only for a slot with no valid target. That slot resolves
with no victim. Timing, screens and public state remain identical for every role.
Slots with valid targets retain the configured timeout fallback unchanged.
Add tests for both cases; no extra screen or acknowledgement.

**Status:** Resolved; implementation and verification in progress. The privacy
regression remains intact. No push until the changes pass checks and any running
Verify has finished.

## Q3 — How to designate a co-coordinator for takeover

**Question:** How should the organiser choose the seat that receives the
co-coordinator takeover prompt, and how should the majority be counted when no
co-coordinator is designated?

**Recommendation:** The organiser selects up to the configured number of living,
paired seats in the coordinator console. If none are selected, any living player
may request takeover after the organiser has been inactive for two minutes while
an organiser action is needed. The requester counts as the first approval; a
strict majority of living seats is required. Only the designated seat or
approved requester receives the rotated coordinator capability.

**Reasoning:** This follows SPEC §3, makes the handoff target explicit, and
prevents a player from gaining logistics authority without either designation
or a living-player majority. The capability remains separate from all private
game information.

**Status:** Provisional for Milestone 6, gated by the existing
`coCoordinators` setting. No change to SPEC §3.

## Q2 — How late joiners enter after the lobby invitation closes

**Question:** How does a permitted late joiner enter after the original room
code/link has closed at game start?

**Recommendation:** The organiser issues a fresh invitation link or QR, without
reopening the original room code. Apply the configured late-joining window,
organiser approval, rate limits and the always-Faithful rule.

**Reasoning:** A fresh invitation separates the public lobby invitation from
explicitly authorised late joining and avoids making a closed code usable again.

**Status:** Resolved by the owner on 15 October 2026: fresh invitation link or QR.
Implemented with coordinator-issued links/QRs, approval, limits and an
always-Faithful integration regression. The full local gate passed on 15 October
2026; GitHub CI follows the push.

## Q1 — Lighthouse SEO score while pre-launch noindex is enabled

**Question:** Should the SEO score be measured against an isolated launch-mode
test fixture with indexing enabled, while the actual preview and build continue
to send `X-Robots-Tag: noindex, nofollow` and disallow crawlers?

**Recommendation:** Yes. Measure the public page's launch-ready SEO quality in
the test-only fixture, and keep a separate regression check proving that the
normal pre-launch build remains unindexable.

**Reasoning:** The required pre-launch privacy policy intentionally fails
Lighthouse's `is-crawlable` audit. The home page otherwise scores 100 for SEO
checks; the intentional noindex is the sole failing SEO audit. Skipping that
audit would misstate Lighthouse's score, while disabling noindex in the actual
preview would violate the standing privacy rule.

**Status:** Resolved by the owner on 14 October 2026: keep the launch-mode
fixture test-only and retain the regression proving real builds stay noindex.

## Q4 — Reserved VM proration on resize or removal

**Question:** How are partial-hour charges rounded when a Reserved VM is resized,
unpublished or removed?

**Finding:** Replit's current documentation describes the fixed hourly rate
while the VM runs and says deletion stops further charges, but does not specify
partial-hour rounding or explicitly confirm proration.

**Next step:** Before any approved VM change, check the exact charge and billing
effect shown in Publishing. Do not infer a refund or schedule a resize from the
hourly rate alone.

**Status:** Unresolved platform detail; no VM change is authorized.

## Q5 — Autoscale WebSocket routing across instances

**Question:** Does Replit Autoscale guarantee that a WebSocket reconnect reaches
the same instance, or provide sticky routing across multiple instances?

**Finding:** Replit documents WebSocket support and scale-to-zero, but the
reviewed documentation does not guarantee session affinity. Scale-to-zero
terminates active connections.

**Recommendation:** Treat routing as non-sticky unless Replit documents
otherwise. A future multi-instance game deployment must prove reconnect,
resynchronization and shared realtime state before use.

**Status:** Unresolved documentation detail; Autoscale/scale-to-zero remains a
later experiment, limited to one game-server instance.

## Q6 — Living players who miss a phase action

**Status:** Resolved (owner, 27 October 2026). Implemented in Round 6; the
owner confirmed reinstatement until the next phase starts, the shipped log
wording and the unchanged zero-living-player result. See D112. The proposal
below is kept for history.

**Current behaviour (verified):** A live phase can advance by organiser action
or at its scheduled deadline. The organiser's advance is subject to the
server-side minimum; the scheduler currently advances at the deadline even
with unfinished players. Missing normal-vote ballots remain absent, and a vote
with no ballots banishes nobody. Missing night choices use the configured
decision and timeout fallback. A missing private acknowledgement is not
converted into a vote or penalty. Rehearsal remains player-paced.

After a dealt game, `MarkDeparted` uses the normal departure removal path and
immediately runs the existing win check. That path can reveal a departed
player's role when the configured departure-reveal rule says “now”; this
proposal requires disconnect removal to keep the role hidden regardless of
that setting.

The existing win check has no separate “too few players to continue” or
“no winner” result. It awards a Faithful win when no living Traitor remains;
if at least one Traitor remains, it awards a Traitor win at two or fewer living
players, or at configured parity. Thus the current zero-living-seat case falls
through the no-living-Traitors branch and awards a Faithful win. No new winner
rule is proposed here; this edge case is flagged for owner confirmation below.

**Proposed rule:** A living player's phase action remains pending until they
submit, the organiser skips it under the disconnected-seat rule below, or the
seat is removed. At a scheduled deadline, the phase does not advance while
actions remain pending. Every role sees the same count-only status; only the
organiser's restricted control view shows names of pending players. `Move
everyone on` remains visibly disabled while anyone is pending and displays
only the count, such as `Waiting for 1 player`.

The existing phase minimum remains a hard lower bound. A scheduled deadline
that arrives while actions are pending is held, not discarded. Once no action
is pending and the minimum has elapsed, the already-due scheduled advance may
proceed; if the organiser chooses `Wait longer`, the server extends the wait
by 60 seconds. All timing and connection checks use server time.

Skip and Remove are available only for a pending seat that the server has
observed continuously disconnected for at least 60 seconds. They are never
available for a connected player or the current organiser's own seat. A
reconnected player is no longer eligible for either action and can submit
while the phase remains open. The 60-second disconnected grace is separate
from, and cannot shorten, the phase minimum.

**Proposed organiser actions, safest first:**

1. **Wait longer** — show before use: `Give [name] another 60 seconds to
return. No action is skipped or seat removed; the phase stays open.`
   Selecting it extends the server-timed wait by 60 seconds.
2. **Skip [name]’s action** — show before use: `This counts as no action.
[Name] stays in the game. You can undo this before the phase resolves.`
   Require confirmation: `Skip [name]’s action? They stay in the game; this
counts as no action and can be undone before the phase resolves.` Provide
   `Undo skip` until the phase resolves. A skip does not create a ballot,
   choice, acknowledgement or penalty beyond the existing no-action rules.
3. **Remove [name] from the game** — show before use: `This removes [name]
from the game. If this removal itself meets an existing end condition, the
game ends and a winner is announced; otherwise the game continues. Their
role and side will remain unknown.` Require confirmation with the same
   implications. Proposed recovery: `Let them back in` until the next phase
   starts; this reinstatement window and whether the player may complete the
   pending action still require owner confirmation.

Removal immediately re-runs the existing win checks. It ends the game only if
that removal itself triggers an existing terminal rule or the current rules
cannot continue with the resulting player count; otherwise play continues.
When a terminal rule fires, announce its winner, but never show the removed
player's role or side in the public log, recap, winner announcement, final
role list or any other projection. Represent the removed seat only as `left
the game`. The disclosure must not depend on `departureReveal`.

Every skip and removal gets a public, role-neutral log entry with reason
`disconnected`. Proposed wording:

- Skip: `[name]’s action was skipped (disconnected).`
- Remove: `[name] left the game (disconnected).`

Pending names are shown only in the organiser's pending-action controls; all
other player and presenter views show counts only. Organiser controls and
screens have identical structure and wording whether the organiser is a
Traitor or Faithful. They confer logistics only and no access to private
information.

**Organiser dropout:** When an organiser is disconnected and a handover is
needed, give control to the configured second organiser if they are live and
connected. Otherwise the server selects a live, connected, in-game player at
random; no client may nominate or influence the selection. Removed, departed,
spectator and other out-of-game seats are ineligible. The successor receives
the same restricted, blind logistics controls, using the existing takeover
capability model. The original organiser returns as a normal player; control
returns only if the current organiser explicitly hands it back.

If the only connected player is the pending player, they may submit their own
action but cannot skip or remove themselves, even if they are the organiser.
They may receive server-assigned organiser control if eligible, but that does
not change this restriction. If no live connected in-game player is eligible
for handover, no client is made organiser and the phase remains held until an
eligible player reconnects. The scheduled deadline cannot bypass the hold.

**Tests required before implementation:**

1. All roles see the same count-only waiting status and disabled advance
   control while an action is pending; player and presenter views reveal no
   pending names, roles, ballots or choices; only the organiser sees the
   pending names. Compare Traitor and Faithful organiser views.
2. A connected but slow player cannot be skipped or removed. Verify no action
   appears before 59 seconds disconnected, then the correct actions appear at
   60 seconds of server-observed disconnection. The organiser cannot target
   their own seat.
3. `Wait longer` shows its implications before use and extends the wait by
   exactly 60 server-timed seconds without shortening the minimum or changing
   the pending action.
4. Skip shows its implications and requires confirmation; it counts as no
   action, leaves the seat in game, can be undone before resolution, and cannot
   be undone after resolution. No ballot, choice or acknowledgement is
   fabricated; public logging is role-neutral and says `disconnected`.
5. Remove shows its implications and requires confirmation. If removal does
   not trigger an existing terminal condition, the game continues; if it does,
   the existing winner is announced. The removed seat appears only as `left
the game`; scan every player, presenter, public log, recap, winner and final
   role view for role/side leakage.
6. Test the proposed reinstatement before the next phase starts and rejection
   after it starts, including whether the pending action can be completed;
   keep this expected behaviour gated on owner confirmation.
7. Test the existing phase minimum and scheduled deadline together: the
   minimum is never bypassed; a due deadline stays held while actions are
   pending and resumes only when pending actions are resolved. Include pause,
   resume, late submit, skip undo and server-clock offset boundaries.
8. Test organiser dropout: second organiser takes precedence when eligible;
   otherwise the server chooses a connected, living in-game player, never an
   out-of-game seat and never a client-selected target. The successor receives
   no private data. The returning organiser has no control until an explicit
   handback.
9. Test the only-connected-player cases: a pending living player can submit
   but cannot skip or remove themselves; an out-of-game connected viewer is
   not selected; with no eligible connected player, the phase and scheduled
   advance remain held until reconnection.
10. Test current win outcomes at zero, one, two and three living players under
    the existing role/parity cases. In particular, capture the current
    zero-living Faithful-win result without changing it until the owner decides.

**Open approval points:** Confirm the proposed reinstatement window and whether
a returning player may finish the pending action; confirm how the server-random
organiser fallback interacts with Q3's existing strict-majority approval;
confirm whether the current Faithful win at zero living seats is intended.
Also decide whether a skipped DEAL acknowledgement leaves that seat's private
role card available on return.

## Q9 — Authenticated gameplay-command rate limits (RESOLVED, 23 October 2026)

**Owner ruling:** use a per-game, per-IP budget of `min(400, max(120, 8 × stored seat count))` per minute. Each seat's aggregate limit across authenticated command types is one quarter of that budget, rounded down; the per-seat, per-command-type limit is 60 per minute. At least four seats are required to exhaust the shared bucket. A 429 includes `Retry-After`; clients retain the original idempotency key and payload and honour the wait. Derive seat count only from server-stored game state.

Join, recovery, PIN, CSRF and all other unauthenticated-route limits, including PIN lockout, remain unchanged. Test shared-IP 40-seat vote and AcknowledgePrivate bursts with one retry each; single-seat and three-seat isolation; six-seat limits; role-neutral 429 responses; unchanged unauthenticated limits; and Retry-After client handling.

## Q10 — Zod security update (RESOLVED)

Verify #247's dependency audit found one high-severity advisory:
`GHSA-mrhx-c7xc-m3w5`, affecting the workspace's `zod@3.25.76`; the advisory
lists Zod `4.6.6` as the first patched version. A local `pnpm audit` confirms
the finding. Zod is used by shared contracts/configuration, generated API
schemas, database schemas and API-server environment parsing. `drizzle-zod`
0.8.3 declares compatibility with both Zod 3 and 4, but moving to Zod 4 is a
major shared-library upgrade that may change schema typing and validation
behaviour.

**Owner decision:** approved the Zod `4.6.6` upgrade.

**Resolution:** upgraded the workspace and `lib/shared` pin, migrated the Zod 4
record signatures, and preserved nested configuration defaults with
`.prefault()`. The Zod compatibility type fixes and public-log validation test
updates are included. The audit threshold and all other checks remain
unchanged. `pnpm audit --audit-level high` reports 0 high and 0 critical
findings; the complete local `pnpm run verify` passes. GitHub Verify is pending
the next push.

## Voting-circle copy versus server order — BACKLOG for the later voting-circle brief

Owner direction, 25 October 2026: the approved circle is self-paced; each player
says their vote and presses their own sharing button. The Create description now
reads: “Each player says who they voted for and why, then presses a button to
show their vote.”

The current engine still calls `shuffledVoters` when closing a circle ballot and
stores that reveal order. This batch intentionally changes no engine behaviour.
Align the order and its remaining instructions only under the later
voting-circle brief; do not infer approval to alter it from this copy fix.

## Automatic layout audit — normal scroll boundaries (RESOLVED, 25 October 2026)

**Historical question, superseded by the owner ruling below.**
The requested “no visible text or control clipped by the viewport” at every
scroll position conflicts with normal whole-page scrolling: a perfectly
reachable control necessarily crosses the viewport edge. A deterministic
390×844 browser reproducer demonstrates this using a 56px button crossing the
bottom edge. The initial audit correctly reports viewport clipping. Similarly,
an opaque fixed dock can temporarily pass over content while scrolling, even
though the last control has enough bottom clearance.

**Proposed interpretation:** permit ordinary vertical viewport crossings, but
probe every control by scrolling it fully into the unobscured viewport and
require it to be reachable above all fixed bars, including the last control at
the end of the document. Never exempt horizontal overflow, overlapping sibling
text/controls, CSS truncation by a non-scrolling ancestor, an unreachable
control, undersized targets, missing disabled-action reasons or broken images.
Intentional open menus and privacy dialogs must be assessed as foreground
surfaces, not falsely compared with their covered background.

**Question:** May the audit exempt normal vertical viewport-edge crossings,
while still requiring every control to scroll completely clear of fixed bars?

**Delivered so far:** the known Create/Lobby defects have red-first regression
coverage; the initial audit helper reports anonymous selectors, geometry and
screen names without text contents; its checkbox-overlap and scroll-boundary
reproducers run in Verify. The complete application-state audit is NOT yet a
gate and is NOT claimed complete. The initial 72-image gallery covers the
missing Create, organiser Lobby, Join and Practice views at the four requested
widths in both system colour schemes. Form screens currently deliberately use
paper in both schemes. The remaining game/overlay inventory and its gallery
awaited this policy clarification.

**Owner ruling:** Ordinary scroll-edge clipping is exempt only when every
control, link, text block and image can scroll fully clear of every fixed bar,
is fully visible and passes the centre hit-test. At document top and bottom,
fixed bars must not overlap controls/text; the last control needs clear space.
Fixed/sticky bars must never overlap each other. Horizontal overflow, hidden
meaning, non-scrolling ancestor clipping, small targets, broken images and
unexplained disabled primaries remain failures. The three named Create/Lobby
regressions are included. No existing check is removed.

## Audit viewport contract — owner decision (RESOLVED 25 October 2026)

The complete local scan traverses 71 named UI states at four widths in both
themes (568 state/viewport combinations). After the exposed defects were
fixed, remaining findings are at-rest body/fixed-bar overlaps: for example,
long Vote and Night lists extend under the fixed bottom stack at scroll top.
Every target can subsequently scroll fully clear; that does **not** satisfy
the separate at-rest condition, so the audit continues to fail it.

The earlier Round 5 scrolling decision requires whole-page scrolling and no inner scroll pane.
Meeting the new at-rest condition with a fixed dock is most directly achieved
by one main content scroll area bounded above the dock, with no nested
scrolling inside it. That changes the earlier scrolling contract.

**Question:** May the game use that single bounded main scroll area instead
of whole-page scrolling? All reachability, clipping, geometry, privacy and
role-neutral checks would remain enforced; this is not a request to exempt
unreachable controls or relax the at-rest requirement.

**Owner answer:** “Use one main scroll area (recommended)”. Implement one bounded
main scroll area above the fixed controls, not nested choice-list scrollers.
This supersedes the earlier whole-page constraint. All strict audit checks remain.

# Open owner questions

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

**Status:** Proposal for owner approval only. No implementation or SPEC §3
change has been made.

**Current behaviour:** Live phases can advance by organiser action or at the
scheduled deadline. The organiser may move on after the server minimum, with a
confirmation if players are unfinished; the deadline scheduler also advances
with unfinished players. Missing normal-vote ballots remain absent; no votes
means nobody is banished. Missing night choices use the configured decision
and timeout fallback. A missing private acknowledgement is not turned into a
vote or penalty. Rehearsal remains player-paced.

**Proposed rule:** If the scheduled deadline arrives while a living player has
not submitted the phase action, keep the phase open. Show the same count-only
status to every player, regardless of role; the organiser alone sees the
pending names. Allow late submissions during the grace period. After a
60-second grace period, offer organiser actions for each pending seat:

- **Wait longer** — wait another 60 seconds.
- **Skip [name]’s action** — count it as no action; keep the seat in the game
  and do not fabricate a ballot, choice or acknowledgement.
- **Remove [name] from the game** — remove the seat without revealing its role
  or side.

The phase resolves only after every remaining living player has submitted or
the organiser has explicitly skipped their action. A removed seat is no longer
expected to act. Recompute win conditions immediately after removal and end
the game if they are met. A returning player keeps the same seat unless
removed; a removed seat cannot reclaim it.

**Proposed shared copy:**

- `Waiting for 1 player`
- `Waiting for {count} players`

**Proposed organiser copy:**

- `Wait longer` — `Wait another 60 seconds.`
- `Skip [name]’s action` — `They stay in the game. This counts as no action.`
- `Remove [name] from the game` — `Their role will not be revealed.`
- Removal confirmation: `Remove [name] from the game? Their role will remain
unknown to the group.`
- Public log: `[name] left the game. Their role remains unknown to the group.`

The count-only status and all player projections must be role-neutral. Pending
names are visible only to the organiser. Removal must keep that seat’s role and
side hidden in every player, presenter, recap and end-of-game role projection.
The public log records the departure without a role or side.

**Tests required before implementation:**

1. Before the grace period ends, all roles see the same count-only waiting line;
   player and presenter views contain no pending names, roles, ballots or
   choices, while the organiser sees the names.
2. A late action during the grace period is accepted once, clears that player
   from the pending list, and does not duplicate an event. The phase cannot
   advance while any action remains pending.
3. At 60 seconds, organiser-only Wait longer, Skip and Remove controls appear.
   Wait longer resets the server-timed grace period. Skip adds no ballot,
   choice or acknowledgement, leaves the seat alive, and resolves using the
   existing no-action rules.
4. Removal writes only the proposed role-neutral public log entry, immediately
   recalculates the result, and never reveals the removed seat’s role or side
   in player, presenter, recap or final views, including when removal ends the
   game.
5. A player returning before removal recovers the same seat and pending action.
   A removed player cannot recover that seat. Cover deadline boundaries with
   server-clock offsets and pause/resume.

**Open owner decisions:** What happens if removal leaves fewer than the
minimum number of players? How does organiser phone dropout interact with
coordinator handover? If removal ends the game, could announcing the winning
side indirectly reveal the removed player’s side, contrary to the no-reveal
rule? Should skipping a DEAL acknowledgement leave the private role card
available to that seat on return?

# Manual test checklist

Not executed yet; do not count these as passed.

## Milestone 0

- Home and `/play` at 320 px, portrait/landscape and 200%/400% zoom; no clipped text or horizontal scrolling.
- iPhone Safari, Android Chrome, iPad Safari, desktop keyboard: navigation, reload and readable text.
- VoiceOver/TalkBack: skip link, nav landmarks, one h1, main, footer.
- Coordinator and presenter on desktop, tablet and phone: keyboard-only navigation, visible focus, announced headings/status, labelled pairing input and QR, and no role or ballot details.
- Keyboard-only: visible focus and logical order; no trap.
- Verify direct navigation and reload on `/play`; missing page explains how to return.
- Verify no fake join/start controls, no seasonal or prohibited branding.
- Inspect CSP/nonces for web and API, HSTS, frame restrictions and no-referrer.
- Temporarily remove required config in an isolated test process: clear key-only startup error, no secret value.
- Unavailable database: live health succeeds, readiness fails without connection details.

## Later milestones, after SPEC

Shield hold/release/pointer-cancel/page-hide; shoulder-surfing uniformity and decoys; blind playing coordinator/admin; shared/no-phone alternatives; phone locking/reloads; network loss/reconnect; duplicate commands; scheduler restart/deadline recovery; screen reader interaction; commitment verification. These are unimplemented, not passing tests.

## Beta solo play-through (one person, several devices, about 20 minutes)

For the October beta (D109, D110), when no group is available. Use your own
phone as the organiser and every other device you have as a player: a second
phone, a tablet or a laptop. On a laptop, each different browser (Chrome,
Firefox, Safari, Edge) is a separate player, and so is one private window per
browser; two private windows of the same browser share a session, so they
count as one player. Aim for four seats. Use the published or
preview address, not a development build.

1. **Entry (organiser phone).** "Beta" sits beside the wordmark; the
   thank-you line is under the actions; nothing overlaps at your phone width.
   Open Menu: it opens fully on screen.
2. **Create.** Create a game with your name and PIN. Note the six-character
   code and the QR.
3. **Join (each other device).** Scan the QR or type the code, enter a first
   name and four-digit PIN. Approve each player on the organiser phone. Check
   the Lobby count reaches your total.
4. **Start and roles.** Start the game. On each device: shield your screen,
   tap "I'm shielded", hold the seal to see the role, let go and it hides.
   Note who is the Traitor (you are playing every seat).
5. **Missions notice.** On a public screen, read "Missions are coming soon";
   tap Hide on one device only. Reload that device: it stays hidden; the
   others still show it.
6. **Round-table shield.** On the organiser phone during the talk, pick a
   player and tap "Give the shield to …". Every device should show "… holds
   the shield until dawn." and the update in "Latest updates".
7. **Vote and verdict.** Vote on each device; follow the reveal prompts;
   check the result wording.
8. **Night.** As the Traitor, choose the shield holder if you can. At dawn,
   expect "no one was taken" publicly, and the Traitor's private screen
   saying the target was protected.
9. **Interruptions.** Lock one phone mid-step and unlock it; switch apps and
   come back; reload one browser. Each should return to the right screen
   without exposing a role.
10. **Finish.** Play to the end (End the game early from the organiser menu if
    needed). Check the final roster and results read correctly.

Record for each step: device, browser, pass or problem, and a screenshot of any
problem. Send problems before inviting players; anything blocking delays the
beta.

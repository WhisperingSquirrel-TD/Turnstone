# Turnstone screen design plans

## Design authority and shared tokens

Section 25 of `docs/SPEC.md` is the source of truth for colour, typography, motion and visual restrictions. The one token file is `artifacts/party-game/src/theme.css`; do not copy token values into components, prose or test fixtures. Use self-hosted, subsetted Latin WOFF2 files for Playfair Display and DM Sans, with their SIL Open Font Licence files; keep the pair within 80 KB total. Do not load fonts from Google. Reuse only approved, outlined Stackstone marks.

Palette: Charcoal `#3D3A38`, Hearth `#2E2B29`, Stone `#55504B`, Gilt `#C8944A`, Candle `#FAFAF5` and Ash `#D4CDC4`. Use one soft diagonal lift towards Stone in the far corner. Use Candle for primary text and Ash for secondary text on the dark surfaces. Gilt is for large text, icons and borders only, including key headline words, focus rings and main actions; never use it for small text on Charcoal.

Type scale (relative to 1rem DM Sans body text; adapt without clipping at 200% text):

| Level      |          Scale | Use                                             |
| ---------- | -------------: | ----------------------------------------------- |
| Display    |    3rem / 1.05 | One public-site headline or major public reveal |
| Heading 1  | 2.25rem / 1.15 | Screen title                                    |
| Heading 2  |  1.5rem / 1.25 | Section heading                                 |
| Body       |     1rem / 1.5 | Instructions, reports and general reading       |
| Supporting | 0.875rem / 1.4 | Timestamps, status and non-essential help       |

Use Playfair Display 400 for headlines and subtitles. Use DM Sans 400 and 500 for body text, buttons and labels. Load the fonts from this origin with immutable one-year caching; preload them on public pages and during the lobby/device check. Use `font-display: swap` with size-adjusted fallback faces; keep CLS under 0.1 and prevent font swaps from moving content during a hold. Sentence case; never use eyebrow labels or all-caps UI copy. Keep links, focus indicators, controls and error states distinct without making role colour a signal.

## Milestone 5 — player experience and private moments

Prepare a new plan immediately before coding each player-screen set. Use the approved talk-style palette and font hierarchy. Fixed geometry is part of the secrecy model: all living roles get the same screen frame, card dimensions, control count, colours, type scale, text-length band, sound/vibration behaviour and minimum time. Role-dependent content may differ only inside the held reveal, never in public-shell layout.

```text
+--------------------------------+
| Stackstone mark       connection|
| phase and shared countdown      |
|                                |
|       privacy-shield prompt     |
|       identical hold pad        |
|       (same bounds for roles)   |
|                                |
|       fixed action area         |
+--------------------------------+
```

Align the persistent mark and connection state inside safe areas. Centre the timed private interaction below the phase heading, leave the complete 44 px control area clear of the home indicator, and prevent a task, role or choice from changing geometry. A held secret is removed immediately on every specified cancellation path. Use a Hearth/Gilt seal identically for every role; do not add reveal animations on hide. Load both self-hosted fonts before the first private moment. Do not implement this screen until Milestone 5.

### Player entry and rehearsal

The first player-screen set makes the real game reachable on a phone without account creation. `/play` offers the short-code join path and a clearly labelled rehearsal path; invite links land on `/join/:gameId`; an authenticated seat opens `/game/:gameId`. Keep the flow focused on one action at a time, with display name and seat PIN collected only when needed. Never put a seat PIN, invite token, role or choice in a query string, title, notification or persistent browser storage; consume invite fragments immediately and remove them from browser history.

```text
+--------------------------------+
| Stackstone mark     connection |
|                                |
| A game you can join            |
| [game code]                    |
| [display name]                 |
| [seat PIN]                     |
| [Join game]                    |
|                                |
| or                              |
| [Rehearse with practice players]|
+--------------------------------+
```

The active-player screen is one fixed frame for every living role. A public phase/countdown sits above the private shield interaction; the same card, pad bounds, typography, controls and status area remain in place before and after a reveal. The hold seal warms only while pressed and snaps dark immediately on release. Role-specific text is removed from the DOM on every cancellation path. Use the real API view and socket updates; do not simulate game state in the browser. The rehearsal path is a real server game with a single human seat, server-controlled practice players and shortened phase deadlines, and it must be labelled as practice before joining.

Self-review against generic defaults: do not use the usual centred gradient hero, stack of rounded cards, oversized feature tiles or repeated shadows. Use the supplied talk-slide type hierarchy, the single approved diagonal lift, restrained gold rules and a compact, direct player flow. The Stackstone mark uses its outlined local asset and stays at the same safe-area position, size and colour for every role. Check 320 px width, 200% text, reduced motion, screen-reader labels, touch targets and home-indicator clearance before visual acceptance.

### Amendment 9 — E1–E4 entry screens and phone-first play

Use the established tokens only: Charcoal `#3D3A38`, Hearth `#2E2B29`, Stone `#55504B`, Gilt `#C8944A`, Candle `#FAFAF5`, Ash `#D4CDC4`. Headlines/subtitles use Playfair Display 400; controls and body use DM Sans 400/500. Keep the 3rem display, 2.25rem screen-title, 1.5rem section-title, 1rem body and 0.875rem supporting scale. E1 alone adds the single specified soft Gilt candle glow behind the wordmark; do not add other gradients, card walls or generic corporate forms.

E1 is a title card with no fields. E2 is a single prompt per screen; code entry is skipped when a valid link/code is already in memory. E3 puts the organiser into the same player roster and then exposes only logistics. E4 rehearsal uses one real seat and server bots. Use safe-area padding and keep all primary actions in the lower thumb zone without moving the fixed Stackstone mark.

```text
E1 — /play choice
+----------------------------------+
| Turnstone              Stackstone|
|       (one soft Gilt glow)       |
|                                  |
| A game of traitors and faithful. |
| Everyone plays. Even the host.   |
|                                  |
|                                  |
| [Start a new game]               |
| [Join a game]                    |
| Practise alone first             |
|                                  |
| A Stackstone game                |
+----------------------------------+

E2 — join wizard (one screen at a time)
+----------------------------------+
| Turnstone              Stackstone|
| ● ○ ○                            |
|                                  |
| What's the game code?            |
| [ 0 ][ 0 ][ 0 ][ 0 ][ 0 ][ 0 ]  |
|                                  |
| [Continue]                       |
|                                  |
|                                  |
| Back                             |
+----------------------------------+
Name screen: one first-name field + Options.
PIN screen: numeric 4-digit entry + the exact recovery hint.
Wait screen: “Waiting for {organiser} to let you in” + breathing seal.

E3 — organiser setup and lobby
+----------------------------------+
| Turnstone              Stackstone|
|                                  |
| Name your game (optional)         |
| How many players?       [− 14 +] |
| Recommended Traitors: 3          |
| Your first name / 4-digit PIN     |
| [Continue]                       |
+----------------------------------+
Lobby:
+----------------------------------+
| Turnstone              Stackstone|
| [          large QR          ]   |
| Code: ABC123      [Share]        |
| Waiting for players              |
| Ada              [Approve]       |
| Sam              [Approve]       |
|                                  |
| [Start the game]                 |
+----------------------------------+

E4 — rehearsal setup
+----------------------------------+
| Turnstone              Stackstone|
| Practise alone first             |
|                                  |
| Players: 10                      |
| [------●----------------] 6–15   |
|                                  |
| Speed  [Fast] [Normal]           |
| Your first name                  |
| [Continue]                       |
+----------------------------------+
```

Alignment and interaction: title and description stay centred with the wordmark at about 56 px and the three E1 choices in the lower thumb zone. E2 shows exactly three progress dots and one decision at a time; six code boxes accept paste and auto-advance. Options expose tap instead of hold, larger text and simple language without adding a role tell. E3 QR/code/approvals share one stable lobby surface; loading and approval updates arrive through realtime state, not a polling loop. E4 has no PIN field. Every public announcement uses one shared projection across player phones, including dawn, verdict, visible ballot reveals, timer, pot, endgame and results; no TV is required. Presenter creation remains disabled by default.

For the wordmark entrance, animate once over 600 ms and breathe the Gilt glow once, then remain still. `prefers-reduced-motion: reduce` removes both animations. The join-wait seal may breathe slowly; all other routine updates remain still. Error copy tells the player what action to take in plain English and never displays backend diagnostics or security tokens.

## Milestone 6 — coordinator console and presenter

Write separate ASCII plans for the phone-first coordinator and landscape public presenter before their implementation. The coordinator view is logistics-only. Presenter layout exposes public information and room-readable text only; role secrets, private task reports, unrevealed votes and Traitor messages stay absent.

```text
Coordinator (phone)                 Presenter (landscape)
+----------------------+            +-----------------------------------------+
| Stackstone mark      |            | Stackstone mark        shared status    |
| phase / timer        |            |                                         |
| public progress      |            |          current public event            |
| schedule actions     |            |                                         |
| seat logistics       |            | timetable, pot and public score          |
+----------------------+            +-----------------------------------------+
```

Keep critical logistics actions reachable without obscuring the countdown. Use Playfair Display headlines and DM Sans controls; presenter text and countdown remain readable across a room. Reserve one restrained, reduced-motion-aware transition for each major public event; leave routine status updates still.

## Milestone 9 — public pages and the interactive hero

Give each independently built public-page set a short plan and wireframe before implementation. Preload the self-hosted fonts. The home hero's hold-to-reveal demonstration must use the actual privacy interaction and show both roles with exactly the same geometry, colour, timing and text-length rules. It is a marketing demonstration, not a live game's role or a claim about performance/security tests that have not passed.

```text
+------------------------------------------------------+
|               centred Stackstone logo                |
|                                                      |
| Playfair headline, Candle      Hold to see your role |
| second line, Gilt              fixed role-neutral pad |
| Playfair subtitle, Ash         identical geometry    |
| DM Sans byline                                       |
|                                                      |
| direct answer / proof points / descriptive actions   |
| public footer                                        |
+------------------------------------------------------+
```

Do not add a generic feature-card wall, routine fade-up effects, extra gradient washes or unexplained all-caps overlines. Use only the single soft diagonal lift towards Stone specified in §25. Prefer a deliberate typographic hierarchy, useful HTML tables and content that remains complete without JavaScript. Keep every page within its section 20 budget.

## Review checklist for each screen set

- Confirm the plan uses the approved theme tokens and scales at 320 px, 200% text and safe-area insets.
- Compare the design against generic dashboard, landing-page and card-grid defaults; remove templated choices that do not serve this product.
- Check the player privacy invariant across roles before reviewing decoration: same element count, bounding boxes, colours, text-length band and minimum duration.
- Respect reduced motion, keyboard, touch, screen-reader and zoom behaviour; run axe on every implemented screen.
- Capture Playwright screenshots on the relevant configured phone, tablet and TV/presenter profiles. A skipped local WebKit run is labelled exactly as specified; iPhone and iPad WebKit evidence comes from CI.
- Record the reviewed result in `docs/PROGRESS.md`; do not treat a static wireframe or unbuilt route as a passing test.

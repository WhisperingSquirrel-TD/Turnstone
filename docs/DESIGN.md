# Oathstone screen design plans

## Design authority and shared tokens

Section 25 of `docs/SPEC.md` is the source of truth for colour, typography, motion and visual restrictions. The one token file is `artifacts/party-game/src/theme.css`; do not copy token values into components, prose or test fixtures. Use self-hosted, subsetted Latin WOFF2 files for Playfair Display and DM Sans, with their SIL Open Font Licence files; keep the pair within 80 KB total. Do not load fonts from Google. Use the Oathstone emblem in public-site and game headers; use Stackstone marks for Stackstone Consulting links.

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

Self-review against generic defaults: do not use the usual centred gradient hero, stack of rounded cards, oversized feature tiles or repeated shadows. Use the supplied talk-slide type hierarchy, the single approved diagonal lift, restrained gold rules and a compact, direct player flow. The Oathstone emblem stays in the top-right header at the same safe-area position, size and colour across public and game screens; it links internally to Oathstone home. Stackstone Consulting links continue to use the Stackstone mark and `https://stackstoneconsulting.co.uk/`. Check 320 px width, 200% text, reduced motion, screen-reader labels, touch targets and home-indicator clearance before visual acceptance.

### Amendment 9 — E1–E4 entry screens and phone-first play

Use the established tokens only: Charcoal `#3D3A38`, Hearth `#2E2B29`, Stone `#55504B`, Gilt `#C8944A`, Candle `#FAFAF5`, Ash `#D4CDC4`. Headlines/subtitles use Playfair Display 400; controls and body use DM Sans 400/500. Keep the 3rem display, 2.25rem screen-title, 1.5rem section-title, 1rem body and 0.875rem supporting scale. E1 alone adds the single specified soft Gilt candle glow behind the separate title text; do not add other gradients, card walls or generic corporate forms.

Owner clarification: Oathstone logo assets contain the standalone symbol only. Render “Oathstone” as separate UI text using the supplied title reference; do not embed the name or a separator dot in an SVG mark. In the shared-table concept, all eight seats are the same size; one gold/brown seat sits at about 1:30. Use Gilt on Charcoal and a darker gold-brown on Candle to preserve contrast.

E1 is a title card with no fields. E2 is a single prompt per screen; code entry is skipped when a valid link/code is already in memory. E3 puts the organiser into the same player roster and then exposes only logistics. E4 rehearsal uses one real seat and server bots. Use safe-area padding and keep all primary actions in the lower thumb zone without moving the fixed Oathstone emblem.

```text
E1 — /play choice
+----------------------------------+
| Oathstone              Stackstone|
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
| made by Stackstone Consulting    |
+----------------------------------+

E2 — join wizard (one screen at a time)
+----------------------------------+
| Oathstone              Stackstone|
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
| Oathstone              Stackstone|
|                                  |
| Name your game (optional)         |
| How many players?       [− 14 +] |
| Recommended Traitors: 3          |
| Your first name / 4-digit PIN     |
| [Continue]                       |
+----------------------------------+
Lobby:
+----------------------------------+
| Oathstone              Stackstone|
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
| Oathstone              Stackstone|
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

Alignment and interaction: title and description stay centred with the separate title text at about 56 px and the three E1 choices in the lower thumb zone. E2 shows exactly three progress dots and one decision at a time; six code boxes accept paste and auto-advance. Options expose tap instead of hold, larger text and simple language without adding a role tell. E3 QR/code/approvals share one stable lobby surface; loading and approval updates arrive through realtime state, not a polling loop. E4 has no PIN field. Every public announcement uses one shared projection across player phones, including dawn, verdict, visible ballot reveals, timer, pot, endgame and results; no TV is required. Presenter creation remains disabled by default.

For the title-text entrance, animate once over 600 ms and breathe the Gilt glow once, then remain still. `prefers-reduced-motion: reduce` removes both animations. The join-wait seal may breathe slowly; all other routine updates remain still. Error copy tells the player what action to take in plain English and never displays backend diagnostics or security tokens.

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

## M5 brief

FOUNDATIONS

- Layout: single column, max-width 480px centred, 24px side padding, 8px spacing grid, safe-area insets, dvh units. Primary action sits in a bottom action bar (thumb zone); buttons are 56px tall with a 12px radius.
- Type: Display is Playfair 400 40/44. Title is Playfair 30/36. Subtitle is Playfair 22/30 in Ash. Body is DM Sans 400 17/26. Label is DM Sans 500 15/20. Meta is DM Sans 400 14/20 in Ash. Never all caps. Every title has one key phrase in Gilt (written below as _word_).
- Colour: background Charcoal, with one subtle 135-degree lift to Stone at the bottom right; surfaces Hearth; Stone 1px dividers; Candle text; Ash secondary text; Gilt for key phrases, 2px focus rings with a 2px offset, progress and primary buttons.
- Buttons: Primary is a Gilt fill with Hearth text (passes AA). Secondary is transparent with a 1px Gilt border and Candle text. Disabled is a Stone fill with Ash text.
- Header on every screen and identical for every role: one text-only "Oathstone" wordmark in Playfair 20, with "Oath" in Candle and "stone" in Gilt. No emblem or Stackstone mark/link in the header. The footer on every screen, including private moments, says "made by Stackstone Consulting" and includes the Stackstone cairn mark linked to its website; public links stay in the same tab and in-game links open a safe new tab. Rehearsal games add a small Meta tag, "Rehearsal".
- Motion: 200ms fade between screens and nothing else, except the seal glow, dawn reveal and verdict reveal. With reduced motion, no animation at all.

PRIVATEMOMENT COMPONENT (one component for the deal, votes, shadow, tasks, recruitment and endgame)

1. Shield: full-screen Hearth. Title "Shield your _screen_"; body "Turn away and cover your phone."; a 5-to-1 countdown in Playfair Gilt numerals; then a primary button, "I'm shielded".
2. Hold: a centred 168px seal (Hearth disc, 2px Gilt ring, "Hold" label in Ash), with Meta below: "Press and hold to reveal". While pressed, the ring fills clockwise over the hold time. On completion, the seal glows (radial Gilt, up to 40% opacity) and the content card appears instantly above it: Hearth, 1px Stone border, 24px padding. On release, everything hides instantly with no animation.
3. Choice, when needed: full-width name rows, 56px tall, Body Candle, Stone separators. A selected row gets a 4px Gilt left bar and a Gilt tick. "Confirm" sits in the action bar, and confirming needs a second 300ms hold on the seal.
4. Done: "Thanks. Waiting for everyone." for all players, held until the shared minimum duration ends.
   Traitor and Faithful variants must be identical in element count, sizes and colours; only the words differ.

PLAYER SCREENS
P1 Join. Title "Join the _game_". Fields: game code (6 characters, auto-uppercase, unambiguous alphabet, prefilled from the link); "Your name"; "Choose a 4-digit PIN" (numeric keypad, with show and hide). Toggles: "Tap instead of hold", "Larger text", "Simpler words". Primary button "Join". Meta: "No account needed. We only keep your first name."
P2 Waiting room. Title "You're _in_". Subtitle "Waiting for {organiser} to start." Joined names with initials in Hearth circles: Ash initials, no per-player colours. "11 of 15 joined". A collapsible "Add Oathstone to your Home Screen" card with platform-specific steps. Secondary button "Practise the secret screen", which opens P3.
P3 Practice. A PrivateMoment with "This is how secrets appear. Only you can see this while you hold." Then "Done".
P4 Role. Traitor: "You are a _Traitor_", then "Your fellow Traitors: {names}", then "Stay hidden. Choose wisely." Faithful: "You are _Faithful_", then "Find the Traitors before it's too late.", then one more line of equal length. Same layout for both.
P5 Day (public). Title is the phase name; subtitle is the next step and its time; a "Prize pot: {n} {unit}" card; a player grid where those who are out show an "Out" label in Ash, never a role colour; the latest 5 log entries. One button, "Notes", for everyone, opening a PrivateMoment: Traitors get Traitor chat, Faithful get a private notebook, with the same layout and size. Never show a separate "Traitor chat" button.
P6 Vote. A PrivateMoment choice: "Who do you vote to _banish_?"
P7 Shadow. Traitors: "Who will the Traitors _take_ tonight?", plus a line in Ash such as "Sam picked: Alex". Faithful: "Who do you _suspect_ most right now?" with the same list, and an equal-sized Ash line in that slot ("Your answer stays private"). Fellow Traitors are not greyed out; picking one gives a same-looking confirmation, then a private "choose someone else".
P8 Announcement (public). "{Name} was _taken_ in the night" or "No one was _taken_"; "{Name} was _banished_", then their role per config.
P9 Ghost. Banner "You're a _ghost_"; predictions, ghost chat, and referee tools when enabled.
P10 Endgame. A PrivateMoment choice: "_End_ the game" or "_Banish_ again".
P11 Results. "The _Traitors_ win" or "The _Faithful_ win"; the pot split; every role; a link to the fairness check; awards; "View recap".
R1 Rehearsal, from a secondary call to action on the home page, "Try a rehearsal". Title "Rehearse _alone_"; a players slider from 6 to 15; speed "Fast" or "Normal"; "You play one seat; computer players fill the rest." Primary button "Start rehearsal". It then uses the same player screens through the real server.

COPY: UK English, sentence case. The family-friendly wording swaps "murdered" for "taken" and "banished" for "sent home" everywhere.
ACCEPTANCE: Playwright screenshots of every screen on iPhone, Pixel and iPad, saved to docs/screens/; uniformity tests for every PrivateMoment variant, including the Notes screen; axe passing; the font budget met; then the owner's hands-on rehearsal on a real phone (hard stop).

## Amendment 10 — responsive home page and public comparison

Keep section 25's Charcoal, Hearth, Stone, Gilt, Candle and Ash tokens, Playfair Display/DM Sans hierarchy, and outlined brand assets. Headers use one text-only Oathstone wordmark; the Stackstone cairn mark and link stay in the universal footer. The Oathstone emblem stays unused until the owner asks. This is a responsive refinement, not a new visual system. Use only one radial Gilt glow behind the hero title text; it must fade to transparent before reaching the hero boundary. Remove box shadows or pseudo-elements that create visible rectangular edges, including on the role demo.

Mobile priorities: the first viewport contains the separate Oathstone title text and tagline, all three entry actions in the lower thumb zone, and the beginning of the demo directly below the title card. Keep the header compact, safe-area aware and non-overlapping at 320px. Buttons and links have at least 44px targets. Use `clamp()` for fluid type and prevent horizontal overflow. At wider widths, place the title card and live hold demo side by side without removing any entry action.

```text
Mobile, 320–414px                  Desktop, 1280px
+--------------------------+       +----------------------------------------+
| Oathstone          mark  |       | Oathstone     public links       mark  |
|                          |       |                                        |
|        Oathstone         |       | Oathstone                   Hold to    |
| A game of traitors       |       | A game of traitors          see your  |
| and faithful.            |       | and faithful.                role      |
| Everyone plays.          |       | Everyone plays.              [seal]    |
| Even the host.           |       | Even the host.                         |
| [Start a new game]       |       | [Start a new game] [Join a game]       |
| [Join a game]            |       | Practise alone first                    |
| Practise alone first     |       +----------------------------------------+
| made by Stackstone Consulting |
+--------------------------+
| Hold to see your role    |
| [role-neutral seal]      |
+--------------------------+
```

Public comparison stays category-based and uses the exact approved FAQ copy. The home page, `/faq`, `/compare`, `/llms.txt`, and FAQPage JSON-LD read their FAQ entries from one shared locale source. Keep the answer-first home content and fact block server-rendered; pre-launch noindex remains enabled. Do not add competitor product, maker or programme names.

Acceptance checks: capture the home page at 320, 390, 768 and 1280px; also assert no horizontal overflow and at least 44px targets at 320, 375, 390, 414 and 768px. Check the glow and demo at every screenshot width; test each distinct mark fill against every surface on which the mark appears for at least 3:1 contrast. Run mobile Lighthouse for performance, accessibility, SEO and best practices, each at least 95.

## M5 screen set 1 — phone day view and shared announcements

Tokens: section 25's Charcoal, Hearth, Stone, Gilt, Candle and Ash; Playfair Display for the phase title and DM Sans for body and labels. Keep the 480px single-column width, safe-area padding and 56px action targets from the M5 brief.

```text
+------------------------------+
| Oathstone               mark |
| The conversation       12:00 |
| Shared announcement, if any  |
| Prize pot                     |
| 18 points                    |
| Players                      |
| Morgan             Playing   |
| Alex                  Out    |
| Latest updates               |
| ... up to five public events |
|                              |
| [            Notes          ]|
+------------------------------+
```

Alignment: the same public announcement, player statuses, pot, timer and recent public activity appear on every seated phone; none depend on a presenter connection. Alive players have no role colour or role label. Use thin Stone dividers, not a stack of identical cards; keep the announcement as the strongest public element. The Notes action is the only entry to the same-shaped private notes/chat surface for either role. Hide this public room content during a private moment.

Anti-template check: avoid dashboard cards, coloured player avatars, and any role-specific styling. At 320px and 200% text, names, statuses and the Notes action remain readable without horizontal scrolling; respect reduced motion and do not animate ordinary status updates.

## Round 7 Stage 2A — Join, Lobby and Seal

Apply the shared Stage 1 shell to the entry and lobby screens without changing
join validation, approval, game-start, privacy-shield or held-reveal behaviour.
Use the existing day/night game tokens, a 30px Playfair Display screen heading,
the 52px status strip and a fixed 56px primary-action dock with safe-area
clearance. Keep the entry footer for Join and Lobby; the active game shell
continues to hide it during Seal.

```text
Join (short code)
+----------------------------------+
| Oathstone                        |
| Join a game · 0 joined · Live    |
| What is happening                |
| Enter the room code and your name|
| Join a game                      |
| Room code [ ][ ][ ][ ][ ][ ]     |
| First name [__________________]  |
|                                  |
|                       [Continue]|
| Stackstone Consulting            |
+----------------------------------+

Lobby (organiser)
+----------------------------------+
| Oathstone                        |
| Lobby · 3 joined · Live          |
| What is happening                |
| Waiting for players              |
| [QR]      ABC234       [Share]   |
| Players                           |
| [Ada · Joined] [Sam · Joined]    |
| Waiting for approval             |
|                                  |
| [Start the game]                 |
| Stackstone Consulting            |
+----------------------------------+

Seal (all roles, before hold)
+----------------------------------+
| Night/Day · players · connection |
| What is happening                |
| Your role                        |
|                                  |
|            [Hold]                |
|                                  |
|                                  |
|                                  |
+----------------------------------+
```

Join has no game clock until a room is selected, so its phase chip reads
“Join a game” and its default appearance is day. The Join wizard keeps its
existing room-code → name-check → PIN sequence; the short-code and name fields
are presented together, and invite links omit the already-known room code.
Lobby follows its public phase where available and displays the joined count;
only the organiser route receives organiser controls. Entry routes do not show
the in-game Game/Players tabs because there is no active player game yet.
The screen-lock notice moves into the collapsed “What’s this?” help disclosure.
The four existing night status strings remain unchanged inside one shared status
card; no night-specific wording or role-dependent structure changes.

Acceptance: test the short-code join page with a focused field and a simulated
320px-wide keyboard viewport; verify host Lobby and waiting-player states; keep
the Seal card and all pre-reveal DOM identical between roles. Capture Join,
Lobby and sealed Deal at 320, 375, 390, 430 and 1280px in day and night under
`docs/screens/round-7-stage-2a/`.

## Round 5 — phase presentation and night screens

### Implemented palette and review gallery

The day palette retains the original brand tokens as its source. Day button fill is 88% Gilt / 12% Candle to give Charcoal labels AA contrast; ordinary text uses dark ink. The dark wordmark remains Candle/Gilt, while its day version uses Charcoal and a contrasting dark-Gilt accent. The approved Cairn shape is retained, with a dark treatment on light surfaces.

The off-by-default **Always dark** control is under **Display**. Theme choice depends on the public phase, never the role. Night/morning fades are absent with reduced motion.

Final review images and reproduction instructions are in [screens/round-5](screens/round-5/README.md). The matrix covers 320, 375, 390, 430 and 1280 px, both palettes, both role reveals, both night variants, Notes and all public game steps, with header and bottom-stack bounds checks.

Keep the Stackstone talk-slide identity from §25 and the one-column phone layout. Day and night are the only game theme states; the active server phase switches every player's screen together. Home keeps its public-site theme, Join defaults to day, and Lobby follows the public phase when available. Active game screens use the public phase, never the player's role. Each game-step component retains its own content and uses the same header, commentary alignment, action/footer stack and safe-area spacing.

```text
DAY / PUBLIC STEP                    NIGHT / PRIVATE STEP
+------------------------------+     +------------------------------+
| Oathstone             Online |     | Oathstone        Reconnecting|
| Day 2. 7 remain. ...         |     | Night 2. Everyone answers... |
| The conversation             |     | Who will the Traitors take?  |
| Shared public event          |     | You picked: Alex             |
| Players / latest updates     |     | Fellow picks / fixed lines   |
|                              |     |                              |
| [ Notes ]                    |     | [tap-to-select names]        |
|                              |     |                              |
+------------------------------+     +------------------------------+
| [Move everyone on / Next step]|     | [Move everyone on / Next step]|
| made by Stackstone Consulting|     | made by Stackstone Consulting|
+------------------------------+     +------------------------------+

ROLE REVEAL                          BANISHMENT VOTE
+------------------------------+     +------------------------------+
| Oathstone                    |     | Oathstone              Online|
| Your role                    |     | Vote for ... <x> of <y> ...  |
| Shield card                  |     | Who do you vote to banish?   |
|                              |     | It's a tie between <A> and   |
|                              |     | <B>. Vote again, choosing    |
|                              |     | between them.                |
| [hold seal to reveal]        |     | [tap name] [tap name]        |
| [Done]                       |     | You voted for <name>         |
|                              |     | [change while allowed]       |
+------------------------------+     | [Voted/Waiting]               |
| action + fixed-footer stack  |     | action + fixed-footer stack   |
+------------------------------+     +------------------------------+
```

The public-step commentary is derived from the same view used for announcements; never substitute browser-local clocks or role-specific copy into it. Night uses one shield and one continuous private moment: first pick, optional second pick, and keep/change all stay inside the same screen. Faithful predictions use the same screen shape and are visible only to their author. Taps select names; the hold seal reveals only private information.

The completed one-by-one ballot reveal stays in the public VERDICT state with the banished-role line. Hold there until the organiser's “Move everyone on” or rehearsal's “Next step”; show one shield at the start of the night, then keep sequential first/second choice slots and the keep-or-change confirmation on the same screen without repeating the shield or explainer. Preserve the banished player's ballot in the completed reveal and remove all ballot data from player views as soon as the phase leaves VERDICT.

The organizer action and Cairn footer share one fixed surface and sit flush together. Content scrolls as a single page above them with explicit bottom padding. The header reserves its safe-area-adjusted height before either commentary or heading begins. The visible list is compact but never internally scrolls. On each of 320, 375, 390, 430 and desktop widths, in both themes, verify that text stays below the header, content clears the fixed stack, and no horizontal overflow appears.

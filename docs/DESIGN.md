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

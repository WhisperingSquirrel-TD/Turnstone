# Round 5 screen review

The gallery uses the app's real shared components with deterministic HTTP fixtures. The separate real-server rehearsal test proves eight-seat play, no presenter, no refresh, watch mode and phase-driven colour changes.

Each scene has day and night versions at widths **320, 360, 375, 390, 430 and 1280 px** (regenerated 26 October 2026 after the rename). The gallery forces palettes only inside the test so the same scene can be compared; the running game uses its public clock, with an optional **Always dark** display setting.

Scenes: lobby, shield before the role, held Faithful role, held Traitor role, mission, conversation, Notes, vote, verdict, shield before night, Faithful night, Traitor night, dawn, endgame, end/continue decision, final banishment and results.

The matrix checks that headings/commentary do not intersect the header, there is no horizontal or nested main scrolling, held role content stays in the viewport, the last action scrolls clear of the fixed bottom stack, and the action bar meets the full-width footer without a gap. Each viewport starts fresh before revealing a secret; the test does not disable privacy interruption handling.

Regenerate from the repository root:

```sh
R5_CAPTURE_SCREENS=1 bash scripts/browser-runtime.sh pnpm exec playwright test \
  --project=Pixel e2e/player-public-room.spec.ts -g 'Round 5 screen matrix' --workers=1
```

Screenshots use CSS-pixel resolution and JPEG quality 72 to keep review assets small. CI runs the geometry assertions without writing the gallery.

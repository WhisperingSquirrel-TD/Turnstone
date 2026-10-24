# Round 7 Stage 2A screenshots

Each screen has day and night captures at 320, 375, 390, 430 and 1280 px:

- `join-*`: combined short-code and first-name entry screen.
- `lobby-*`: organiser lobby with five joined players and the fixed start dock.
- `seal-*`: role-neutral Deal screen before the player holds to reveal.

Generated from the real UI with the Pixel Playwright profile:

```sh
R7_STAGE_2A_CAPTURE=1 bash scripts/browser-runtime.sh pnpm exec playwright test e2e/player-public-room.spec.ts --grep 'Round 7 Stage 2A Join and Lobby' --project=Pixel --workers=1
R7_STAGE_2A_CAPTURE=1 bash scripts/browser-runtime.sh pnpm exec playwright test e2e/player-public-room.spec.ts --grep 'held role text stays above the seal' --project=Pixel --workers=1
```

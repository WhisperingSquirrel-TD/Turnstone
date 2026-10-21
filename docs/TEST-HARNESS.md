# Full-game virtual-player test harness

## H1 status

H1 runs one seeded six-player game against the real API server and web client. Each player has a separate Playwright `BrowserContext`, with independent cookies and storage. The seed is replayable, and assignments include desktop Chromium and a Pixel Chromium phone profile.

Virtual players use the visible interface: labelled controls and visible text, with ordinary pointer or touch input. They do not call game APIs or import engine code to perform player actions.

The progress watchdog tracks visible screen changes. If a player's screen stalls, the failure output identifies the seed, scenario, player, persona and phase, and attaches that player's screenshot, DOM snapshot, Playwright trace and short video.

The server timer and random stream are test-only inputs. The short timer is enabled only in the test environment with the explicit test flag; production defaults remain unchanged. The web build does not contain the server test hooks.

Replay H1 with:

```sh
VIRTUAL_PLAYER_SEED=h1-seed-6001 REHEARSAL_PROFILE=Pixel bash scripts/browser-runtime.sh pnpm exec playwright test --config=playwright.rehearsal.config.ts --grep @virtual-player-h1 --timeout=540000
```

The browser run uses emulated desktop and Pixel devices; it is not a physical-phone test. WebKit, away-and-back personas, larger scenarios, continuous secrecy/usability scans, CI smoke wiring and capacity reporting remain for later harness stages. The bot can report mission tasks but cannot establish whether a real-world task actually happened.

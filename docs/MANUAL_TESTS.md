# Manual test checklist

Not executed yet; do not count these as passed.

## Milestone 0

- Home and `/play` at 320 px, portrait/landscape and 200%/400% zoom; no clipped text or horizontal scrolling.
- iPhone Safari, Android Chrome, iPad Safari, desktop keyboard: navigation, reload and readable text.
- VoiceOver/TalkBack: skip link, nav landmarks, one h1, main, footer.
- Keyboard-only: visible focus and logical order; no trap.
- Verify direct navigation and reload on `/play`; missing page explains how to return.
- Verify no fake join/start controls, no seasonal or prohibited branding.
- Inspect CSP/nonces for web and API, HSTS, frame restrictions and no-referrer.
- Temporarily remove required config in an isolated test process: clear key-only startup error, no secret value.
- Unavailable database: live health succeeds, readiness fails without connection details.

## Later milestones, after SPEC

Shield hold/release/pointer-cancel/page-hide; shoulder-surfing uniformity and decoys; blind playing coordinator/admin; shared/no-phone alternatives; phone locking/reloads; network loss/reconnect; duplicate commands; scheduler restart/deadline recovery; screen reader interaction; commitment verification. These are unimplemented, not passing tests.

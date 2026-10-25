# Initial layout-audit gallery

This is the **first, incomplete** gallery, not a claim that every screen has
passed the full automatic audit. See the normal-scroll-boundary question in
`docs/QUESTIONS.md`.

72 JPEGs cover 320, 360, 390 and 430 CSS pixels:

- Create: game name, player count, empty name/PIN, presenter unchecked/checked,
  completed voting settings.
- Organiser Lobby, Join and Practice setup.

`light` and `dark` filenames record the operating-system colour scheme. Entry
forms currently intentionally retain the paper appearance under both schemes.
The Create flow has three route screens; its name/PIN and voting areas are
captured separately as reachable states, not presented as a new fourth route.

Regenerate this initial gallery:

```
R7_AUDIT_CAPTURE=1 bash scripts/browser-runtime.sh pnpm exec playwright test e2e/create-layout-regressions.spec.ts --project=Pixel --workers=1
```

The remaining player Lobby, game, error and overlay inventory is still pending,
not omitted from a purported complete pass.

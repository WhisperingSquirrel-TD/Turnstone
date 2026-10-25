# Round 7 application-state layout-audit gallery

## Current full matrix

71 named states at 320, 360, 390 and 430 CSS pixels, day/night: 568 canonical
Pixel JPEGs. Earlier focused captures are retained alongside them.

Coverage includes entry/Menu; Join empty, ready, PIN and waiting; Create
name/count/name-PIN, checked/unchecked presenter and voting settings; Practice
form/finale; organiser/player Lobby; Deal shield, sealed, held, released,
Help and Players; Conversation, Notes empty/with draft, Menu/Display; Vote
selected/review/Players, Revote and Verdict including no votes; Night shield,
choices/review, both private-role fixtures and slot 2; Dawn, missions, endgame,
final vote/banishment, both public results and a settled error screen.

The real UI uses controlled HTTP/socket fixtures, not claims about server
behaviour. Existing real-server gates remain unchanged. Forms intentionally
retain paper under both system schemes. The full scan currently fails strict
at-rest body/dock overlap; see the open viewport-contract decision in QUESTIONS.
Those findings are not waived or claimed green.

## Original focused captures (historical)

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

---
name: Game end date and clear-down
description: Real games carry a UK last day and are deleted the next day; practice games after 24 h idle; dry-run unless the owner switches it on.
---

D117. Every real game has `game_end_date` (UK calendar day, today to six
months ahead, checked by `checkGameEndDate` in `lib/shared/src/game-end-date.ts`
on both client and server). Deletion is the day after; practice games go after
24 hours idle. `runClearDown` (`lib/db/src/clear-down.ts`) holds an advisory
lock, deletes one game per transaction (tombstone then the `games` row; the
cascades remove the rest) and never runs while a deadline is in the future.

`OATHSTONE_CLEARDOWN_MODE` defaults to `dry-run`. Never set production to
`delete` without the owner's approval. Logs carry counts only.

Gotchas: any game-store mock must provide `readGameEndDate` and
`readGameTombstone`, or routes answer 503. A missing game with a tombstone
answers 410, which the client shows as "This game has ended and been cleared."
The date inputs use `noValidate` so the app's own message, not the browser's
`min` bubble, explains a past date.

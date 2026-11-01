---
name: First-paint parity
description: The static entry must use the app welcome's markup and CSS, or the page visibly jumps.
---

`renderGameEntryHtml` (served before the app's script loads) once had its own
markup and `.game-entry-static` styles, which drifted from the app welcome:
the owner saw a left-aligned, all-bordered page switch to the real one.

**Why:** two copies of a layout always drift; on a phone the static page is
visible for a noticeable moment, longer in the Replit preview.

**How to apply:** change the welcome screen and the static entry together
(same classes, links for buttons). `e2e/entry-first-paint.spec.ts` compares
both within 2px at 320/390/430 and checks the dark-phone theme; keep it
passing rather than widening its tolerance.

A workspace `git reset --hard` skips `scripts/post-merge.sh`, so the
preview's development database can miss new migrations; apply new files in
`lib/db/migrations` with psql before testing the preview (see LAUNCH step 1).

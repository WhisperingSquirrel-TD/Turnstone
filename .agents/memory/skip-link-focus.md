---
name: Skip link focus without layout shift
description: The focused skip link must not enter the flow or cover the header; the audit checks it while focused.
---

The shell's skip link (`a[href='#main']` in `App.tsx`) stays absolutely
positioned when focused. While it has focus the header beside it is made
transparent (`.safe-page:has(> a[href='#main']:focus) > header`), so the link
takes the header's place without covering it or reserving space. A pointer
press anywhere else blurs it, even on controls that cancel pointerdown.

**Why:** `a[href='#main']:focus { position: relative }` once put the 44px link
in the flex flow to satisfy the layout audit's overlap check. Leaving it then
moved every control up 44px mid-tap, so a radio tap landed on its fieldset.
The audit's focus pass deliberately leaves focus on the skip link and audits
the next state with it visible, so a plain overlay fails "overlap" and
"centre-not-hittable" (deal-held, deal-released).

**How to apply:** Never solve skip-link overlap by putting it in flow or by
exempting it in the audit. `e2e/skip-link-focus.spec.ts` guards the position
of a game control across focus and blur, and the pointer dismissal. Use
opacity (not visibility or display) to hide the header so it stays in the
Tab order.

---
name: Control spacing audit
description: Separate controls need 8px; the overlap rule alone let touching buttons pass.
---

The layout audit's overlap rule only fails when boxes intersect, so two
buttons with 0px between them passed (owner screenshot, 1 November 2026: Back
under Continue). `control-spacing-under-8` in `e2e/support/layout-audit.ts`
now requires 8px between separate controls in the same layer (D122).

**Why:** `margin-top: auto` on `.entry-back-action` gives no space when the
panel does not stretch, and grid `gap-1` (4px) made vote tiles feel joined.

**How to apply:** give stacks of controls a real gap (8px minimum). Mark a
genuinely single composite control with `data-control-segment` rather than
loosening the rule. Do not exempt anything else without an owner decision.

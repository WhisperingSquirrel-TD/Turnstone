---
name: Entry prerender readiness
description: Distinguish styled no-JS entry HTML from the hydrated screen being tested.
---

Real-UI journeys and state galleries must wait for the intended hydrated
screen, not just a styled heading or a no-JS fallback link. Test the fallback
separately with JavaScript disabled.

**Why:** A Join fallback anchor was replaced by the React button during a
click, and the layout gallery mislabeled the same fallback as several setup
states. CSS readiness alone did not establish application-state readiness.

**How to apply:** Wait for the real control's role and the requested screen's
heading/form before acting or auditing. Keep the strict geometry checks;
fix fallback spacing independently rather than exempting it.

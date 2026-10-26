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

**Measured-copy corollary (Verify #311):** the public-page width test raced
the static first paint against hydration, so the hydrated entry's 14px credit
failed only when WebKit hydrated first. Its `footer .brand-credit` selector
also matched nothing (the footer itself carries `.brand-credit`), and the
credit's `<small>` rendered at 80% (11.2px). Wait for the hydrated control
before measuring, and select the element that actually holds the text.

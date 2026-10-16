---
name: Public copy test surfaces
description: Test public marketing and FAQ copy on the rendered surface where it appears.
---

For public copy that appears in both a landing-page preview and a full FAQ or detail view, verify each rendered surface separately. An excerpt or question-only preview may intentionally omit the answer text.

**Why:** A home-page smoke test was initially pointed at the FAQ preview for answer copy, so it misreported correctly updated text as missing.

**How to apply:** Check the actual rendered markup and interaction before choosing an assertion. Test preview text on the preview and expanded answers on the full detail surface.

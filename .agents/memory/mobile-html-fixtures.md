---
name: Mobile HTML fixture viewport
description: Why a controlled HTML fixture can silently use a desktop-width layout on a phone profile.
---

Include a viewport meta tag in handcrafted mobile HTML fixtures, not only in the application.

**Why:** A geometry reproducer passed on desktop but missed real viewport clipping on Pixel because bare HTML used the mobile browser's approximately 980px layout viewport despite a narrower configured device viewport.

**How to apply:** For `page.setContent` phone fixtures, set device-width and initial-scale before comparing CSS boxes with the configured viewport. Do not loosen the geometry expectation to accommodate the wrong layout viewport.

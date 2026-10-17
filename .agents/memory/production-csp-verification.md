---
name: Production CSP browser verification
description: Why built-server security changes need actual Chromium and WebKit checks, not only Vite.
---

Verify static-document CSP using the built client through the Node server on both Pixel Chromium and actual iPhone WebKit. Successful hydration alone is not enough; capture blocked-resource console messages and check JavaScript-disabled first paint.

**Why:** Vite's development policy did not expose production restrictions. Chromium hydrated successfully while WebKit reported the manifest blocked by `default-src 'none'`; a same-origin manifest directive was also required.

**How to apply:** Keep the production smoke check whenever changing static security headers, manifests or first-paint output. Do not loosen CSP or substitute an iPhone-sized Chromium viewport for WebKit.

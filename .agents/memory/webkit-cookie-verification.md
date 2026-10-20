---
name: WebKit cookie verification
description: Reliable Playwright checks for persisted seat cookies on iPhone WebKit.
---

`page.route()` request-header inspection can observe a WebKit request before the browser attaches its cookies, so a missing `Cookie` header in a route mock does not prove that the browser omitted it.

**Why:** the cold-seat test failed on iPhone while the browser context held the cookie, then passed when requests traversed the Vite proxy to an HTTP test server that returned the fixture only for the expected seat cookie.

**How to apply:** For iPhone/Android session-restoration tests, exercise a real same-origin endpoint through the configured proxy and gate its response on the cookie. Do not infer cookie delivery from intercepted request headers.

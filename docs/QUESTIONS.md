# Open owner questions

## Q2 — How late joiners enter after the lobby invitation closes

**Question:** How does a permitted late joiner enter after the original room
code/link has closed at game start?

**Recommendation:** The organiser issues a fresh invitation link or QR, without
reopening the original room code. Apply the configured late-joining window,
organiser approval, rate limits and the always-Faithful rule.

**Reasoning:** A fresh invitation separates the public lobby invitation from
explicitly authorised late joining and avoids making a closed code usable again.

**Status:** Resolved by the owner on 15 October 2026: fresh invitation link or QR.
Implemented with coordinator-issued links/QRs, approval, limits and an
always-Faithful integration regression. The full local gate passed on 15 October
2026; GitHub CI follows the push.

## Q1 — Lighthouse SEO score while pre-launch noindex is enabled

**Question:** Should the SEO score be measured against an isolated launch-mode
test fixture with indexing enabled, while the actual preview and build continue
to send `X-Robots-Tag: noindex, nofollow` and disallow crawlers?

**Recommendation:** Yes. Measure the public page's launch-ready SEO quality in
the test-only fixture, and keep a separate regression check proving that the
normal pre-launch build remains unindexable.

**Reasoning:** The required pre-launch privacy policy intentionally fails
Lighthouse's `is-crawlable` audit. The home page otherwise scores 100 for SEO
checks; the intentional noindex is the sole failing SEO audit. Skipping that
audit would misstate Lighthouse's score, while disabling noindex in the actual
preview would violate the standing privacy rule.

**Status:** Resolved by the owner on 14 October 2026: keep the launch-mode
fixture test-only and retain the regression proving real builds stay noindex.

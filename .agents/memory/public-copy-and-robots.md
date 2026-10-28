---
name: Public copy, robots and the missions switch
description: Pre-launch robots lets agents read public pages but everything stays noindex; no sitemap; public FAQ/steps/formats come from publicSiteCopy() driven by config.missionsAvailable.
---

D119. `renderRobotsTxt` (lib/security/src/deployment.ts) is the only place
robots rules live. Pre-launch it allows the public pages and `/llms.txt` and
disallows app routes, `/api/`, `/socket.io/` and `/*?`; every route still
sends noindex. `artifacts/party-game/public/robots.txt` must equal its
pre-launch output (tests/pipeline.test.ts) and the server refuses to start if
the built file differs. No sitemap unless coming-soon mode.

Public copy: never read `en.publicSite.faq`, `.howItWorks` or `.formats`
directly; use `publicSiteCopy()` (artifacts/party-game/src/public-copy.ts).
`config.missionsAvailable` (false in the beta) also sets
`missions.enabled` for new games. The eleven FAQ answers are fixed text
shared with the company page; change them only on the owner's say-so.

Public pages are canonical to the company page in pre-launch; coming-soon
mode keeps per-page canonicals on the game domain. New footer links need
the 44 px tap-target rule (`.public-cross-links a`).

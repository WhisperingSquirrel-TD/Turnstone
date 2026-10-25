---
name: Game chrome placement
description: Owner's standing rule for header and footer placement on all Oathstone game screens.
---

Game pages scroll as a whole when their content needs it; do not create independently scrolling main panes or choice lists. Held secrets and full-screen dialogs lock background scrolling. The Oathstone header aligns to the same centred content column as game content, including on desktop. The owner's 25 October 2026 instruction restores “made by Stackstone Consulting” with the official logo and a link to the actual company website on every screen, including entry, private, loading and error screens. This supersedes the earlier Round 7 instruction to hide branding during play. No action bar, alert or overlay content may cover it.

**Why:** the owner explicitly requested the credit everywhere after it was lost during the redesign, and reported real-phone player-name wrapping and content hidden behind bottom controls. The existing whole-page scrolling rule still applies; do not restore an inner scroll pane to satisfy obsolete assertions.

**How to apply:** test short and long screens at 320×568 and desktop widths, reserve the measured footer, tabs and action height, and verify that the last control scrolls fully clear and is the real pointer hit target. Measure the active shell's stack, not hidden privacy-dialog copies: closing a cover must not zero the footer reservation. Check header alignment, official light/dark assets and the company link across public, game and overlay screens.

---
name: Game chrome placement
description: Owner's standing rule for header and footer placement on all Oathstone game screens.
---

Game pages use one main scroll area above the fixed bottom controls, not whole-page scrolling or nested choice-list scrollers. The owner explicitly approved this on 25 October 2026. Held secrets and full-screen dialogs lock background scrolling. The Oathstone header aligns to the same centred content column as game content, including on desktop. The owner's 25 October 2026 instruction restores “made by Stackstone Consulting” with the official logo and a link to the actual company website on every screen, including entry, private, loading and error screens. This supersedes the earlier Round 7 instruction to hide branding during play. No action bar, alert or overlay content may cover it.

**Why:** the owner requested the credit everywhere and then approved the bounded main scroll area so content cannot paint beneath fixed controls at rest. This supersedes the earlier whole-page requirement; do not retain stale assertions that force content under the dock.

**How to apply:** test short and long screens at 320×568 and desktop widths, reserve the measured footer, tabs and action height, and verify that the last control scrolls fully clear and is the real pointer hit target. Measure the active shell's stack, not hidden privacy-dialog copies: closing a cover must not zero the footer reservation. Check header alignment, official light/dark assets and the company link across public, game and overlay screens.

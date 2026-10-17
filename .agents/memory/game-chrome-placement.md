---
name: Game chrome placement
description: Owner's standing rule for header and footer placement on all Turnstone game screens.
---

Game pages scroll as a whole when their content needs it; do not create independently scrolling main panes or choice lists. Held secrets and full-screen dialogs lock background scrolling. The Turnstone header aligns to the same centred content column as game content, including on desktop. The “made by Stackstone Consulting” footer stays at the viewport bottom, safe-area-aware, and visible on every game screen; its divider matches the public-site footer width. No action bar, alert or overlay content may cover it.

**Why:** the owner's Round 5 brief explicitly replaced the earlier viewport-locked shell with whole-page scrolling, while retaining the consistent header, unobscured footer and no-overlap requirements. Do not restore the old inner scroll pane to satisfy obsolete assertions.

**How to apply:** test short and long screens at 320×568 and desktop widths, scroll the document only when content needs it, reserve the measured fixed-control/footer height, and verify that the last control scrolls fully clear of that stack. Check header alignment and matching footer/divider bounds across public, game and overlay screens.

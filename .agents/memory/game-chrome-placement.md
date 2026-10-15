---
name: Game chrome placement
description: Owner's standing rule for header and footer placement on all Turnstone game screens.
---

The game shell is viewport-locked so the document cannot scroll behind fixed controls. Choice screens should use the available viewport without an unnecessary scroll region or independently scrolling choice list; when content genuinely exceeds the available space, scroll only the main region. Full-screen overlays lock the background and scroll only if their own content exceeds the viewport. The Turnstone wordmark stays at the same safe-area top-left inset on every game screen. The “made by Stackstone Consulting” footer stays at the viewport bottom, safe-area-aware, and visible on every game screen; its divider matches the public-site footer width. No action bar, alert or overlay content may cover it.

**Why:** the owner reported variable header and footer placement, page scrolling behind fixed game controls, unnecessary scrollbars when content fits, and a divider that was too short in-game.

**How to apply:** lock the game shell to the viewport, test short and long choice screens at 320×568, contain only necessary scrolling in the main region, lock it behind full-screen overlays, reserve space for fixed controls and the footer, and use the same footer-width token in public, game and overlay footers.

---
name: Nix font rendering
description: Fontconfig may not select a downloaded user font even when a browser can render it.
---

For SVGs whose lettering depends on an external web font, do not trust `fc-list` or `fc-match` alone as proof that a command-line converter will use the intended face. In this Nix workspace, browser rendering with the actual licensed font was reliable even when command-line font matching selected a fallback.

**Why:** Silent font substitution changes the shape of converted wordmarks while still producing valid SVG paths.

**How to apply:** Load the intended licensed font in Playwright, measure or verify the source lettering there, and compare the outlined result visually in the browser before using it.

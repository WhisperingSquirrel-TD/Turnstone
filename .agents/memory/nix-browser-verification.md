---
name: Nix browser verification
description: Why native package installation is not sufficient evidence of usable mobile WebKit in this workspace.
---

Do not equate a successful native package installation, loader preflight or browser launch with successful WebKit page rendering in this Nix environment.

**Why:** Multiple dependency approaches cleared loader failures, but the Ubuntu-packaged headless WebKit renderer still aborted on page creation because no supported EGL platform was available. Its launcher/library-cache assumptions also differ from Nix runtime outputs.

**How to apply:** Before promising iPhone/iPad verification, create and render an actual page in the requested WebKit engine with a compatible headless graphics/display backend. Keep failed profiles visibly failed; do not substitute Chromium, skip assertions, or advance a milestone on partial browser evidence. For local Chromium Pixel checks, the cached Nix Mesa library must also be exposed to the Playwright process through `LD_LIBRARY_PATH`; installing system dependencies alone did not make `libgbm.so.1` discoverable. Keep WebKit verification in GitHub Actions.

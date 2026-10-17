---
name: Nix browser verification
description: Why native package installation is not sufficient evidence of usable mobile WebKit in this workspace.
---

Do not equate a successful native package installation, loader preflight or browser launch with successful WebKit page rendering in this Nix environment.

**Why:** Loader preflight alone cleared library errors but rendering still failed without a supported EGL platform. Mesa's EGL vendor, software drivers and surfaceless platform enabled actual iPhone WebKit rendering and reproduced a footer interception that Chromium did not.

**How to apply:** Use the project's browser-runtime wrapper and verify actual rendering, not just launch. Keep failed profiles visibly failed; never substitute Chromium or skip assertions. Nix library outputs and Mesa's EGL vendor/driver discovery must all reach the browser process; installing system packages alone is insufficient.

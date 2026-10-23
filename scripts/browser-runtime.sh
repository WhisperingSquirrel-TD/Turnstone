#!/usr/bin/env bash
set -euo pipefail
if [[ "${CI:-}" == "true" ]]; then
  # CI uses the lockfile-matched official Playwright container with browser dependencies included.
  exec "$@"
fi
# Nix's selected executable outputs omit several native browser runtime outputs.
# Resolve ABI-correct outputs; never alias incompatible library versions or skip
# Playwright's host validation.
runtime="$(nix-build --no-out-link scripts/browser-libs.nix)"
export LD_LIBRARY_PATH="$runtime/lib:$runtime/lib/gstreamer-1.0${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export __EGL_VENDOR_LIBRARY_FILENAMES="$runtime/share/glvnd/egl_vendor.d/50_mesa.json"
export LIBGL_DRIVERS_PATH="$runtime/lib/dri"
export LIBGL_ALWAYS_SOFTWARE=1
export EGL_PLATFORM=surfaceless
export WEBKIT_TEST_EXECUTABLE="$(node scripts/src/native-webkit.mjs)"
exec "$@"

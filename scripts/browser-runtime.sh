#!/usr/bin/env bash
set -euo pipefail
if [[ "${CI:-}" == "true" ]]; then
  # Ubuntu CI uses Playwright's official --with-deps installation, not Nix.
  exec "$@"
fi
# Nix's selected executable outputs omit several native browser runtime outputs.
# Resolve ABI-correct outputs; never alias incompatible library versions or skip
# Playwright's host validation.
runtime="$(nix-build --no-out-link scripts/browser-libs.nix)"
export LD_LIBRARY_PATH="$runtime/lib:$runtime/lib/gstreamer-1.0${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export WEBKIT_TEST_EXECUTABLE="$(node scripts/src/native-webkit.mjs)"
exec "$@"

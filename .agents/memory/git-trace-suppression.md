---
name: Git credential diagnostic suppression
description: Disable Git curl diagnostics by unsetting verbose variables during credential-bearing pushes.
---

Unset `GIT_CURL_VERBOSE` for authenticated Git commands; assigning it `0` still
enables curl diagnostics because Git treats the variable's presence as enabling
verbosity. Also unset `GIT_TRACE_CURL` and other trace variables rather than
relying on inherited settings.

**Why:** An owner-authorised push with `GIT_CURL_VERBOSE=0` unexpectedly emitted
HTTP diagnostics. Git redacted the authorisation values, but suppressing
diagnostics is safer than relying on that redaction.

**How to apply:** Use an `env -u` wrapper for push and fetch, retain the ephemeral
credential helper, keep the remote credential-free, and never put a token in a
URL or trace output.

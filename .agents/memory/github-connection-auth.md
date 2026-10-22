---
name: Git and integration authentication
description: The Git CLI credential and configured GitHub App connection may have different validity.
---

A failed saved Git CLI credential does not prove the configured GitHub integration is unusable.

**Why:** A normal source push failed authentication while the existing GitHub App connection could perform the authorised repository update without new permissions.

**How to apply:** Use the configured integration without reading credentials when authorised. For an API-based commit, compare the resulting tree with the locally tested Git tree, check the expected parent and update the branch without force. Never use a different connection to evade a permission denial, workflow restriction or owner prohibition.

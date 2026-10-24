---
name: Rehearsal overlay test order
description: Real-server rehearsal tests must respect blocking privacy and guide overlays before opening shared help.
---

Complete any visible full-screen guide and private-screen acknowledgement before interacting with underlying help disclosures. When shared shell help and phase-specific help use the same summary text, select the phase-specific disclosure by its unique content or container.

**Why:** The overlays correctly block pointer events beneath them, and moving shared help into the shell can create multiple disclosures with identical labels.

**How to apply:** In real-server browser tests, exercise the visible guide and privacy steps first, then open the intended help disclosure with a scoped locator; do not bypass the overlay.

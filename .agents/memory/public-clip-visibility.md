---
name: Public clip visibility
description: Why playing media can remain hidden beneath private-screen covers, and how to verify it without weakening privacy.
---

Keep privacy covers intact when fixing decorative clips. A playing video with a visible DOM box is not proof that the player can see or tap it.

**Why:** Native modal dialogs occupy a browser top layer above ordinary z-indexes. The opener could play behind the role-neutral cover, so earlier DOM-only checks missed the defect.

**How to apply:** Check actual hit targets or pixels with the cover present, in both Practice and normal play. Preserve the cover's secrecy, focus and timing. Opening clips also need evidence of a genuinely fresh start: a recently started Deal phase alone is not permission to replay on reload or return.

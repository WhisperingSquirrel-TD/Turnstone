---
name: Invite closure and seat recovery
description: Keep existing-seat recovery independent from the eligibility and lifetime of joining invitations.
---

Closing or rotating a joining invitation must not prevent an existing seat from
recovering with its game code, name and PIN. Keep only a hashed recovery locator;
do not retain the readable room code after the lobby closes.

**Why:** Real phones die or are replaced after play starts. Requiring an active
joining invitation for recovery locked out a seat even with the correct PIN.
Fresh late-join links must not change an existing player's recovery identity.

**How to apply:** When changing invitation closure, expiry or rotation, prove
recovery still works for an existing seat, rejects a wrong PIN and revokes the old
device. Keep recovery separate from permission to add a new seat: the old code
must remain unusable for joining.

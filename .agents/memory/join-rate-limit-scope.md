---
name: Join rate-limit scope
description: Preserve shared-Wi-Fi join capacity without removing abuse protection.
---

One Oathstone game can have 5–40 players sharing one egress IP. Join attempts therefore need a per-game (or game-code) plus IP budget, not a low global IP limit that blocks a legitimate room. Keep a separate finite IP-wide abuse budget, keep game creation limited per IP, and keep PIN failures and recovery throttles isolated per seat.

**Why:** the owner confirmed that full rooms commonly join from the same Wi-Fi and approved preserving the five-to-forty-player flow while retaining abuse safeguards.

**How to apply:** when changing join, recovery or invite throttles, test 40 users from one IP, isolation between games, the per-seat PIN lockout, and the per-IP game-creation cap. Never solve shared-IP contention by removing all limits.

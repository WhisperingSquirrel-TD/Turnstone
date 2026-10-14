---
name: Scenario RNG isolation
description: Deterministic bot simulations and full-server command-trace replay must not share random draws.
---

Use independent deterministic random streams for scenario bot choices and engine decisions. A captured trace contains the bot's already-selected commands; if the simulator uses the engine stream for bot choices, the real server does not consume those extra draws and later engine tie-breaks diverge despite receiving the same commands.

**Why:** Full HTTP/Socket.IO replay across a server restart exposed a late event mismatch at an endgame random tie-break, although earlier views matched.

**How to apply:** Keep bot randomness separate from the engine seed in scenario simulations. For server replay, compare persisted event sequences and each viewer's projected views, not only the final winner. Production randomness remains cryptographically secure.

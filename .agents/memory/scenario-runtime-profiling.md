---
name: Scenario runtime profiling
description: Diagnose CI scenario time budgets using matched CPU-limited profiles, not local wall time alone.
---

Profile a complete slow shard under constrained CPU affinity before assuming
that shard scheduling is the dominant cost. Keep assertions enabled and compare
complete scenario outputs, excluding timing fields only.

**Why:** Two scheduling/planning improvements passed locally but still exceeded
the GitHub budget. Matched two-CPU profiles showed nearly continuous worker
utilisation and repeated projection validation dominating CPU, not queue idle
time. Workspace timings alone did not predict CI success.

**How to apply:** Separate planning, worker utilisation and CPU hotspots; keep
profiler settings identical for before/after measurements. Treat CPU affinity as
capacity emulation, never an exact replica of GitHub hardware. CI remains the
authority for its runtime gate.

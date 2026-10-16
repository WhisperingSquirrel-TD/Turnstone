---
name: Rehearsal vote advancement
description: The explicit transition required before rehearsal ballots resolve.
---

In rehearsal, submitting the final ballot does not close the vote. The coordinator's “Next step” action advances the server state; a tied re-vote and its candidates are visible only after that transition.

**Why:** Live rehearsal tests that waited for a tie immediately after submitting the last vote timed out even though the ballot itself was valid.

**How to apply:** In real-server rehearsal tests, submit the ballots, invoke “Next step”, then assert the resulting vote outcome or re-vote candidate set.

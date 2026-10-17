# Release register

No production deployment has been performed or authorised.

## Release gate

1. Select an exact commit on `main` whose GitHub Verify run is **Success**, including all required jobs. A cancelled/red run is not eligible.
2. Record the commit SHA, run number/ID/link, owner's explicit approval, date/time and intended VM size before publishing.
3. Build and release the public client and Node API/socket/scheduler from that same commit, using the preparation step in `HOSTING.md`. Do not deploy an independently versioned frontend.
4. Follow the owner checklist in `HOSTING.md`; no production secrets, domain, DNS or spend changes without approval. Keep noindex until separate launch approval.
5. After an eventual authorised release, record health/readiness/reconnect checks and the previous green commit available for rollback. Do not describe an unperformed deployment as successful.

## Verified development baseline

- `f61ff585b0c0bdaca8be8ca39ed90aa10e2f25c9` — Round 5; [Verify #126, run 39022854952](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/39022854952), **Success**, all 19 jobs. This is CI evidence, not owner phone acceptance or deployment approval.
- M4b source preparation is pending its own Verify result. Its successful commit/run must be added before it can be considered for an owner-approved release.

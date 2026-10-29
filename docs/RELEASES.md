# Release register

Production is live at https://oathstone.stackstoneconsulting.co.uk (owner-published from Replit). See Releases below.

## Release gate

1. Select an exact commit on `main` whose GitHub Verify run is **Success**, including all required jobs. A cancelled/red run is not eligible.
2. Record the commit SHA, run number/ID/link, owner's explicit approval, date/time and intended VM size before publishing.
3. Build and release the public client and Node API/socket/scheduler from that same commit, using the preparation step in `HOSTING.md`. Do not deploy an independently versioned frontend.
4. Follow the owner checklist in `HOSTING.md`; no production secrets, domain, DNS or spend changes without approval. Keep noindex until separate launch approval.
5. After an eventual authorised release, record health/readiness/reconnect checks and the previous green commit available for rollback. Do not describe an unperformed deployment as successful.

## Verified development baseline

- `f61ff585b0c0bdaca8be8ca39ed90aa10e2f25c9` — Round 5; [Verify #126, run 39022854952](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/39022854952), **Success**, all 19 jobs. This is CI evidence, not owner phone acceptance or deployment approval.
- `5654db3d611976c1e64f471d5b4f6d06d859cca4` — M4b server preparation and owner checklist; [Verify #127, run 39026343438](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/39026343438), **Success**, all 19 jobs, public page checked. No production release or owner deployment approval.

## Releases

- **28 October 2026: October beta (D119).** Release commit `ecfc2f2` (code
  identical to `dac10e8`); [Verify #353, run 40721439014](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/40721439014),
  **Success**. Tom published from Replit after pulling main; production
  migrations 0000 to 0014 recorded or applied; `OATHSTONE_CLEARDOWN_MODE=delete`.
  Rollback commit: `157baca`, [Verify #352, run 40718746739](https://github.com/WhisperingSquirrel-TD/Turnstone/actions/runs/40718746739),
  **Success** (the last green commit before this release). `f6d02bb` (Verify
  #354, red on a flaky browser test, docs-only change) is not a release
  candidate. Owner to confirm the exact published commit if it differs.

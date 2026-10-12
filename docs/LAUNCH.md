# Launch gate — not ready

Do not publish as a playable game.

- [ ] Binding SPEC sections 1–19 supplied and requirements traced.
- [ ] Each Must milestone accepted with a fully green `npm run verify`.
- [ ] Real `verify:full` succeeds with coverage in `SCENARIO_REPORT.md`.
- [ ] No high/critical audit findings; no security stubs or exclusions.
- [ ] Threat model and secret-leak/restart/concurrency tests reviewed.
- [ ] Manual WCAG 2.2 AA and real Android/iPhone/iPad testing complete.
- [ ] Public site prerendering/metadata and private-route no-index/cache policy complete.
- [ ] Secret/environment configuration validated without exposing values.
- [ ] Explicitly approved Reserved VM, one instance, never Autoscale.
- [ ] Production migration plan, recovery/backup and durable scheduler restart verified.
- [ ] Final privacy/retention notice and provider consent flows reviewed.

Per-response CSP nonces require the Node web server, not static HTML hosting.
No publish action has been taken.

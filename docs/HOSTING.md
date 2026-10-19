# Hosting decision and owner checklist

## Approved direction

On 14 October 2026 the owner chose one Replit Reserved VM deployment for Oathstone. After separate launch approval, that one deployment will serve the public pages, app shell/PWA, API, Socket.IO and durable scheduler from `https://oathstone.stackstoneconsulting.co.uk`. There is no Vercel deployment and no `live.` subdomain. Stackstone Consulting's company site stays separate and is expected to redirect `stackstoneconsulting.co.uk/oathstone` to Oathstone.

The public shell and game server release together; no N-1 compatibility between independently deployed shell and server versions is required. The client uses relative same-origin `/api` and `/socket.io` paths and does not bake in an API host.

## Current status and limits

- This is a hosting decision, not an enabled deployment. No Replit publish, Reserved VM, production domain, DNS change, production secret or paid capacity test is authorised yet.
- `vercel.json` and any related Vercel configuration/tests are retained in the repository but are unused. They may be reconsidered as a 2027 option; do not add Vercel-specific work now.
- Keep `PRE_LAUNCH_NOINDEX` enabled for app, join, play, practice, API and game routes. Explicit `COMING_SOON_MODE` may index only public marketing pages; the app routes remain noindex and disallowed to crawlers.
- Milestone 5 real-phone rehearsal is accepted and Milestone 6 is in progress. Phase A publishing, domain, DNS, production secrets and paid services still require explicit owner approval.

## Launch and cost plan

Owner-approved on 19 October 2026; all figures are USD. This plan does not authorize publishing or any paid change.

| Phase | Timing and scope                                                                                            | Cost expectation                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A     | Now: static coming-soon pages only; game closed.                                                            | Near-zero. Static hosting is free; outbound transfer beyond the plan allowance may be billable. |
| B     | Halloween week: Reserved VM, 1–2 vCPU for about a week. Start with practice mode; real games only if ready. | About $8–$12, before database, storage and egress.                                              |
| C     | Early November–22 December: return to static, or use a pilot VM only if the game remains open.              | No VM by default; any pilot requires approval.                                                  |
| D     | 23–27 December: choose the peak VM size from load-test results.                                             | About $17 for 4 vCPU or $69 for 16 vCPU over 96 hours, before database and egress.              |
| E     | After 27 December: scale down to the approved size.                                                         | Confirm the displayed VM charge before changing it.                                             |

Owner-provided Reserved VM rates checked 19 October 2026: 0.5 vCPU / 2 GiB $0.0208/hour; 1 vCPU / 4 GiB $0.0486/hour; 2 vCPU / 8 GiB $0.0694/hour; 4 vCPU / 16 GiB $0.1806/hour; 16 vCPU / 64 GiB $0.7222/hour. Database compute is $0.16 per active compute hour and egress is $0.05/GiB. Reserved VM billing is continuous; the usage cap does not cap its fixed charge.

Weekly VM resizing is rejected: it saves about $3.50 a week and there is no scheduling. Scale-to-zero for the game server is a later experiment, limited to one instance. Do not treat Autoscale WebSocket affinity as guaranteed.

Replit documentation checked 19 October 2026:

- Static deployments are free, apart from outbound transfer beyond the plan allowance. Response headers, caching rules and path rewrites are supported in `.replit`; no fallback host is needed. Sources: [Static deployments](https://docs.replit.com/features/publishing/deployment-types#static), [static deployment configuration](https://docs.replit.com/features/deployment-customization/static-deployments-advanced), [deployment pricing](https://docs.replit.com/billing/deployment-pricing).
- Reserved VMs have a fixed hourly rate for the selected machine while running; changing configuration requires redeployment. Deleting/unpublishing stops further charges. The docs do not specify partial-hour rounding or explicitly state whether resizing/removal is prorated; confirm the displayed amount in Publishing before approval. Sources: [deployment types](https://docs.replit.com/features/publishing/deployment-types), [machine configuration](https://docs.replit.com/features/publishing/machine-configuration), [publishing overview](https://docs.replit.com/features/publishing/overview).
- A production PostgreSQL database suspends after five minutes without requests; compute billing pauses while suspended, but storage billing continues while the database exists. Sources: [usage-based billing](https://docs.replit.com/billing/about-usage-based-billing), [development and production databases](https://docs.replit.com/features/data-and-storage/development-and-production).
- Autoscale may run multiple instances and scale to zero. WebSockets are supported, but scaling to zero terminates active connections; the docs do not guarantee sticky routing across instances. The game must reconnect and resynchronize, and any future multi-instance deployment needs an explicit realtime-state design and test. Sources: [deployment types](https://docs.replit.com/features/publishing/deployment-types), [publishing overview](https://docs.replit.com/features/publishing/overview).

No deployment is active. The canonical origin in the app is configured but is not a verified live site.

## M4b server preparation

Production mode serves `artifacts/party-game/dist/public` from the existing Node process, before API admission checks. Development keeps its existing Vite workflow. Static requests use asynchronous filesystem operations and streaming, not synchronous reads or request-time compression.

- Hashed assets: `public, max-age=31536000, immutable`. HTML, manifest, service worker and other unversioned files: `no-cache`. Brotli/gzip are generated offline; negotiation respects encoding preferences and varies the cache key.
- App-shell routes come from `lib/shared/src/app-routes.ts`, also used by development/tests and the retained unused Vercel fixture. Unknown/API routes never fall back to the home page.
- Every response retains its security headers. App/game/API routes keep the pre-launch noindex policy; only public marketing pages become indexable in explicit `COMING_SOON_MODE`. Static documents permit executable scripts, styles, manifests and workers from `'self'` only; no executable inline JavaScript or permissive inline exception. Critical first-paint CSS is extracted to a hashed stylesheet before compression. API responses retain their existing nonce policy.
- Static responses grant no cross-origin CORS access. Existing host-only Secure/HttpOnly seat and coordinator cookies, SameSite policy and CSRF checks are unchanged.
- `/healthz` checks process liveness; `/readyz` checks database readiness. Static pages remain available when readiness fails or new games are refused.
- Startup fails if the client build is absent/unprepared or crawling is enabled without explicit `COMING_SOON_MODE`; app/game/API routes remain noindex.
- The scheduler starts only after HTTP binds successfully. A port conflict closes realtime/database resources rather than leaving an unreachable background worker alive; `tests/server-startup.test.ts` exercises real successful/occupied sockets.

Build with `pnpm run build:oathstone`: frontend, server, then offline client preparation. The last step extracts critical CSS and creates compression sidecars; do not omit it. The build wrapper supplies a build-only `PORT` default and `BASE_PATH=/`.

The eventual run command is `pnpm run start:oathstone`; it uses production mode, the platform's `PORT` and the existing documented thread-pool default. These commands are instructions only, not an enabled deployment.

Evidence: `tests/production-client.test.ts`, `tests/client-build.test.ts` and `e2e/production-server.spec.ts` cover the built output, cache/encoding/security policy, real Pixel/iPhone hydration and JavaScript-disabled first paint. The existing complete 5-/40-seat HTTP/socket fault tests now also check static shell/health availability across a running-game restart and still compare the resulting game to its recorded trace.

Release only an exact green-Verify commit; see [RELEASES.md](RELEASES.md). No deployment has been performed.

## Owner approval checklist — present before any launch action

### Phase A: static coming-soon deployment

- [ ] Explicitly approve publishing the static public pages; app/game routes remain noindex and game creation remains closed.
- [ ] Explicitly approve the 123-reg A and TXT DNS records. Use only the exact hostnames and values shown by Replit at publishing time; do not invent values or change DNS before approval.
- [ ] Approve a spend limit. Static hosting is free, but outbound transfer beyond the plan allowance may be billable.

- [ ] Approve a VM size and its displayed fixed charge. A **pilot-only candidate** is 0.5 vCPU / 2 GiB; do not treat this as capacity approval for §20. The accepted [CAPACITY.md](CAPACITY.md) measurements do not establish production peak capacity; benchmark before selecting Christmas capacity or making throughput claims.
- [ ] After explicit approval, create separate production `PIN_PEPPER` and session secrets in Publishing's production secrets settings; preserve any required previous pepper during a planned rotation. Never copy development values into documents/Git or ask the owner to paste secrets into chat. Confirm the production database, migrations, HTTPS origin and secure-cookie configuration without printing values.
- [ ] Confirm the build/run commands above, the coming-soon public/app indexing split, health/readiness, HTTPS, socket reconnect and running-game restart on the chosen exact green commit. Record owner approval and any eventual release in `RELEASES.md`.
- [ ] At 123-reg, add the **A record for the `oathstone` subdomain** using the IP shown by Replit, and the **TXT verification record using the exact hostname/value shown by Replit**. Values are not available until the approved publishing flow; do not invent them. Retain the TXT record for certificate renewal. Review conflicting A/AAAA/CNAME records before changing anything; leave the company's root website untouched.
- [ ] Approve a usage spending limit **and a separate Reserved VM budget**. Replit's usage cap does not cap the VM's fixed charge. Confirm actual prices and resize billing in the Publishing panel before spending; no automatic paid scale-up has been configured.
- [ ] **23 December 2026:** with approval, scale up to the measured/approved peak size, allow for a restart and check readiness/socket resync. **27 December 2026:** with approval, scale back to the agreed pilot size and repeat those checks. Choose the actual peak size and bill before either action.

Official references checked 17 October 2026: [Reserved VM pricing](https://docs.replit.com/billing/aug-cloud-billing-updates), [custom domains](https://docs.replit.com/features/publishing/custom-domains), [spend limits](https://docs.replit.com/billing/managing-spend). Use the current panel quote, not a price copied into this checklist.

Do not deploy, connect the domain, add production secrets or change DNS until the owner explicitly approves those actions.

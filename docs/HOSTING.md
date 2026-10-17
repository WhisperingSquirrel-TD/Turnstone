# Hosting decision and owner checklist

## Approved direction

On 14 October 2026 the owner chose one Replit Reserved VM deployment for Turnstone. After separate launch approval, that one deployment will serve the public pages, app shell/PWA, API, Socket.IO and durable scheduler from `https://turnstone.stackstoneconsulting.co.uk`. There is no Vercel deployment and no `live.` subdomain. Stackstone Consulting's company site stays separate and is expected to redirect `stackstoneconsulting.co.uk/turnstone` to Turnstone.

The public shell and game server release together; no N-1 compatibility between independently deployed shell and server versions is required. The client uses relative same-origin `/api` and `/socket.io` paths and does not bake in an API host.

## Current status and limits

- This is a hosting decision, not an enabled deployment. No Replit publish, Reserved VM, production domain, DNS change, production secret or paid capacity test is authorised yet.
- `vercel.json` and any related Vercel configuration/tests are retained in the repository but are unused. They may be reconsidered as a 2027 option; do not add Vercel-specific work now.
- Keep `PRE_LAUNCH_NOINDEX` enabled. Every response remains `X-Robots-Tag: noindex, nofollow`; `robots.txt` disallows crawling until the owner explicitly says “launch”.
- The 17 October queue permits server preparation after Round 5 is green, before phone acceptance. This does not permit publishing or starting Milestone 6.

## M4b server preparation

Production mode serves `artifacts/party-game/dist/public` from the existing Node process, before API admission checks. Development keeps its existing Vite workflow. Static requests use asynchronous filesystem operations and streaming, not synchronous reads or request-time compression.

- Hashed assets: `public, max-age=31536000, immutable`. HTML, manifest, service worker and other unversioned files: `no-cache`. Brotli/gzip are generated offline; negotiation respects encoding preferences and varies the cache key.
- App-shell routes come from `lib/shared/src/app-routes.ts`, also used by development/tests and the retained unused Vercel fixture. Unknown/API routes never fall back to the home page.
- Every response retains security/noindex headers. Static documents permit executable scripts, styles, manifests and workers from `'self'` only; no executable inline JavaScript or permissive inline exception. Critical first-paint CSS is extracted to a hashed stylesheet before compression. API responses retain their existing nonce policy.
- Static responses grant no cross-origin CORS access. Existing host-only Secure/HttpOnly seat and coordinator cookies, SameSite policy and CSRF checks are unchanged.
- `/healthz` checks process liveness; `/readyz` checks database readiness. Static pages remain available when readiness fails or new games are refused.
- Startup fails if the client build is absent/unprepared or its robots file permits pre-launch crawling.
- The scheduler starts only after HTTP binds successfully. A port conflict closes realtime/database resources rather than leaving an unreachable background worker alive; `tests/server-startup.test.ts` exercises real successful/occupied sockets.

Build with `pnpm run build:turnstone`: frontend, server, then offline client preparation. The last step extracts critical CSS and creates compression sidecars; do not omit it. The build wrapper supplies a build-only `PORT` default and `BASE_PATH=/`.

The eventual run command is `pnpm run start:turnstone`; it uses production mode, the platform's `PORT` and the existing documented thread-pool default. These commands are instructions only, not an enabled deployment.

Evidence: `tests/production-client.test.ts`, `tests/client-build.test.ts` and `e2e/production-server.spec.ts` cover the built output, cache/encoding/security policy, real Pixel/iPhone hydration and JavaScript-disabled first paint. The existing complete 5-/40-seat HTTP/socket fault tests now also check static shell/health availability across a running-game restart and still compare the resulting game to its recorded trace.

Release only an exact green-Verify commit; see [RELEASES.md](RELEASES.md). No deployment has been performed.

## Owner approval checklist — present before any launch action

- [ ] Approve a VM size and its displayed fixed charge. A **pilot-only candidate** is 0.5 vCPU / 2 GiB; do not treat this as capacity approval for §20. The accepted [CAPACITY.md](CAPACITY.md) measurements do not establish production peak capacity; benchmark before selecting Christmas capacity or making throughput claims.
- [ ] After explicit approval, create separate production `PIN_PEPPER` and session secrets in Publishing's production secrets settings; preserve any required previous pepper during a planned rotation. Never copy development values into documents/Git or ask the owner to paste secrets into chat. Confirm the production database, migrations, HTTPS origin and secure-cookie configuration without printing values.
- [ ] Confirm the build/run commands above, pre-launch noindex, health/readiness, HTTPS, socket reconnect and running-game restart on the chosen exact green commit. Record owner approval and any eventual release in `RELEASES.md`.
- [ ] At 123-reg, add the **A record for the `turnstone` subdomain** using the IP shown by Replit, and the **TXT verification record using the exact hostname/value shown by Replit**. Values are not available until the approved publishing flow; do not invent them. Retain the TXT record for certificate renewal. Review conflicting A/AAAA/CNAME records before changing anything; leave the company's root website untouched.
- [ ] Approve a usage spending limit **and a separate Reserved VM budget**. Replit's usage cap does not cap the VM's fixed charge. Confirm actual prices and resize billing in the Publishing panel before spending; no automatic paid scale-up has been configured.
- [ ] **23 December 2026:** with approval, scale up to the measured/approved peak size, allow for a restart and check readiness/socket resync. **27 December 2026:** with approval, scale back to the agreed pilot size and repeat those checks. Choose the actual peak size and bill before either action.

Official references checked 17 October 2026: [Reserved VM pricing](https://docs.replit.com/billing/aug-cloud-billing-updates), [custom domains](https://docs.replit.com/features/publishing/custom-domains), [spend limits](https://docs.replit.com/billing/managing-spend). Use the current panel quote, not a price copied into this checklist.

Do not deploy, connect the domain, add production secrets or change DNS until the owner explicitly approves those actions.

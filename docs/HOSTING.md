# Hosting decision and owner checklist

## Amendment A — entry surface only (25 October 2026)

The company page https://stackstoneconsulting.co.uk/oathstone is the single
findable home and must not be changed or redirected. The game host has one
paper entry at `/`; `/play` permanently redirects there, retaining query
parameters. Its canonical is the company page; app routes remain noindex.
Public information pages remain accessible with the same indexing policy.
This updates entry presentation only, not deployment approval, DNS, domains,
production settings or the older proposed hosting origin. See the wording
reconciliation in QUESTIONS. Nothing has been published.

## Public invitation URLs — owner step (25 October 2026)

`PUBLIC_BASE_URL` is the single, non-secret base for player share links, Lobby
QR codes, copy/share actions and invitation links (including the presenter QR).
Set it to the **actual public game host**, optionally including its mount path,
before building/publishing. It must be HTTPS and cannot contain credentials,
a query, a fragment or a `replit.dev` development hostname. Invalid values fail
the Vite configuration rather than silently producing an unsafe link.

The value is embedded at **build time**: after changing it, rebuild/publish the
game. A preview's artifact mount is not copied into the public URL; if the public
app itself has a mount path, include that path in the setting. Do not use the
company marketing page as the game URL unless that page actually serves the game.

When the setting is absent, a non-development host uses its own origin.
An unconfigured `replit.dev` preview shows no share QR/link and retains the room
code, with this organiser Lobby notice:

> Players outside your Replit account cannot open this preview link. It will work once the game is published.

Publishing and setting the public base are the **owner's next steps**. This patch
does not publish, set environment values, connect a domain, change DNS or touch
production secrets. A public URL does not make a private preview accessible and
does not move preview games, seats or databases: create/share games on the public
game environment itself.

`PUBLIC_BASE_URL` controls invitations only. Existing API, cookie, CSRF and
`APP_BASE_URL` authentication-origin settings are unchanged; do not replace those
with a different public host to make a preview invitation appear public.

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

- Static deployments have no hosting charge; outbound data transfer is published at $0.05/GiB, with account credits and budget limits affecting the actual bill. Static deployment configuration supports response headers and path rewrites in `.replit`. No account-specific monthly quote has been checked. Sources: [Static deployments](https://docs.replit.com/features/publishing/deployment-types#static), [static deployment configuration](https://docs.replit.com/features/deployment-customization/static-deployments-advanced), [deployment pricing](https://docs.replit.com/billing/deployment-pricing), [managing spend](https://docs.replit.com/billing/managing-spend).
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

## Verify Playwright browser runner

The `browsers`, `rehearsal-live` and `lighthouse` jobs use Microsoft's official `mcr.microsoft.com/playwright:v1.64.0-noble` image, matching the `@playwright/test` version in `pnpm-lock.yaml`. The amd64 image digest resolved on 23 October 2026 is `sha256:bc72a8df40831ded821e3cbc79c318c21b44d6e51dff9fd89ace7a8249c5b462`; jobs pass `--ipc=host`. The image provides the pinned Playwright browser binaries and operating-system libraries, so these jobs no longer run browser caching or `playwright install --with-deps`/apt-get. The rehearsal job reaches its PostgreSQL service by the service hostname `postgres`. Node dependency installation, test commands, secrets handling, job time limits and required checks remain in place. `tests/pipeline.test.ts` guards the image version and setup contract.

## Owner approval checklist — present before any launch action

### Phase A: static coming-soon deployment

#### Confirmed project settings (read-only review, 19 October 2026)

- **Deployment type:** Replit Static Deployment. The target hostname is `oathstone.stackstoneconsulting.co.uk`; it is not connected and no publish has been performed.
- **Build command:** `pnpm --filter @workspace/party-game run build:static-public`. This sets `COMING_SOON_MODE=true` and `PRE_LAUNCH_NOINDEX=true`, then runs Vite.
- **Publish directory:** `artifacts/party-game/dist/static-public`.
- **Contents:** the static output builder writes exactly six public pages (`/`, `/about`, `/how-to-play`, `/faq`, `/compare`, `/coming-soon`), `app-shell.html`, `404.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, stylesheet/font assets, the favicon and brand SVGs. It does not copy JavaScript bundles, API code, the game server or database. `tests/static-public-build.test.ts` asserts the pages have no scripts or game-route links and checks the fallback/indexing rules. Vite also creates `dist/public`, but that directory is not the proposed publish directory.
- **Coming-soon and closed game:** the static build uses the explicit coming-soon mode, indexes public marketing pages and keeps app/fallback routes noindex. The static package has no API or game server, so game creation, joining and play cannot operate. The Node startup guard is not run for Static Deployment; on a future server deployment it still refuses crawling-enabled startup unless `COMING_SOON_MODE=true`.

#### Replit configuration: confirmed and unconfirmed

- The current `.replit` is **not** set up for Phase A: it has `deploymentTarget = "autoscale"`, the existing application router and a `postBuild` store-prune command. It has no static build command, `staticDir` or `[[deployment.responseHeaders]]` entries.
- `.replit` already contains `[[deployment.rewrites]]` entries mapping app/game routes to `/app-shell.html`. Replit documents rewrites for Static Deployments, but these entries have not been exercised under a static target; confirm them in a preview after the owner changes the target to `static`.
- The Node server currently sets hashed-asset caching to `public, max-age=31536000, immutable` and unversioned documents to `no-cache`. It also supplies its own security headers. Static Deployment will not run that Node middleware. Replit documents `[[deployment.responseHeaders]]`, but no static header rules are configured in `.replit`; map and verify the required cache/security headers in the static preview before publishing. Their live behavior is unconfirmed.

#### Cost, budget, domain and rollback

- **Published base price:** static hosting is $0/month; Replit lists outbound transfer at $0.05/GiB. The account's actual monthly total is **not shown** in this read-only review because no deployment or Publishing quote exists.
- **Spend limit:** set the account Billing usage-limit/budget cap to a numeric amount Tom explicitly approves. No amount is selected or configured. Replit says the cap can suspend services when reached; confirm its scope and displayed value before publish.
- **Custom domain:** after an approved publish, Replit's Publishing flow will show a domain-specific A record and TXT verification record. Their exact hostnames and values are generated for that domain and are not available now. Copy only what Replit displays; add nothing to 123-reg until Tom separately approves the DNS change.
- **Rollback:** if the published site is wrong, restore the prior Replit project checkpoint, rebuild the same static output and republish. Before any later DNS edit, record the existing 123-reg values; reverting DNS also requires explicit approval. No rollback or DNS action is being performed now.

#### Tom's approval and publish actions, in order

1. Approve Phase A Static Deployment, the hostname, the build command/output directory above, and a numeric monthly spend cap.
2. In Replit Publishing, select Static Deployment; set `deploymentTarget = "static"`, build command and `staticDir` to the values above. Confirm the `.replit` rewrite rules and add/test the required `responseHeaders` rules. No such settings have been changed in this review.
3. Review the static preview and verify all six pages, app-shell and 404 fallbacks, robots/sitemap/llms files, response headers, caching and the exact cost/budget displayed by Replit.
4. Publish only after Tom's explicit approval. The Phase A publication contains no secrets, database or game server.
5. After publishing, add `oathstone.stackstoneconsulting.co.uk` in Replit and copy its exact A and TXT records. Obtain separate approval before entering those values at 123-reg; leave the company site's root records untouched.
6. Verify HTTPS, canonical URLs, public indexing and the app-shell fallback. If anything fails, use the checkpoint rollback above and republish the restored build.

- [ ] Approve a VM size and its displayed fixed charge. A **pilot-only candidate** is 0.5 vCPU / 2 GiB; do not treat this as capacity approval for §20. The accepted [CAPACITY.md](CAPACITY.md) measurements do not establish production peak capacity; benchmark before selecting Christmas capacity or making throughput claims.
- [ ] After explicit approval, create separate production `PIN_PEPPER` and session secrets in Publishing's production secrets settings; preserve any required previous pepper during a planned rotation. Never copy development values into documents/Git or ask the owner to paste secrets into chat. Confirm the production database, migrations, HTTPS origin and secure-cookie configuration without printing values.
- [ ] Confirm the build/run commands above, the coming-soon public/app indexing split, health/readiness, HTTPS, socket reconnect and running-game restart on the chosen exact green commit. Record owner approval and any eventual release in `RELEASES.md`.
- [ ] At 123-reg, add the **A record for the `oathstone` subdomain** using the IP shown by Replit, and the **TXT verification record using the exact hostname/value shown by Replit**. Values are not available until the approved publishing flow; do not invent them. Retain the TXT record for certificate renewal. Review conflicting A/AAAA/CNAME records before changing anything; leave the company's root website untouched.
- [ ] Approve a usage spending limit **and a separate Reserved VM budget**. Replit's usage cap does not cap the VM's fixed charge. Confirm actual prices and resize billing in the Publishing panel before spending; no automatic paid scale-up has been configured.
- [ ] **23 December 2026:** with approval, scale up to the measured/approved peak size, allow for a restart and check readiness/socket resync. **27 December 2026:** with approval, scale back to the agreed pilot size and repeat those checks. Choose the actual peak size and bill before either action.

Official references checked 19 October 2026: [Static Deployment Configuration](https://docs.replit.com/features/deployment-customization/static-deployments-advanced), [deployment types](https://docs.replit.com/features/publishing/deployment-types), [custom domains](https://docs.replit.com/build/add-custom-domain), [deployment pricing](https://docs.replit.com/billing/deployment-pricing), [managing spend](https://docs.replit.com/billing/managing-spend), [checkpoints and rollbacks](https://docs.replit.com/features/version-control/checkpoints-and-rollbacks). Use the live Publishing/Billing panel values, not guessed DNS records or an account-specific price copied from another deployment.

Do not deploy, connect the domain, add production secrets or change DNS until the owner explicitly approves those actions.

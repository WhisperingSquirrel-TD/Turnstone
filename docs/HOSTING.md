# Hosting decision and owner checklist

## Approved direction

On 14 October 2026 the owner chose one Replit Reserved VM deployment for Turnstone. After separate launch approval, that one deployment will serve the public pages, app shell/PWA, API, Socket.IO and durable scheduler from `https://turnstone.stackstoneconsulting.co.uk`. There is no Vercel deployment and no `live.` subdomain. Stackstone Consulting's company site stays separate and is expected to redirect `stackstoneconsulting.co.uk/turnstone` to Turnstone.

The public shell and game server release together; no N-1 compatibility between independently deployed shell and server versions is required. The client uses relative same-origin `/api` and `/socket.io` paths and does not bake in an API host.

## Current status and limits

- This is a hosting decision, not an enabled deployment. No Replit publish, Reserved VM, production domain, DNS change, production secret or paid capacity test is authorised yet.
- `vercel.json` and any related Vercel configuration/tests are retained in the repository but are unused. They may be reconsidered as a 2027 option; do not add Vercel-specific work now.
- Keep `PRE_LAUNCH_NOINDEX` enabled. Every response remains `X-Robots-Tag: noindex, nofollow`; `robots.txt` disallows crawling until the owner explicitly says “launch”.
- Do not make hosting code changes beyond the approved same-origin client paths until Milestone 5 is accepted.

## Deferred M4b work — after the Milestone 5 gate

Implement each item under TDD, with a test proving the requirement:

1. Serve the built client from the Node server. Hashed assets: one-year immutable cache. HTML, manifest and service worker: no-cache. Provide Brotli/gzip precompression. Static serving must not block the event loop, and pages must remain available while admission control throttles new games.
2. Apply strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `frame-ancestors 'none'` to every response. Do not allow cross-origin CORS access. Keep cookies host-only, Secure, HttpOnly and SameSite=Lax; do not weaken CSRF.
3. Keep the pre-launch noindex headers and disallow-all `robots.txt` until the owner says “launch”.
4. Test deployment health checks and prove that a running game resumes correctly after a server restart.
5. Release only from a commit whose GitHub Verify run is green; record the commit and run ID in `docs/RELEASES.md`.

## Owner approval checklist — present before any launch action

- [ ] Choose the Reserved VM size and confirm its cost.
- [ ] Add a separate production `PIN_PEPPER` through Replit Secrets; never place its value in this document or Git.
- [ ] Review and approve the DNS records to add at 123-reg.
- [ ] Set an explicit spend cap.
- [ ] Confirm the seasonal scale-up on 23 December and scale-down on 27 December.

Do not deploy, connect the domain, add production secrets or change DNS until the owner explicitly approves those actions.

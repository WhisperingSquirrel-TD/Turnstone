# Delivery pipeline and launch gate — not launch-ready

## October beta launch runbook (owner actions, in order)

Prepared 26 October 2026. Nothing below has been performed; every step is the
owner's, after his own device test. Values marked _(Replit shows this)_ come
from the Replit panels; never paste secrets into chat, documents or Git.

1. **Pick the commit.** Use the latest `main` commit whose GitHub **Verify** is
   green (see the top of `docs/PROGRESS.md`). Record its SHA and run number in
   `docs/RELEASES.md`.
2. **Run the solo device test** in `docs/MANUAL_TESTS.md` ("Beta solo
   play-through") on the Replit preview. Fix anything blocking first.
3. **Deployment type.** In Replit Publishing choose **Reserved VM** (not
   Autoscale; live games need one long-lived server for WebSockets and the
   scheduler). Pilot size: 0.5 vCPU / 2 GiB (about $15/month) or 1 vCPU /
   4 GiB (about $35/month); Replit shows the exact charge.
4. **Production database.** Create the production PostgreSQL database in
   Replit; its connection string becomes the deployment's `DATABASE_URL`
   _(Replit shows this)_.
5. **Production secrets** (Publishing → Secrets, production only; generate
   each random value in the Replit shell with `openssl rand -hex 32`):
   - `DATABASE_URL`: production database (step 4).
   - `SESSION_SECRET`: new random value, at least 32 characters.
   - `PIN_PEPPER`: new random value, at least 32 characters; never the
     development value. `PIN_PEPPER_VERSION` = `1`.
   - `APP_BASE_URL`: `https://` plus the public game address.
   - `PUBLIC_BASE_URL`: the same public game address; it is baked into
     invite links and QR codes at **build** time, so set it before building.
   - `MAX_ACTIVE_GAMES`: `10` for the beta (new games are refused above 80%).
   - Leave `PRE_LAUNCH_NOINDEX` and `COMING_SOON_MODE` unset: game routes stay
     out of search engines.
6. **Commands.** Build: `pnpm run build:oathstone`. Run:
   `pnpm run start:oathstone` (Replit supplies `PORT`).
7. **Create the database tables, once per release** (forward-only and safe
   to re-run), from the Replit shell with the production connection string:
   `OATHSTONE_CONFIRM_PRODUCTION_MIGRATION=apply DATABASE_URL=<production URL> pnpm run db:migrate:production`.
   It prints "Production migrations are up to date." and never prints the URL.
   Never run `db:migrate:dev` against production.
8. **Spending.** Set the account usage cap and a separate Reserved VM budget
   (the usage cap does not limit the VM's fixed charge).
9. **Publish**, then check: `https://<host>/healthz` and `/readyz` return 200;
   on a phone the entry shows "Beta"; create a game, join from a second
   device, start, give the round-table shield, and play to the end.
10. **Domain (optional, separate approval).** To use
    `oathstone.stackstoneconsulting.co.uk`, add it in Replit and copy the A
    and TXT records Replit shows into 123-reg. Players can use the Replit
    address until then.
11. **Rollback.** If something is wrong, republish the previous green commit
    from `docs/RELEASES.md`. Games in progress survive a restart (events are
    in PostgreSQL).

## Owner's one-off repository and hosting steps

1. The source of truth is [the GitHub repository](https://github.com/WhisperingSquirrel-TD/Turnstone), branch `main`. Push verified commits through the owner-authorised Replit flow; never put credentials in the repository, a commit, or a log.
2. Enable the repository's Actions and let **Verify** complete successfully, including iPhone/iPad WebKit, Pixel/desktop, axe, Lighthouse and all other gates. Only that first fully green run finally accepts Milestone 0; local verification is provisional.
3. The owner has chosen one Replit Reserved VM serving the public pages, app shell and game server from `https://oathstone.stackstoneconsulting.co.uk`. Do not import or deploy this repository through Vercel.
4. No domain or DNS work is authorised yet. Before any launch action, present the checklist in `docs/HOSTING.md` and wait for the owner's explicit approval; do not guess or change DNS records.
5. The client uses same-origin relative `/api` and `/socket.io` paths. Do not set `VITE_API_ORIGIN` or add a `live.` subdomain.
6. Before promotion/peak days, configure inclusive UTC `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }` ranges in `.github/change-freeze.json`. The initial empty list means dates are unconfirmed. Promotion refuses valid active freezes except a verified commit whose message contains exactly `[security]`; malformed dates fail closed.
7. Ensure repository branch rules permit the intended release fast-forward by the restricted promotion job without weakening main verification. The promotion checks a successful main push from this same repository, checks out its exact SHA, honours latest main freeze dates and never force-pushes or includes unchecked commits.

The hosting direction is recorded in `docs/SPEC.md` §28 and `docs/HOSTING.md`, but no Replit deployment, domain connection, DNS change, production secret or paid service has been enabled. The owner must approve launch actions separately.

## CI behaviour and allowance

- Verify runs on every push to main on Ubuntu, with Node 24, pinned pnpm, frozen dependencies, cached pnpm store/browser binaries and official Playwright system dependencies. It uses an isolated test PostgreSQL service, migrations and a masked generated test session secret, never production credentials.
- CI runs all four browser profiles. Local verification prints **WebKit profiles run in CI** and runs only Pixel/desktop browser tests; all non-browser gates still run. Local green is not proof of WebKit compatibility.
- Verify has a 15-minute limit and cancels superseded main runs. Measure a typical cold/warm run once pushed; caching/limits alone do not prove the runtime budget.
- The separate promotion workflow has write permission only in its promotion job. Other jobs have read-only contents or no permissions. Third-party actions are pinned to full commits; no `pull_request_target` or credential printing.
- A nightly `verify:full` workflow is deliberately absent until the Milestone 2 harness exists. Add it then with actual reporting and measured allowance use, not the currently unavailable placeholder.

## Single-origin Replit hosting

- After separate owner approval, the Replit Reserved VM will serve the public pages, app shell/PWA, API, Socket.IO and scheduler from the same origin. The app shell and server release together.
- API calls use relative `/api` paths and sockets use the same-origin `/socket.io` path. The client does not configure or embed a sibling API host.
- The API is a long-lived Node process (`pnpm --filter @workspace/api-server run dev` locally). It requires `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `APP_BASE_URL` and `MAX_ACTIVE_GAMES` in production, validated at startup. PostgreSQL remains authoritative for events, snapshots, sessions, sockets and deadlines.
- Keep CSRF, host-only Secure/HttpOnly/SameSite=Lax cookies and strict same-origin security policy unchanged. The deferred serving, cache, headers and restart tests are listed in `docs/HOSTING.md`.
- `vercel.json` remains in the repository but is unused; no Vercel project or static-host deployment is part of the approved direction.

## Product release checklist

- [ ] Every Must/accepted Should milestone and its gated tests complete.
- [ ] First full CI Verify green; complete mobile/browser/installed-mode coverage.
- [ ] Real `verify:full`, scenario report, coverage and safe replay checks green.
- [ ] No high/critical audit findings in production; valid tooling-exception policy.
- [ ] Real passkey coordinator sign-in, optional configured Google/Microsoft only, trusted admin binding and guest-seat recovery/security tested. LinkedIn/Facebook/Apple and Meta callback are removed.
- [ ] Private projection/no-leak/uniformity, rate limits, CSRF, cookies, origin isolation, restart/concurrency and durable scheduler checks complete.
- [ ] Static prerendered public pages, same-origin serving, security headers, caching, size/performance budgets, no-index private routes and standalone app mode verified on the selected host.
- [ ] Real iPhone/Android/tablet, VoiceOver/TalkBack and five-person playtest complete.
- [ ] Owner approves Reserved VM size, separate production `PIN_PEPPER`, 123-reg DNS records, spend cap and seasonal capacity actions listed in `docs/HOSTING.md`.
- [ ] Privacy/retention/terms templates reviewed, remaining branding/naming/freeze inputs confirmed.

Do not promote this foundation into a claim that the game is playable. Connecting a deployment pipeline is not product launch approval.

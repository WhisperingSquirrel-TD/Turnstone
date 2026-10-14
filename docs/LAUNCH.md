# Delivery pipeline and launch gate — not launch-ready

## Owner's one-off repository and Vercel steps

1. Push this workspace to `WhisperingSquirrel-TD/Turnstone`, branch `main`. The owner performs this push; no remote push was performed here.
2. Enable the repository's Actions and let **Verify** complete successfully, including iPhone/iPad WebKit, Pixel/desktop, axe, Lighthouse and all other gates. Only that first fully green run finally accepts Milestone 0; local verification is provisional.
3. When ready to connect hosting, import the repository in Vercel and set **Production Branch = `release`**. `main` is preview-only. The repository build configuration selects the static web output, not the API/server.
4. Add `turnstone.stackstoneconsulting.co.uk` as the custom domain. Add the exact DNS record Vercel supplies at the existing DNS provider; do not guess a target or change unrelated records.
5. Set public build-time `VITE_API_ORIGIN` for the applicable Vercel environments. The owner's planned production value is `https://live.turnstone.stackstoneconsulting.co.uk`; actual server hosting/origin must be confirmed before live game connections. Rebuild static assets after changing it. This variable is public; never put session/provider/database secrets in a `VITE_` variable.
6. Before promotion/peak days, configure inclusive UTC `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }` ranges in `.github/change-freeze.json`. The initial empty list means dates are unconfirmed. Promotion refuses valid active freezes except a verified commit whose message contains exactly `[security]`; malformed dates fail closed.
7. Ensure repository branch rules permit the intended release fast-forward by the restricted promotion job without weakening main verification. The promotion checks a successful main push from this same repository, checks out its exact SHA, honours latest main freeze dates and never force-pushes or includes unchecked commits.

No Vercel connection, DNS change, Replit publish, GitHub push, paid plan or live server has been enabled by these files. The owner decides hosting and any paid plan before launch.

## CI behaviour and allowance

- Verify runs on every push to main on Ubuntu, with Node 24, pinned pnpm, frozen dependencies, cached pnpm store/browser binaries and official Playwright system dependencies. It uses an isolated test PostgreSQL service, migrations and a masked generated test session secret, never production credentials.
- CI runs all four browser profiles. Local verification prints **WebKit profiles run in CI** and runs only Pixel/desktop browser tests; all non-browser gates still run. Local green is not proof of WebKit compatibility.
- Verify has a 15-minute limit and cancels superseded main runs. Measure a typical cold/warm run once pushed; caching/limits alone do not prove the runtime budget.
- The separate promotion workflow has write permission only in its promotion job. Other jobs have read-only contents or no permissions. Third-party actions are pinned to full commits; no `pull_request_target` or credential printing.
- A nightly `verify:full` workflow is deliberately absent until the Milestone 2 harness exists. Add it then with actual reporting and measured allowance use, not the currently unavailable placeholder.

## Static site and game-server portability

- The Vercel build targets only `@workspace/party-game` and emits the static shell under `artifacts/party-game/dist/public`; it does not build or run the API server. Keep public HTML and hashed assets static so any CDN can serve them without a Node request handler.
- The API is a separate long-lived Node process (`pnpm --filter @workspace/api-server run dev` locally). It requires `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `APP_BASE_URL` and `MAX_ACTIVE_GAMES` in production, validated at startup. PostgreSQL remains authoritative for events, snapshots, sessions, sockets and deadlines.
- Set `VITE_API_ORIGIN` at web build time to the API origin for a sibling-host deployment, such as `https://live.turnstone.stackstoneconsulting.co.uk`. Leave it unset when the app and API share an origin. The API allows credentialed requests only from the configured public `APP_BASE_URL`; cookies remain Secure, HttpOnly, SameSite=Lax and host-only, and state-changing requests retain CSRF checks.
- The static CSP permits same-origin connections and the planned sibling API's HTTPS/WebSocket origins. If the owner changes the API origin, update the Vercel CSP and its configuration test together. No Redis or Replit-only runtime service is required.
- Integration coverage exercises the independent Node server, database-backed socket reconnect after a restart, exact-origin credentialed CORS, session cookies, CSRF and private viewer projections. This repository has not been connected to Vercel, hosted on a live API server, or published.

## Product release checklist

- [ ] Every Must/accepted Should milestone and its gated tests complete.
- [ ] First full CI Verify green; complete mobile/browser/installed-mode coverage.
- [ ] Real `verify:full`, scenario report, coverage and safe replay checks green.
- [ ] No high/critical audit findings in production; valid tooling-exception policy.
- [ ] Real passkey coordinator sign-in, optional configured Google/Microsoft only, trusted admin binding and guest-seat recovery/security tested. LinkedIn/Facebook/Apple and Meta callback are removed.
- [ ] Private projection/no-leak/uniformity, rate limits, CSRF, cookies, origin isolation, restart/concurrency and durable scheduler checks complete.
- [ ] Static prerendered public pages, CDN headers/CSP strategy, caching, size/performance budgets, no-index private routes and standalone app mode verified. Current Node nonce/header tests remain valid foundation fixtures, not final Vercel/CDN acceptance.
- [ ] Real iPhone/Android/tablet, VoiceOver/TalkBack and five-person playtest complete.
- [ ] Owner confirms always-on server/database hosting, migrations/recovery and any paid production capacity tests.
- [ ] Privacy/retention/terms templates reviewed, remaining branding/naming/freeze inputs confirmed.

Do not promote this foundation into a claim that the game is playable. Connecting a deployment pipeline is not product launch approval.

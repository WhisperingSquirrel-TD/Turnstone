# Delivery pipeline and launch gate — not launch-ready

## October beta release plan (owner-approved direction, 27 October 2026)

Planned 27 October 2026 for a new Claude session that Tom will run with
browser, Replit and 123-reg access. Tom authorises that session, for this
release only, to act in Replit (OathstoneGame and Stackstone Builder) and at
123-reg, with the guard rails below. This planning session performed none of
it. See D114 for the URL strategy.

### 1. URL strategy

| Address                                                                                           | Role                                               | Serves                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `https://oathstone.stackstoneconsulting.co.uk`                                                    | The game (play surface)                            | OathstoneGame on one Replit Reserved VM: entry, app, API, sockets, scheduler |
| `https://stackstoneconsulting.co.uk/oathstone`                                                    | Findable home (marketing, search, updates sign-up) | Stackstone Builder (already live)                                            |
| Any capitalisation of `/oathstone` (`/Oathstone`, `/OATHSTONE`, with or without a trailing slash) | Typing mistakes                                    | Stackstone Builder: permanent (301) redirect to `/oathstone`                 |
| `https://stackstoneconsulting.co.uk/oathstone/play` (any capitalisation)                          | Zero-tap shortcut for posters and QR codes         | Stackstone Builder: temporary (302) redirect to the game's entry screen      |

**What Tom shares publicly stays `stackstoneconsulting.co.uk/oathstone`** (the
front door). The `oathstone.` subdomain only hosts the game; nobody needs to
type it. Hosting the game itself under the company domain's `/oathstone` path
was considered and deferred (27 October 2026): Stackstone Builder would have to
proxy every API request and live socket, making the company site part of every
game, and the game assumes it is served from the root of its own origin. Revisit
for Christmas if wanted.

Clicks to a game, by route in:

- **Invite link or QR from an organiser:** opens the join screen for that
  game directly. No extra clicks.
- **From the company page:** one tap. Its buttons deep-link into the game:
  "Join a game" to `https://oathstone.stackstoneconsulting.co.uk/join`,
  "Create a new game" to
  `https://oathstone.stackstoneconsulting.co.uk/?entry=create`, "Practise
  alone" to `https://oathstone.stackstoneconsulting.co.uk/?entry=rehearsal`.
  Same tab (no `target="_blank"`), so the phone's back button returns.
- **The `/oathstone/play` shortcut (posters, QR codes):** lands straight on
  the game's entry screen. It is a 302, not a 301, so it can point elsewhere
  later without browsers caching it.
- **Typing the game address:** lands on the entry screen with the same three
  buttons.

The game's canonical stays the company page and app routes stay noindex; the
game's "About Oathstone" link returns to the company page. The company page is
**not** redirected to the game: it keeps search ranking and the updates
sign-up.

### 2. Guard rails for the executing session

- Release only an exact `main` commit with a green GitHub Verify (top of
  `docs/PROGRESS.md`); at the time of writing that is `ec2a883` (Verify #339; code identical to `dc5381c`).
- DNS values come **only** from what Replit displays for this domain. Never
  invent or reuse values. Before any 123-reg change, record (screenshot) the
  existing DNS records; change nothing for the root domain, `www`, email (MX,
  SPF, DKIM, DMARC) or any other existing record. Add only the `oathstone`
  A record and Replit's TXT verification record.
- Secrets are generated in the Replit shell (`openssl rand -hex 32`) and
  pasted straight into Publishing → Secrets. Never show, log, screenshot or
  commit them, and never reuse development values.
- Confirm the Reserved VM charge shown by Replit with Tom before paying.
- Never touch HubSpot or the company page's updates sign-up wiring.
- OathstoneGame's Replit Agent changes no code; code changes go through this
  repository and Verify. Stackstone Builder changes go through its own agent.

### 3. OathstoneGame deploy (Replit, Reserved VM)

1. **Sync.** In the OathstoneGame workspace: `git fetch origin main`,
   `git checkout main`, `git reset --hard origin/main`. Confirm
   `git log -1` is the released commit and `git status` is clean. The
   release must include D115 (the Reserved VM deployment configuration); the
   first publish, on `ec2a883`, crash-looped without it.
2. **Device test.** Tom's solo run in `docs/MANUAL_TESTS.md` ("Beta solo
   play-through") on the preview, if not already done on this commit.
3. **Production database.** Create it in Replit; its connection string is
   the deployment's `DATABASE_URL` _(Replit shows this)_.
4. **Create the tables** from the Replit shell with the production
   connection string:
   `OATHSTONE_CONFIRM_PRODUCTION_MIGRATION=apply DATABASE_URL=<production URL> pnpm run db:migrate:production`.
   Expect "Production migrations are up to date." Never run
   `db:migrate:dev` against production.
5. **Deployment settings.** Publishing → **Reserved VM** (not Autoscale or
   Static). Recommended size for Halloween week: 1 vCPU / 4 GiB (Replit shows
   the price; 0.5 vCPU / 2 GiB is the cheaper pilot). The committed `.replit`
   sets `deploymentTarget = "gce"`, build `pnpm run build:oathstone` and run
   `pnpm run start:oathstone`; confirm the Publishing pane shows exactly
   these two commands and a single web server. If it lists the artifacts
   ("Oathstone", "Oathstone API") or their own commands instead, stop: that is
   the configuration that failed (D115). Do not set a deployment `PORT`: the
   server uses the platform's `PORT` if set, otherwise 5000. `/healthz` and
   `/readyz` are the health paths.
6. **Production secrets, first publish** (Publishing → Secrets):
   `DATABASE_URL`; `SESSION_SECRET` and `PIN_PEPPER` (new random values);
   `PIN_PEPPER_VERSION` = `1`; `MAX_ACTIVE_GAMES` = `10`;
   `APP_BASE_URL` and `PUBLIC_BASE_URL` = the deployment's own
   `https://….replit.app` address _(Replit shows this)_. The game accepts
   requests only from `APP_BASE_URL`, and invite links use
   `PUBLIC_BASE_URL`, fixed at build time; so the first publish uses the
   replit.app address and is switched in step 11. Leave
   `PRE_LAUNCH_NOINDEX` and `COMING_SOON_MODE` unset.
7. **Spending.** Account usage cap plus a separate VM budget (the cap does not
   limit the VM's fixed charge).
8. **Publish** (Tom confirms the displayed charge first).
9. **Smoke test on the replit.app address:** `/healthz` and `/readyz` return
   200; entry shows "Beta" and "Report an issue"; on two devices create a
   game, join, start, give the round-table shield and play to a result.

### 4. Domain (Replit, then 123-reg)

10. In the OathstoneGame deployment, add the custom domain
    `oathstone.stackstoneconsulting.co.uk`. Replit shows an A record and a TXT
    record. At 123-reg (DNS for `stackstoneconsulting.co.uk`), after recording
    the existing records, add exactly those two records for the `oathstone`
    host. Wait until Replit shows the domain verified with HTTPS (minutes to a
    few hours). Keep the TXT record for certificate renewals.
11. **Switch the game to its domain.** Set `APP_BASE_URL` and
    `PUBLIC_BASE_URL` to `https://oathstone.stackstoneconsulting.co.uk` and
    republish (this rebuilds, so invite links and QR codes use the domain).
    Games created on the replit.app address in step 9 were tests; do not
    share them.
12. **Smoke test on the domain:** repeat step 9; check the Lobby share link
    and QR show `https://oathstone.stackstoneconsulting.co.uk/join/…`.

### 5. Stackstone Builder (company site)

13. **Redirect** (independent; can ship any time): any path that matches
    `/oathstone` case-insensitively, with or without a trailing slash, and is
    not exactly `/oathstone`, returns a 301 to `/oathstone`, keeping any query
    string. Sub-pages (`/oathstone/updates`, `/oathstone/privacy`) get the
    same treatment. Test `/Oathstone`, `/OATHSTONE`, `/oathstone/` and
    `/Oathstone?x=1`.
    13a. **Play shortcut** (only after step 12 passes): `/oathstone/play`, matched
    case-insensitively with or without a trailing slash, returns a 302 to
    `https://oathstone.stackstoneconsulting.co.uk/`. It must take precedence
    over the case redirect in step 13. Test `/oathstone/play` and
    `/Oathstone/Play/` on a phone.
14. **Launch the page** (only after step 12 passes):
    - Replace "Coming soon" with a "Beta" marker and "Play now — free, in
      your phone's browser".
    - Above the fold, three buttons: "Join a game" (primary), "Create a new
      game", "Practise alone", deep-linking as in section 1.
    - Copy must match the beta: missions are off ("Missions are coming
      soon"), so remove "Complete missions, build the prize pot" and similar
      claims; the round-table shield is decided by conversation; feedback via
      "Report an issue" (assistant@stackstoneconsulting.co.uk).
    - Keep the updates sign-up, FAQ, privacy page, canonical and the
      official Stackstone brand files exactly as they are.
15. Tom republishes Stackstone Builder; check the buttons land on the right
    game screens on a phone, and the redirects from step 13.

### 6. After release

16. Record the release in `docs/RELEASES.md` (commit, Verify run, date) and a
    status block in `docs/PROGRESS.md`.
17. **Rollback.** Game: republish the previous green commit from
    `docs/RELEASES.md`; games in progress survive a restart (events are in
    PostgreSQL). Company page: Replit checkpoint rollback, then republish.
    DNS: remove only the two `oathstone` records added in step 10.

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

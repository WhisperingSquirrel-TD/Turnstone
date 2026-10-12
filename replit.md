# APP_NAME — Stackstone Consulting

Website-only hidden-role party game foundation. The binding `docs/SPEC.md` is being delivered in seven parts: save each verbatim in order and reply only "Part N saved". Do not write other code or start Milestone 1 until all seven parts are saved and the owner approves the plan.

## Source of truth

- `docs/PLAN.md`: milestones, classifications and exit gates.
- `docs/DECISIONS.md`: deviations, dependency rationale and blockers.
- `docs/PROGRESS.md`: honest verification status.
- `lib/api-spec/openapi.yaml`: infrastructure API contract; regenerate with `pnpm --filter @workspace/api-spec run codegen` after changes.
- `lib/db/src/schema/`: database schema; committed development migrations in `lib/db/migrations/`.
- `lib/security`: shared nonce/security-header policy.
- `artifacts/party-game/src/theme.css`: sole brand token definitions.
- `artifacts/party-game/src/locale/en-GB.ts`: UK English UI strings.
- `artifacts/party-game/src/config.ts`: APP_NAME config placeholder.

## Layout and commands

Existing pnpm workspace retained: `artifacts/api-server` = requested apps/server, `artifacts/party-game` = apps/web, `lib/engine` = packages/engine, `lib/shared` = packages/shared.

`npm run verify` checks types, lint, formatting, unit/property/database integration tests, four-device Playwright/axe smoke, Lighthouse and high/critical dependency audit. Do not bypass a failing stage. Managed workflows must be running for browser checks.

`npm run verify:full` is honestly unavailable until Milestone 2. `npm run db:migrate:dev` explicitly applies committed development migrations; never run it in production. No production startup DDL.

Run services with their artifact-managed workflows. Node 24 LTS. Database and session secrets remain in workspace Secrets, never read out or stored in files.

## Standing scope rules

Keep Replit's pnpm workspace template. Use pnpm wherever the spec says npm, with the apps/packages mapping recorded in `docs/DECISIONS.md`.

Stay on the free tier: do not publish, deploy or enable any paid service, and keep each run focused to save usage.

Strict TDD; never waive tests or audit findings. UK English. No emojis, TV-show branding, seasonal theme or native app. No game secrets in logs, URLs, titles, storage or notifications. Future game state must be server-only with viewer allow-list projections, a blind playing coordinator, uniform private interactions and press-and-hold privacy shielding.

Deployment must be an approved single-instance Reserved VM, not Autoscale. The website's nonce CSP requires a Node response server. No deploy until launch gates pass.

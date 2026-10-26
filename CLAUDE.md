# CLAUDE.md: Oathstone (repo WhisperingSquirrel-TD/Turnstone, branch main)

Oathstone is a free browser-based hidden-traitor party game by Stackstone Consulting. Claude Code now builds it. The Replit Agent is dormant and must be able to resume from the same files.

## Single source of truth (do not create parallel files)

- Read first, every session: replit.md, docs/PROGRESS.md (top block), .agents/memory/MEMORY.md and the memory files it indexes, docs/SPEC.md, docs/DECISIONS.md, docs/QUESTIONS.md, docs/PLAN.md.
- Do NOT create CLAUDE-specific notes, memory folders, plans or status files. Update the existing Replit files instead:
  - docs/PROGRESS.md: put a "Status for reviewer" block at the top after every push (what changed, Verify run number and result, what is next), in the same format as the Agent's.
  - docs/DECISIONS.md and docs/QUESTIONS.md: record decisions and open owner questions as the Agent did.
  - .agents/memory/\*.md plus the MEMORY.md index: add or edit a memory file for any lesson, rule or gotcha, so the Replit Agent inherits it.
  - replit.md: keep it accurate if architecture, commands or conventions change.
- Do not rename, move or delete these files. Do not edit docs/SPEC.md section 3 at all.

## Hand-off protocol (so Replit can resume)

- Work on main, small commits, clear messages. Never leave work uncommitted or unpushed at the end of a session.
- Before stopping: working tree clean, pushed, Verify result recorded in docs/PROGRESS.md, next step written down.
- Only one of Claude Code or the Replit Agent changes code at a time; Tom tells you when the Agent takes over.
- Do not edit .replit, .replitignore or Replit deployment settings unless a task says so.

## Hard limits

- Never publish, deploy, change DNS or domains, change production secrets, widen permissions or enable any paid option. Tom publishes from Replit himself.
- Never print, log or commit secret values. Never invent DNS values.
- No changes to docs/SPEC.md section 3, rate limits, or any game rule beyond the approved voting circle and organiser-governed discussions (docs/QUESTIONS.md and docs/DECISIONS.md hold the wording).
- Never read or write HubSpot. Send nothing externally.
- Never weaken, skip or delete secrecy, role-neutral, geometry or privacy tests. Never raise a timeout to hide slowness; fix the speed.
- Never push while a Verify run is active (a push cancels it). CI on GitHub is the judge; local partial runs do not count as green.

## Engineering rules

- Test-driven: write the failing test first, then the code. Secure by default. UK English in all copy and docs. No emojis.
- Monorepo with pnpm. Run lint, types and the relevant tests before each push. Golden scenario count is 18.
- Secrecy: private choices and roles never reach a client that should not see them. Night screens are role-neutral. Removed or departed players never reveal role or side unless the existing departureReveal setting says so (disconnect removal never reveals).
- Mobile first at 390 px. Layout audit covers 71 states x 4 widths x 2 themes x 4 browser profiles.
- Branding: use only the official Stackstone files from https://stackstoneconsulting.co.uk/brand/, unmodified.

## Working with Tom

- Short, plain updates. Lead with the answer. One question at a time, only for owner decisions, with a recommendation.
- When Tom sends a phone screenshot: answer first, fix it, and add a test that would have caught it.
- Reviewer (Claude in chat) checks every push against git and Verify. Do not argue with CI; fix the cause.

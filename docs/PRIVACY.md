# Privacy design — foundation

No game, guests, seat PINs, roles, votes or account data are collected in Milestone 0. The database contains only infrastructure metadata.

Future Must controls: server-only game state; viewer allow-list projections on every HTTP/socket output; no secrets in logs/URLs/titles/notifications/browser storage; blind coordinator and unfinished-game admins; uniform private interactions; press-and-hold reveal with immediate clearing on release/page hide. No private routes in search indexing or service-worker caches.

Erasure paths, age-appropriate guidance, legal basis and Stackstone's final privacy notice await SPEC and release review. This document is not a finished public privacy policy.

## Retention (D117)

- Real games, with everything in them, are kept until the end of the game's
  last day and deleted the day after (from about 04:00 UK). The organiser sets
  the last day, at most six months ahead; players are told the deletion day.
- Practice games are deleted 24 hours after their last activity.
- A deleted game leaves only a tombstone: the game id, the deleted date and
  the reason.
- Logs: the 30-day retention default stays.

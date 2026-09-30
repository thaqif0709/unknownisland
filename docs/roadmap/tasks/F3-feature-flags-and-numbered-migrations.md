---
id: F3
title: Feature flags and numbered migrations
lane: foundations
owner: thaqif
status: done
depends: [F1]
flag: none
size: ½ session
---
# F3: Feature flags and numbered migrations

Let half-finished work merge to `main` without going live, and stop both of you editing the same migration function.

## Scope

- `RULES.FEATURES`, the `FEATURES` env var override, `WG.feature(name)`, flags sent to the client on join (CONTRACTS.md §1).
- `server/migrations/NNNN-name.sql|js` run in order, recorded in a `migrations` table (CONTRACTS.md §14). The existing `migrate()` becomes `0001-baseline`.

## Files it touches

server/shared/world-gen.js (FEATURES only), server/store.js, new server/migrations/*

## Contracts

Contracts §1 and §14

## Done when

- [x] A test flag can be turned on and off with the env var.
- [x] A fresh database and the live one both migrate cleanly (try against a copy of the Neon branch first).
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done. Flags: RULES.FEATURES, WG.feature/features, FEATURES env var, sent in welcome, applied in net.js. Migrations: server/migrations/ with 0001-baseline, run once each in a transaction under pg_advisory_xact_lock (works through Neon's pooler). Tested: an old-style database (migrated by the previous code) and a fresh one end up with identical schemas and content; three servers migrating at once apply it once; a broken migration rolls back and stops start-up; duplicate numbers and bad names are refused. 124 server checks pass.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

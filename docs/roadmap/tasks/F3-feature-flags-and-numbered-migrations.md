---
id: F3
title: Feature flags and numbered migrations
lane: foundations
owner: thaqif
status: todo
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

- [ ] A test flag can be turned on and off with the env var.
- [ ] A fresh database and the live one both migrate cleanly (try against a copy of the Neon branch first).
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

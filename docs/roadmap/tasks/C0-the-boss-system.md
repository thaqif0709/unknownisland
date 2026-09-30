---
id: C0
title: The boss system
lane: content
owner: edvin
status: todo
depends: [P5, P6]
flag: bosses
size: 1–2 sessions
---
# C0: The boss system

Everything bosses share: appearing, arenas, scaling, phases, losing, winning and opening the next region.

## Scope

- `server/bosses/<id>.js` on top of the mob framework (CONTRACTS.md §10); real `island.bosses.summon`.
- A `bosses` table (state, health, phase, defeated_at) so a restart resumes a fight.
- Arena of ~40 m, health × (1 + 0.6 per extra frog), wipe resets it to its next appearance, trophies for everyone present, echoes for latecomers.
- Boss health bar, map marker, camera shake. On defeat call `openRegion(next)`.

## Files it touches

new server/systems/bosses.js, new server/bosses/*, new public/js/bosses.js, new migration

## Contracts

Contract §10 real

## Done when

- [ ] A debug test boss can be summoned, beaten and wiped against.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

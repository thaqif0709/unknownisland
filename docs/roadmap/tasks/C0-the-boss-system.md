---
id: C0
title: The boss system
lane: content
owner: edvin
status: review
depends: [P5, P6]
flag: bosses
size: 1–2 sessions
---
# C0: The boss system

Everything bosses share: appearing, arenas, scaling, phases, losing, winning and opening the next region.

## Scope

- `server/bosses/<id>.js` on top of the mob framework (CONTRACTS.md §10); real `island.summonBoss`.
- A `bosses` table (state, health, phase, defeated_at) so a restart resumes a fight.
- Arena of ~40 m, health × (1 + 0.6 per extra frog), wipe resets it to its next appearance, trophies for everyone present, echoes for latecomers.
- Boss health bar, map marker, camera shake. On defeat call `openRegion(next)`.

## Files it touches

new server/systems/bosses.js, new server/bosses/*, new public/js/bosses.js, new migration

## Contracts

Contract §10 real

## Done when

- [x] A debug test boss can be summoned, beaten and wiped against.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 edvin: built behind `bosses` (off): server/bosses/ (boss files are mob kinds too) and systems/bosses.js: summonBoss calls a region's boss, appear.when and cooldown, the 40 m arena, health × (1 + 0.6 per extra frog), phases, a wipe resets it, trophies for everyone present, an echo for latecomers, bossDay and openRegion(next) on defeat, the `bosses` table (0010) to resume after a restart; the practice boss (the Straw Giant, `/boss practice`); the health bar, map mark, camera shake and echo in the browser. The flag goes on with the first real boss (C1, the Tidewife).

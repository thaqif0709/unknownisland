---
id: P5
title: Enemy framework, with the Stilled moved onto it
lane: player
owner: edvin
status: done
depends: [F1, F2]
flag: none
size: 1–2 sessions
---
# P5: Enemy framework, with the Stilled moved onto it

One engine for every creature: the Stilled kinds, the Crawler and bosses.

## Scope

- Server: `island.mobs` with state machines, health, weaknesses by damage tag, touch effects, telegraphs (CONTRACTS.md §8).
- Client: mob snapshots, drawing by kind from `public/js/mobs/<kind>.js`, telegraph shapes drawn in ink on the ground.
- Move today's Stilled onto it with exactly the same behaviour.

## Files it touches

new server/mobs/*, server/systems/stilled.js, new public/js/mobs/*, public/js/stilled.js

## Contracts

Contract §8

## Done when

- [x] The Stilled behave exactly as now (tests).
- [x] A test mob with a telegraphed attack works in debug.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 edvin: done. `server/mobs/` (engine + `stilled` + test `dummy`), `public/js/135-mobs.js` + `public/js/mobs/`, the client bundle joins a part's folder after it, snapshot `s` became `m`. Also touched (to move the Stilled): world.js (constructor, tick, snapshot), players.js (dread near a Stilled), time.js (the one left overnight), chat.js (`/spawn` for admins). Tests: `tests/server/mobs.test.js` (6). Hidden Pages unchanged: nothing players see changed.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

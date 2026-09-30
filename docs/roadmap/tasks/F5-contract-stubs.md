---
id: F5
title: Contract stubs
lane: foundations
owner: thaqif
status: todo
depends: [F1, F2, F3]
flag: none
size: 1 session
---
# F5: Contract stubs

Put every cross-lane contract in place as a working stub, so W, P and C tasks can start without waiting on each other.

## Scope

- Items API `give/take/count/held` over today's `p.inv`, and replace every direct `p.inv[...]` edit (about 17 places) with it (CONTRACTS.md §4).
- `WG.USE` registry for E interactions, with today's objects moved onto it (§5).
- `WG.regionAt` (always `landing`), `WG.REGIONS`, `isRegionOpen`, `openRegion` stubs (§6).
- `island.bosses.summon` stub that logs an island event (§10), `island.respawnPoint(p)` stub returning today's respawn (§11), `WG.climbAt` stub returning null (§12).
- `server/regions/<id>.js` empty files for all seven region ids.

## Files it touches

server/world.js core, server/systems/*, server/shared/world-gen.js, new server/regions/*

## Contracts

Stubs for contracts §4, §5, §6, §10, §11, §12

## Done when

- [ ] Game unchanged.
- [ ] A grep for `p.inv[` outside the inventory module finds nothing.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

---
id: F5
title: Contract stubs
lane: foundations
owner: thaqif
status: done
depends: [F1, F3]
flag: none
size: 1 session
---
# F5: Contract stubs

Put every cross-lane contract in place as a working stub, so W, P and C tasks can start without waiting on each other.

## Scope

- Items API `give/take/count/held` over today's `p.inv`, and replace every direct `p.inv[...]` edit (about 17 places) with it (CONTRACTS.md §4).
- A `uses` registry for E interactions (each system registers the kinds it owns), with today's objects moved onto it (§5).
- `WG.regionAt` (always `landing`), `WG.REGIONS`, `isRegionOpen`, `openRegion` stubs (§6).
- `island.summonBoss` stub that logs an island event (§10), `island.respawnPoint(p)` stub returning today's respawn (§11), `WG.climbAt` stub returning null (§12).
- `server/regions/<id>.js` empty files for all seven region ids.

## Files it touches

server/world.js core, server/systems/*, server/shared/world-gen.js, new server/regions/*

## Contracts

Stubs for contracts §4, §5, §6, §10, §11, §12

## Done when

- [x] Game unchanged.
- [x] A grep for `p.inv[` outside the inventory module finds nothing.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done. Dropped the F2 dependency (everything here is server-side). server/systems/inventory.js owns p.inv/p.tools/p.buckets and all ~40 direct uses in 10 files now call it; E on world objects goes through a `uses` registry (CONTRACTS.md §5 changed from `WG.USE` to per-system `uses`); regions, bosses and respawn placeholders in systems/regions.js (`summonBoss` is a flat method, not `island.bosses.summon`); WG.REGIONS/regionAt/climbAt; server/regions/<id>.js for all seven regions. 124 existing server checks plus 28 new ones pass.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

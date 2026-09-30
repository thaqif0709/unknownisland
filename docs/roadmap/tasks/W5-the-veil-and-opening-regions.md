---
id: W5
title: The Veil and opening regions
lane: world
owner: thaqif
status: todo
depends: [W4]
flag: bigworld
size: 1 session
---
# W5: The Veil and opening regions

Locked regions sit behind a fog wall that turns you around, and lift at dawn when opened.

## Scope

- Veil fog along the borders of locked regions (reuses the fog system).
- Walking in raises dread quickly and turns you round to face back out (server-checked so you can't walk through).
- Real `isRegionOpen` / `openRegion` with a `regions_open` record, an island event, and the Veil lifting at the next dawn.
- The map hatches locked regions.
- Region borders come from `WG.regionAt` (W4): the Landing includes the neck up to the Stairs' shore (about z = -370).

## Files it touches

server/systems/fog.js, server/systems/regions.js, public/js/fog.js, public/js/map.js

## Contracts

Contract §6 real opening

## Done when

- [ ] Only the Landing is reachable on a fresh island.
- [ ] A debug command opening the Stairs lifts the Veil at the next dawn.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

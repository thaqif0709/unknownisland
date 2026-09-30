---
id: W5
title: The Veil and opening regions
lane: world
owner: thaqif
status: done
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

- [x] Only the Landing is reachable on a fresh island.
- [x] A debug command opening the Stairs lifts the Veil at the next dawn.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done, part of the `bigworld` flag. `regions_open` (migration 0005): `openRegion` marks a region, the Veil lifts at the next dawn (onDawn hook), `regions` message to everyone. Server refuses moves onto locked land (`veil` message, +6 dread, 1.5 s cooldown); browser `115-veil.js` stops you first and turns you round, draws a fog bank (up to 420 puffs) along locked borders within 180 m, and the map fogs and hatches locked land. The "debug command" is `/open <region>` for usernames in `ADMINS`. Hidden Pages text flag-gated. Tests: 13 server checks (fresh island, blocked at the Stairs' shore at z = -370, dread, admin only, lifts at dawn, walkable after, survives a restart, flag off) and 5 browser checks (fog bank drawn, walking north for 7 s never crosses, the message shows). The wall is only drawn within 180 m; seeing it from afar goes with W3.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

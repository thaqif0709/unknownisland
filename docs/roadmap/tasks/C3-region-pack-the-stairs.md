---
id: C3
title: Region pack: The Stairs
lane: content
owner: thaqif
status: doing
depends: [W5, W8, W9, P3]
flag: region-stair
size: 2 sessions
---
# C3: Region pack: The Stairs

Everything for the Stairs.

## Scope

- Terrain dressing (terraces, ruins, standing stones, pines) in `server/regions/stair.js`.
- Flint, herbs, flax, old bricks, tin, bronze tier, stone beetle, wind moth, terrace grasshopper, mountain trout.
- The Leaning (wind-driven Stilled).
- Mine shaft caves.
- A 5-request chain.
- The Keeper of Steps (needs C0).
- Journal entries and a Hidden Pages section.

## Files it touches

server/regions/stair.js, new server/mobs/leaning.js, new server/bosses/keeper.js, public/js/mobs/*, server/content/*

## Done when

- [ ] The Stairs are playable from opening to beating the Keeper, which opens the Weeping Wood.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Notes

Build the boss last; everything else only needs the listed dependencies.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 thaqif: first part merged behind `region-stair` (off): flint, herbs, flax, old walls, standing stones, tin; three bugs and journal entries; the Leaning; the old mine; the five-request chain; the browser side (108-the-stairs.js, mobs/leaning.js). Still to do: the Keeper of Steps (needs C0) and the bronze tier (needs P3).

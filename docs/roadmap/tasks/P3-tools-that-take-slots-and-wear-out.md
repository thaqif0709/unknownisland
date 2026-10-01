---
id: P3
title: Tools that take slots and wear out
lane: player
owner: edvin
status: done
depends: [P2]
flag: tools
size: 1 session
---
# P3: Tools that take slots and wear out

Tools and weapons are items; the selected one is what you use; they wear out and can be repaired.

## Scope

- Durability per tool in `ITEMS` (DESIGN.md §4), wear bar, warning at 20%, breaking gives back one material.
- Chopping and mining use the held tool; bare hands are slow or can't.
- Owned tools become items in the bag. Recipes that need a tool check the bag.
- Repair at a lit hearth for half the materials.

## Files it touches

server/systems/gather.js, server/systems/inventory.js, server/shared/world-gen.js (ITEMS, RECIPES), public/js/hotbar.js

## Contracts

Weapons can be items for P6

## Done when

- [x] A pickaxe breaks after its uses and returns a stone.
- [x] Hidden Pages: tools and durability table (numbers read live).
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 edvin: built behind a new flag `tools` (off), since `slots` is already on for players. Tools are items with uses left, used from the hand, break into one material, mended at a lit hearth; owned tools become items. Tests: `tests/server/tools.test.js` (6). Waiting on a try by hand before the flag goes on.
2026-10-01 edvin: `tools` switched on for everyone (RULES.FEATURES); `FEATURES=-tools` on Render turns it off again if needed.

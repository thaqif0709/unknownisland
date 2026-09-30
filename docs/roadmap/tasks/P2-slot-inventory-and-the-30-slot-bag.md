---
id: P2
title: Slot inventory and the 30-slot bag
lane: player
owner: edvin
status: review
depends: [F2, F3, F5]
flag: slots
size: 2 sessions
---
# P2: Slot inventory and the 30-slot bag

8 hotbar slots plus a 30-slot bag on I, with stacks, dragging, and gathering into the bag.

## Scope

- Server: slot arrays, stack sizes from `ITEMS`, `move {from,to,count}` messages checked on the server, full bag drops a sack. The items API (§4) now works on slots.
- Migration of every player's current inventory (and buckets) into slots.
- Inventory panel: drag, merge, swap, Shift-click, right-click half, drag out to drop; tap-to-move on phones.
- E collects berries, coconuts and everything else into the bag; hold E ~1 s on a food slot to eat (ring round the crosshair, eating pose).

## Files it touches

new server/systems/inventory.js, public/js/inventory.js, public/js/hotbar.js, public/index.html, new migration

## Contracts

Contract §4 real

## Done when

- [x] No item can be copied by sending odd `move` messages (tests).
- [x] Existing players keep everything.
- [x] Hidden Pages: inventory and controls updated.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-09-30 edvin: built behind `slots` (server slots and moves, the bag panel, gathering into the bag, hold E to eat, tests). No SQL migration was needed: the slots are saved in the inventory JSON and rebuilt from the counts on every join. Waiting on a try by hand (phones especially) before the flag goes on.

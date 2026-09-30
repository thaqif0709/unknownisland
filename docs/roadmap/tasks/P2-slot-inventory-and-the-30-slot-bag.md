---
id: P2
title: Slot inventory and the 30-slot bag
lane: player
owner: edvin
status: todo
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

- [ ] No item can be copied by sending odd `move` messages (tests).
- [ ] Existing players keep everything.
- [ ] Hidden Pages: inventory and controls updated.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

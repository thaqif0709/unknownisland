---
id: P4
title: Hearth checkpoints
lane: player
owner: thaqif
status: done
depends: [F2, F5]
flag: checkpoints
size: 1 session
---
# P4: Hearth checkpoints

Sleep beside your hearth to set where you wake.

## Scope

- Hold V next to your own lit hearth: curled sleeping pose (hood over the face), 3 s to save; faster energy regen while resting.
- `players.checkpoint`, real `island.respawnPoint(p)` (hearth out: cold wake with dread; hearth gone: the Landing).
- Map flag in your colour plus a legend entry; friends' flags fainter; a pennant on the hearth.
- Sharing one hearth with friends.

## Files it touches

new server/systems/checkpoints.js, public/js/145-hearth-checkpoints.js, migration 0007; the sleep pose in 120-castaways.js, the flag marker in 290-map.js, `UI.mapLayers` moved into 000-start.js

## Contracts

Contract §11 real

## Done when

- [x] Knocked down by the Stilled, you wake at your hearth.
- [x] Hidden Pages: checkpoints section and controls.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-09-30 thaqif: done behind `checkpoints`. Sit (V) by any lit clay hearth; after 3 s you curl
up asleep (hood over the face, energy back twice as fast) and it's saved (island_members.checkpoint,
migration 0007). Knocked down or collapsing: you wake beside it; cold and uneasy if it's out;
the beach if it's gone. No checkpoint: a knockdown leaves you where you fell, as before. Map
flag (yours bold, friends' faint, legend entry) and a pennant on the hearth.
`tests/server/checkpoints.test.js` (4 tests: sleep and wake after a knockdown far away; too soon,
cold hearth, campfire and no checkpoint all leave things as they were; cold and gone hearths;
kept across leaving). `npm test` 43/43. Browser check: build a hearth from the book, sit, asleep
with a pennant and a map flag, no page errors. Also fixed: `UI.mapLayers` is now created in
000-start.js, so parts numbered before the map can add markers.

---
id: P4
title: Hearth checkpoints
lane: player
owner: thaqif
status: todo
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

new server/systems/checkpoints.js, public/js/castaways.js (pose), public/js/map.js (flag marker), new migration

## Contracts

Contract §11 real

## Done when

- [ ] Knocked down by the Stilled, you wake at your hearth.
- [ ] Hidden Pages: checkpoints section and controls.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

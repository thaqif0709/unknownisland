---
id: P10
title: Rafts and zip lines
lane: player
owner: edvin
status: done
depends: [P2]
flag: rafts
size: 1 session
---
# P10: Rafts and zip lines

Float down rivers and cross the Mire; slide down player-built lines.

## Scope

- Raft recipe, placing it on water, boarding and steering, river current pushes you.
- Zip lines: tie vine rope between two high points; anyone can ride.
- Saved in the world (a small table or as objects).

## Files it touches

new server/systems/rafts.js, new public/js/rafts.js, new migration

## Done when

- [x] Two frogs can ride one raft.
- [x] A zip line built by one player works for another.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 edvin: built behind a new flag `rafts` (`travel` was already on) and switched on in the same PR, as asked: raft recipe (wood), set on deep water, two aboard with the first paddling, aground stops it, stepping ashore only onto ground, rivers' current in the wider world; zip line kits (wood, copper) strung top to bottom with length, drop and clearance checks, ridden by anyone; both saved in `islands.rides` (migration 0009). Tests: `tests/server/rafts.test.js` (6), `tests/browser/rafts.test.js`.

---
id: W7
title: The big map
lane: world
owner: thaqif
status: done
depends: [W4]
flag: bigworld
size: 1 session
---
# W7: The big map

A map that works at 5 km and fills in as people explore.

## Scope

- Pan and zoom, legend kept.
- Charting: map areas start blank and fill in where anyone has walked (shared; a `map_seen` bitset per chunk).
- A layer API other tasks can add markers to (checkpoint flags P4, boss markers C0, friend calls P11).
- The map already covers the whole world when `bigworld` is on (W4), but the minimap shows all of it too, so the Landing is tiny: centre it on the player and zoom.

## Files it touches

public/js/map.js, new server/systems/charting.js, new migration

## Contracts

Map layers

## Done when

- [x] Walking somewhere new reveals it on everyone's map.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done. Pan (drag), zoom (wheel, pinch, buttons), Me and All on the full map, for everyone. With `bigworld`: sharper 256 m tiles when zoomed in (a few per frame), minimap centred on you (170 m each way), charting (one bit per 32 m chunk, 5 x 5 around each player every second, `islands.seen`, migration 0006, a parchment layer drawn scaled with soft edges; the Landing is always known). `UI.mapLayers` for other tasks' markers. Dropped the note about drawing streamed objects: the map never drew trees and rocks, only land colours and markers. Tests: 8 server checks (chart in the welcome, 25 chunks revealed, nothing re-sent, survives a restart, flag off sends nothing) and browser runs with the flags off (map unchanged) and on (all, zoom, drag, minimap). All 221 checks pass.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

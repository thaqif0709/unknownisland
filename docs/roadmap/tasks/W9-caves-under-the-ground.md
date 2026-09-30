---
id: W9
title: Caves under the ground
lane: world
owner: thaqif
status: todo
depends: [W1]
flag: caves
size: 2 sessions
---
# W9: Caves under the ground

Walk-in caves with no loading screen, built from the seed.

## Scope

- Cave generator: chambers and tunnels from a seed, placed under the terrain, with a hole in the terrain mesh at the mouth.
- Movement inside: floor and ceiling heights, collisions. The server tracks when a player is underground.
- Darkness inside (a torch or lantern is needed), no fog, "the Dark" dread, muffled chat to people outside.
- The Landing sea cave: only open at low tide, floods as the tide rises.

## Files it touches

new server/shared/caves.js, public/js/terrain.js (mouth holes), new public/js/caves.js, server/systems/caves.js

## Contracts

Cave API for region packs and the Crawler

## Done when

- [ ] Two players can go into the sea cave together at low tide and see each other's lights.
- [ ] The rising tide pushes you out.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

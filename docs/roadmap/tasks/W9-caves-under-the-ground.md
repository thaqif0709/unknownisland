---
id: W9
title: Caves under the ground
lane: world
owner: thaqif
status: done
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

new server/shared/caves.js, server/systems/caves.js, public/js/135-caves.js; mouth holes in 040-terrain.js; small hooks in players, chat, crafting, gather, objects, stilled, world.js and the browser's movement, camera and held items

## Contracts

Cave API for region packs and the Crawler

## Done when

- [x] Two players can go into the sea cave together at low tide and see each other's lights.
- [x] The rising tide pushes you out.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 thaqif: done behind `caves`. The Landing's sea cave (east shore, under the low hill):
a 40 m tunnel that dips to 2.6 m below the sea, a chamber and a side passage, placed by a
search script so there's at least a metre of ground over the roof (5.5 m at the thinnest).
Two tides a day; the way in is open for a few minutes around low tide, and the rising water
drags you out. The Dark, torches (wood 2 + seeds 1, about 5 min each), no fog, cold, fires or
Stilled underground, muffled chat, saved at the mouth. In the repo: `tests/server/caves.test.js`
(3 tests; `npm test` 38/38, with and without Postgres) and a `time` test command. Scratch server test: 26 checks. Browser test:
two players walk in together at low tide, each sees both torches, it's dark, and the tide
pushes them out about a minute later; no page errors; flag off leaves everything as it was.
Suite: 247 server checks pass. Not done here: the Stairs' and other regions' caves (region
packs), cave finds, ropes, the Sleeper changing caves overnight (C-tasks).

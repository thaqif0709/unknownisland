---
id: W2
title: Send and run only what's near players
lane: world
owner: thaqif
status: todo
depends: [W1]
flag: streaming
size: 1–2 sessions
---
# W2: Send and run only what's near players

Each player receives only nearby chunks, and only chunks near someone are simulated. Far chunks catch up when visited.

## Scope

- Area of interest: the client asks for chunks as it moves, the server sends objects, fires, lanterns, sacks and mobs for those chunks and updates only to players who have them.
- Chunk sleep and wake with catch-up (regrowth, fire burn-down, lantern fuel) using the existing `advance` logic.
- The Stilled and other mobs only run near players.
- Build on W1 (CONTRACTS.md section 16): `loadChunk`/`unloadChunk` already exist. The client
  keys objects by id today as array indexes; chunk ids are 10,000,000+, so it needs a Map,
  and it can build chunks itself with `WG.generateChunk` from spawn tables sent on join.
- Add the `streaming` flag here (W1 needed none: nothing loads chunks automatically yet).

## Files it touches

server/world.js core, server/systems/*, public/js/join.js, public/js/chunks.js

## Contracts

Scale for the 5 km world

## Done when

- [ ] Two players far apart only receive their own area.
- [ ] Leaving an area for an in-game day and coming back shows the right regrowth.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

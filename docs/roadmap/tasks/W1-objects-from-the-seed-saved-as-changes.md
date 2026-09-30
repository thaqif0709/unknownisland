---
id: W1
title: Objects from the seed, saved as changes
lane: world
owner: thaqif
status: done
depends: [F5]
flag: streaming
size: 2 sessions
---
# W1: Objects from the seed, saved as changes

Trees, rocks and everything else are made from the world seed per chunk. Only changes (felled, mined, regrowing, built) are stored.

## Scope

- Deterministic per-chunk object generation (same result on server and client).
- An `object_changes` table keyed by chunk and object id, plus a one-time conversion of the current `objects` rows into changes against the seed.
- Server loads a chunk's changes when the chunk is first needed.

## Files it touches

server/shared/world-gen.js (generation), server/systems/gather.js, server/store.js, new migration

## Contracts

The base for W2 and W4

## Done when

- [x] With the flag on, the Landing looks the same and every felled tree, mined rock and fire is still where it was.
- [x] Server memory and join time no worse than now.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done. The Landing keeps its `generateObjects` list and ids unchanged; new land is made per 32 m chunk by `WG.generateChunk` (deterministic, 0.06 ms a chunk) from region `spawn` tables, ids from 10,000,000 up. Changed from the plan: instead of a new `object_changes` table, `world_objects` gets a `chunk` column (migration 0003, backfilled from positions), so no data had to move. `server/systems/objects.js` owns objects (`obj`, `eachObject`, `loadChunk`, `unloadChunk`). No flag needed: nothing loads chunks automatically until W2. Tested: migration on data saved by the previous code (40 changes, all tagged right, states identical); chunk load/use/save/unload/reload/regrowth (14 checks); load time, memory, join time and welcome size unchanged. 187 checks pass.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

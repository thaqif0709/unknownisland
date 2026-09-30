---
id: W1
title: Objects from the seed, saved as changes
lane: world
owner: thaqif
status: todo
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

- [ ] With the flag on, the Landing looks the same and every felled tree, mined rock and fire is still where it was.
- [ ] Server memory and join time no worse than now.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

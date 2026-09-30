---
id: W7
title: The big map
lane: world
owner: thaqif
status: todo
depends: [W4]
flag: bigworld
size: 1 session
---
# W7: The big map

A map that works at 5 km and fills in as people explore.

## Scope

- Pan and zoom, legend kept.
- Charting: map areas start blank and fill in where anyone has walked (shared; a `map_seen` bitset per chunk).
- Show streamed objects (W2 chunks) on the map, not only the Landing's.
- A layer API other tasks can add markers to (checkpoint flags P4, boss markers C0, friend calls P11).

## Files it touches

public/js/map.js, new server/systems/charting.js, new migration

## Contracts

Map layers

## Done when

- [ ] Walking somewhere new reveals it on everyone's map.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

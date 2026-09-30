---
id: W4
title: The 5 km world shape
lane: world
owner: thaqif
status: todo
depends: [W2]
flag: bigworld
size: 2 sessions
---
# W4: The 5 km world shape

The new ground: regions, rivers, valleys and the Teeth, with the Landing exactly as it is.

## Scope

- A region map and new `heightAt` (DESIGN.md §2 layout). Inside the Landing, the old function is used unchanged so nothing moves.
- Rivers and lakes (for rafts, fishing).
- Real `WG.regionAt` and per-region spawn tables read from `server/regions/<id>.js` (each starts with placeholder plants).
- Map texture scaled to the new size (full map work is W7).

## Files it touches

server/shared/world-gen.js (terrain), server/regions/*, public/js/map.js (scale only)

## Contracts

Contract §6 real `regionAt`

## Done when

- [ ] Walking off the Landing reaches the Veil (W5) or, with the Veil off for testing, all seven regions.
- [ ] Existing fires, lanterns and sacks on the Landing are where they were.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

---
id: W4
title: The 5 km world shape
lane: world
owner: thaqif
status: done
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

- [x] Walking off the Landing reaches the Veil (W5) or, with the Veil off for testing, all seven regions.
- [x] Existing fires, lanterns and sacks on the Landing are where they were.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done, behind flag `bigworld` (with `streaming`). Changed from the plan: the Landing stays at the origin and the world is laid out north of it (moving the Landing would have moved every saved thing on it). Six regions with their own height profiles (Stairs terraces, Wood hills, Mire pools, Hollow crater, Teeth to ~600 m, Ashen Shore volcano), warped borders, a neck to the Landing, two river valleys (lowlands only: game water is sea level). Real `regionAt`, region biomes and placeholder spawn tables. Chunk ids widened to ±5 km (no chunk rows existed yet). Map covers the world; terrain rebuilds when the flag arrives. Hidden Pages section flag-gated. Tests: the Landing's objects, lanterns, carving stones and spawn are identical with the flag on (both islands), all 77,854 Landing land points at 1 m keep their exact height, heights everywhere unchanged with the flag off; in a browser at the Stairs (126 m), Wood and Teeth (490 m) streamed objects are drawn and the drawn ground matches; all 187 checks pass with the flags off. Minimap zoom left for W7.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

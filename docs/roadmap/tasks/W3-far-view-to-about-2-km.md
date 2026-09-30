---
id: W3
title: Far view to about 2 km
lane: world
owner: thaqif
status: todo
depends: [F2]
flag: farview
size: 1–2 sessions
---
# W3: Far view to about 2 km

See mountains and giant trees on the horizon.

## Scope

- A low-detail terrain ring out to ~2 km around the player, built from `heightAt` at coarse resolution.
- Longer camera range and an ink-outline pass that still works at long distances (depth precision).
- The sea follows the player. Haze colour blends the far ring into the sky.
- Automatic phone quality: shorter ring and fewer details on coarse pointers or low frame rates.
- With `bigworld` on, the ground rises to about 600 m and `heightAt` costs about twice as much (about 5 microseconds a call); check terrain build time on a phone.

## Files it touches

public/js/renderer.js, ink.js, terrain.js, sky.js

## Contracts

The look for W4

## Done when

- [ ] 30+ fps on a mid-range phone at the Landing.
- [ ] No outline flicker on far terrain.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

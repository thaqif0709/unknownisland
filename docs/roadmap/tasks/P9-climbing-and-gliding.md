---
id: P9
title: Climbing and gliding
lane: player
owner: edvin
status: todo
depends: [F5]
flag: travel
size: 1–2 sessions
---
# P9: Climbing and gliding

Climb vines, giant trunks and cliffs; glide down with your cloak.

## Scope

- Climb state using `WG.climbAt` (CONTRACTS.md §12): W/S to climb, Space to let go, energy drain, slide down when empty.
- Cloak glide: hold Space in the air after a jump from height; slow fall, forward drift, energy.
- Server movement checks allow climbing and gliding speeds.
- Test surfaces on the Landing: mark some palms and a cliff climbable.

## Files it touches

public/js/jumping.js (movement), public/js/castaways.js (poses), server/systems/players.js (checks), server/shared/world-gen.js (climbAt)

## Contracts

Real `climbAt` for trees and slopes

## Done when

- [ ] Friends see you climbing and gliding.
- [ ] Hidden Pages: moving section and controls.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

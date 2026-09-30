---
id: P9
title: Climbing and gliding
lane: player
owner: edvin
status: review
depends: [F2, F5]
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

- [x] Friends see you climbing and gliding.
- [x] Hidden Pages: moving section and controls.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 edvin: built behind `travel` (off). `WG.climbAt`/`slopeAt` and the climbable palms (world-gen), `public/js/385-climbing.js` with hooks in `380-jumping.js` and `390-loop.js`, `poseTravel` in `120-castaways.js`, the server's glide speed, pose and energy in `players.js` (and the pose in world.js's snapshot); `100-plants-and-rocks.js` keeps each object's `climb` mark. Tests: 5 server, 2 browser. Waiting on a try by hand (`FEATURES=travel`), mainly how cliffs feel now they can't be walked up; then the flag goes on and this is done.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

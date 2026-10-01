---
id: C4
title: Region pack: The Weeping Wood
lane: content
owner: edvin
status: doing
depends: [W5, W8, W9, P3, P9]
flag: region-wood
size: 2–3 sessions
---
# C4: Region pack: The Weeping Wood

Everything for the Weeping Wood.

## Scope

- Giant 60–90 m trees with climbable vines, leaf roof, walkways, rain and mist, waterfalls.
- Hardwood, resin, vine rope, strange fruit, giant leaves, amber, lantern beetle, glasswing, bark mantis, catfish, glass carp; bow, resin torches, leaf glider.
- The Hung.
- Root hollow caves.
- A 5-request chain.
- The Hanging Mother (needs C0).
- Journal and Hidden Pages.

## Files it touches

server/regions/wood.js, new mob and boss files, server/content/*

## Done when

- [x] Playable from opening to beating the Hanging Mother, which opens the Mire.
- [ ] Holds 30 fps on a mid-range phone (thinner undergrowth).
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
- 2026-10-01 edvin: first half, behind `region-wood` (off): the giants (climbable, hardwood
  by axe), resin, vines, fruit, giant leaves, amber; bow and arrows, resin torches, leaf
  glider; river fish; three bugs; the Hung; the root hollow; the 5-request chain; the Hanging
  Mother (opens the Mire). Still to do: walkways, rain and mist, waterfalls; and checking
  30 fps on a phone (can't be measured here).

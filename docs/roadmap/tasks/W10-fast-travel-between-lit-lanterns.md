---
id: W10
title: Fast travel between lit lanterns
lane: world
owner: thaqif
status: done
depends: [F2, F5]
flag: fasttravel
size: ½ session
---
# W10: Fast travel between lit lanterns

Step into a lit lantern's light and travel to another lit lantern, paying oil.

## Scope

- A lantern travel panel listing lit lanterns you have visited; oil cost by distance.

## Files it touches

server/systems/lanterns.js, public/js/lanterns.js

## Done when

- [x] Travel works only between lit lanterns and costs oil.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Notes

Kept (Thaqif, 1 Oct). You remember a lantern by standing in its light; both ends must be lit.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 thaqif: done behind `fasttravel` (server/systems/lanterntravel.js, public/js/265-lantern-travel.js, tests).

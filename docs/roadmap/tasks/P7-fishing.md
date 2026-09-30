---
id: P7
title: Fishing
lane: player
owner: edvin
status: todo
depends: [P2]
flag: fishing
size: 1–2 sessions
---
# P7: Fishing

Cast, wait, hook, land a fish with a minigame, cook it, and fill a fish page in the journal.

## Scope

- Rod recipe, bait items, casting (hold E to charge), bobber, bite timing by time, weather, tide and moon, hook within 1 s.
- Fish tables by water type (sea, spring, river, swamp, ice), region, time and bait, in `server/content/fish.js`.
- Calls `island.minigames.start` (P8) by rarity; line snaps on a loss.
- Cooking fish on fires, fish journal entries, reeling pose visible to others, friends can help (+1 s once).

## Files it touches

new server/systems/fishing.js, new server/content/fish.js, new public/js/fishing.js

## Done when

- [ ] You can catch every Landing fish.
- [ ] Hidden Pages: fishing section (rare fish in spoilers).
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Notes

Can start before P8 lands by calling a stub minigame that always wins.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

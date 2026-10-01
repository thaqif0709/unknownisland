---
id: C6
title: Region pack: The Teeth
lane: content
owner: edvin
status: doing
depends: [W5, W8, W9, P3, P9]
flag: region-teeth
size: 2–3 sessions
---
# C6: Region pack: The Teeth

Everything for the Teeth.

## Scope

- Peaks to 600 m, cliffs, snowfields, blizzards, frozen waterfalls.
- Warmth stat (fire, hood, fur cloak).
- Ice, crystal, pine resin, hare fur, silver tier; snow moth, ice louse; ice char through ice holes.
- The Frozen.
- Ice caves and deep caverns.
- A 5-request chain.
- The White Ram (needs C0).
- Journal and Hidden Pages.

## Files it touches

server/regions/teeth.js, new server/systems/warmth.js, new mob and boss files

## Done when

- [x] Playable from opening to beating the Ram, which opens the Ashen Shore.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
- 2026-10-01 edvin: first half, behind `region-teeth` (off): snow above 260 m, warmth
  (`server/systems/warmth.js`), ice, crystal, pine resin, hare fur, silver, ice holes and the
  ice char; fur cloak, silver sword, pine torches; two bugs; blizzards and the Frozen; the ice
  cave; the 5-request chain; the White Ram (opens the Ashen Shore). Still to do: frozen
  waterfalls, deep caverns, crystal lamps, avalanches.

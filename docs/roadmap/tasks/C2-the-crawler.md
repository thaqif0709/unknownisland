---
id: C2
title: The Crawler
lane: content
owner: thaqif
status: done
depends: [P5, W9]
flag: caves
size: 1 session
---
# C2: The Crawler

The cave creature (DESIGN.md §8).

## Scope

- 3× Stilled size, long limbs, crawls on walls and ceilings, hunts by sound, scream (dread burst, screen shake), avoids light, flees fire, can't cross water, knockdown plus drag.
- Placeholder scream until Thaqif's clips arrive in `public/sfx/crawler/`.

## Files it touches

new server/mobs/crawler.js (and in the KINDS list), new public/js/mobs/crawler.js, public/sfx/crawler/ (README; clips and list.json to come), `lair` on cave descriptions, `lastChatAt` in chat.js, audio types in server/index.js

## Done when

- [x] It lives in the Landing sea cave.
- [x] Hidden Pages entry in a spoiler box.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Notes

Needs sound clips from Thaqif (1–3 s, .ogg or .mp3, licence allows use).

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-09-30 thaqif: done behind `caves` (on live, so it's in the sea cave now). It lurks on the
roof deep in the cave and moves along the cave's nodes; hunts by sound (running 25 m, calls
60 m, chat 30 m, anyone within 5 m); screams (dread, a shake, the sound; at most every 20 s);
a warned lunge (a line, 0.8 s) knocks you down and drags you ~8 m deeper; a lit torch within
4.5 m drives it back; it won't cross water and clings to the roof when the tide is in; back
the day after it's killed. Placeholder screech until clips arrive (public/sfx/crawler/).
`tests/server/crawler.test.js` (5: on the roof deep inside; hears running, screams, lunges
after the warning and drags you deeper; a torch drives it back; nobody on the beach
interests it; it won't cross the flooded dip even when it hears you). Browser: seen hanging
from the roof, screams when you call, comes down and lunges, no page errors.

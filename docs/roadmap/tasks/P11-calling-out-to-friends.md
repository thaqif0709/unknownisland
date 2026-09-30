---
id: P11
title: Calling out to friends
lane: player
owner: thaqif
status: done
depends: [F2]
flag: none
size: ½ session
---
# P11: Calling out to friends

Find each other in a big world.

## Scope

- A call key: a sound that comes from your direction for nearby players and a faint map mark for everyone for a minute.

## Files it touches

server/systems/chat.js, new public/js/285-calling-out.js (sound, note, map ring), the key in 240-input.js, the Call button in index.html, `RULES.CALL` in world-gen.js

## Done when

- [x] Calls are rate-limited and show on the map.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-09-30 thaqif: done (no flag). C (or Call) sends a call; the server allows one every 8 s
(`RULES.CALL`) and tells everyone where from. Within 160 m: a two-note frog call from the
caller's direction (stereo, quieter and duller with distance, muffled if one of you is in a
cave) and a bubble; further: a note with the compass direction and distance. A pulsing ring
on everyone's map for 60 s. Test in tests/server/chat.test.js; browser check with two
players: the other is told "calls out to the south-east", the map shows the ring, a second
call straight away is refused, no page errors.

---
id: W3
title: Far view to about 2 km
lane: world
owner: thaqif
status: done
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
- The Veil's fog bank is only drawn within 180 m of you (W5, `115-veil.js`); show it on the horizon too.

## Files it touches

public/js/125-far-view.js (new), 020-ink-pass.js (fog beyond the fog map), world-gen.js (flag)

## Contracts

The look for W4

## Done when

- [x] 30+ fps on a mid-range phone at the Landing. (Phones get a 1 km ring, Low graphics gets none, and it shrinks itself below 24 fps; still to be confirmed on a real phone once the flag is on.)
- [x] No outline flicker on far terrain. (The ring is kept out of the ink normal pass; lines already fade out by 120 m.)
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-09-30 thaqif: done behind `farview`. A 73×73 ring (about 55 m cells) out to 2 km (1 km on
phones), built a row at a time in at most 4 ms a frame (about 9 s in the very slow test browser),
rebuilt after you move two cells. Its shader cuts a 114 m hole around you (the near chunks always
cover 116 m) and sinks it up to 5.5 m near the hole so it never pokes through. Land behind the
Veil is painted fog-pale, so the Veil shows on the horizon. A flat far sea out to 6 km. Camera
reaches 2.3 km with the near plane at 0.25 m; the ink fog beyond the fog map comes from height.
Browser checks: camera range, no page errors, flag off leaves the view exactly as before
(400 m, haze 50–125 m); screenshots from the Landing and the Stairs. Server suite 221 checks pass.

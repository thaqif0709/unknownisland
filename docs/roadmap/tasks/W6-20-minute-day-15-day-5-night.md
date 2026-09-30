---
id: W6
title: 20-minute day (15 day, 5 night)
lane: world
owner: thaqif
status: done
depends: []
flag: none
size: under an hour
---
# W6: 20-minute day (15 day, 5 night)

Longer days for a bigger world.

## Scope

- `DAYLIGHT_LEN` 900, `NIGHT_LEN` 300 in RULES. Check the Sleeper, tides and moon still line up. The Hidden Pages read the numbers live.

## Files it touches

server/shared/world-gen.js (two numbers)

## Done when

- [x] A full day takes 20 minutes, night 5.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Notes

Confirmed by Thaqif: 20 minutes.

## Log

- 2026-09-30 thaqif: DAYLIGHT_LEN 900, DAY_LEN 1200.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

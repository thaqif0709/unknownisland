---
id: C1
title: The Tidewife (the Landing's boss)
lane: content
owner: edvin
status: done
depends: [C0]
flag: bosses
size: 1 session
---
# C1: The Tidewife (the Landing's boss)

The first boss. Beating her opens the Stairs.

## Scope

- Model and animations, two phases, barnacle-eye weak spots, thrown wreckage, fire burning her kelp, leaving when the tide turns, shell patch and eye relic (DESIGN.md §10).

## Files it touches

new server/bosses/tidewife.js, new public/js/mobs/tidewife.js, server/content/journal.js

## Done when

- [x] Playable alone and with 2–4 frogs.
- [x] Hidden Pages: boss section in a spoiler box.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->
2026-10-01 edvin: the Tidewife (server/bosses/tidewife.js, public/js/mobs/tidewife.js): lowest tide on the east sand, leaves when the tide turns, kelp burned by fire, shell, barnacle eyes while she rears, claw, thrown wreckage, crash, two phases; eye relic and shell patch (tide_shell); the Landing's region file names her and beating her opens the Stairs. Behind `bosses` (on); the Landing's chain (Thaqif's `chains` flag) is what calls her in play, admins with `/boss tidewife`. Tests: tests/server/tidewife.test.js (6, incl. four frogs), tests/browser/tidewife.test.js.

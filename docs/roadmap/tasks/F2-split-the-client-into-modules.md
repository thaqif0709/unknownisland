---
id: F2
title: Split the client into modules
lane: foundations
owner: edvin
status: todo
depends: []
flag: none
size: 1–2 sessions
---
# F2: Split the client into modules

Break the 3,600-line `public/game.js` into files so both of you can change the client at once.

## Scope

- Move each `// =====` section into `public/js/<name>.js` (renderer, ink, terrain, clouds, plants, castaways, stilled, fires, lanterns, tides, bugs, carvings, board, state, screens, join, actions, input, journal, chat, map, book-settings, sky, dread, cutscene, jumping, loop).
- Load them in order from `index.html` as plain scripts sharing `window.UI` (CONTRACTS.md §3). No bundler.
- Add `UI.net.on(type, fn)` for server messages and `UI.onFrame(fn)` for per-frame updates, and a `UI.panels` registry that wraps the existing panel open/close code.
- Keep the `?debug` `__dbg` hooks working.
- Move only. No behaviour changes.

## Files it touches

public/game.js, public/index.html, new public/js/*

## Contracts

Contract §3 (client modules), the `UI.panels` base for §7

## Done when

- [ ] The game looks and plays exactly as before on desktop and phone.
- [ ] No file in `public/js/` is over ~600 lines.
- [ ] HANDOFF.md describes the new layout.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Notes

Runs at the same time as F1 (different files). Nothing else merges on the client until this lands.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

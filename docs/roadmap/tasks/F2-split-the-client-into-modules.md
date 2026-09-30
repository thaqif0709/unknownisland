---
id: F2
title: Split the client into modules
lane: foundations
owner: thaqif
status: done
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

- [x] The game looks and plays exactly as before on desktop and phone.
- [x] No file in `public/js/` is over ~600 lines.
- [x] HANDOFF.md describes the new layout.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Notes

Runs at the same time as F1 (different files). Nothing else merges on the client until this lands.

## Log

- 2026-09-30 thaqif: done. Changed from the plan: the parts share one scope (joined on the server into the same /game.js, with a source map) instead of each being a separate script talking through `window.UI`. game.js is one closure with hundreds of shared variables, so separate scripts would have meant rewriting most lines; this way the split is a pure move (the joined file was checked byte-for-byte against the old game.js) and the only new code is the three hooks: `UI.net.on`, `UI.onFrame`, `UI.panels.register`. 41 parts, the biggest 315 lines. Tests: served file identical, 7 hook checks in the browser, smoke test, 187 server checks.
- 2026-09-30: taken over by thaqif so the World lane isn't blocked (Edvin: don't start this one).
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

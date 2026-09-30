---
id: P8
title: Minigames and trivia
lane: player
owner: edvin
status: done
depends: [F1, F2]
flag: fishing
size: 1–2 sessions
---
# P8: Minigames and trivia

Five short games the server sets and checks, used to land fish.

## Scope

- Framework: `island.minigames.start` and `UI.minigames.register` (CONTRACTS.md §13); the server keeps answers and deadlines.
- Island trivia (a `fishing_trivia` table editable in Neon, seeded with ~40 questions about fires, tides, bugs, the Stilled, the carvings).
- Untangle the line (3×3 to 5×5), ripple memory (carving symbols), pull and ease, read the water.
- All tap-friendly and fitting above the hotbar.

## Files it touches

new server/systems/minigames.js, new server/content/trivia.js, new public/js/minigames/*, new migration

## Contracts

Contract §13

## Done when

- [x] Each game can be launched from debug and is checked on the server.
- [x] Wrong or late answers lose.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 edvin: done. `server/minigames/` (engine + 5 games), `server/shared/minigame-sim.js` (pull physics and the untangle check, shared with the page), `fishing_trivia` (migration 0008, 40 questions), `public/js/285-minigames.js` + `public/js/minigames/`. "Debug" is the admin `/minigame` command. Also touched: world.js (constructor), store.js (seed and load trivia), chat.js (`/minigame`), index.html (loads the sim, styles). The Hidden Pages section waits behind `fishing` (off until P7). Tests: 10 server, 6 browser.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

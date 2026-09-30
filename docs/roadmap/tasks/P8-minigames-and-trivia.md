---
id: P8
title: Minigames and trivia
lane: player
owner: edvin
status: todo
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

- [ ] Each game can be launched from debug and is checked on the server.
- [ ] Wrong or late answers lose.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

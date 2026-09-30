# Roadmap: The Wider Island

Growing Unknown Island into a 5 km world with regions opened by the Sleeper, caves,
fighting, bosses, fishing and a proper inventory. Built by **Thaqif** and **Edvin** at the
same time.

- [DESIGN.md](DESIGN.md): what we're building (every decision from the planning page).
- [CONTRACTS.md](CONTRACTS.md): the interfaces between the parts, so neither of you waits on the other.
- [tasks/](tasks/): one file per task, with its owner, status and dependencies.
- `npm run roadmap`: prints the board. `npm run roadmap -- edvin` for one person,
  `-- --ready` for what can start now, `-- --check` to validate the files.

## How the work is split

Four lanes. Each lane mostly owns its own files, so two people rarely edit the same one.

| Lane | What | Default owner |
|---|---|---|
| **F** Foundations | Split the big files, feature flags, migrations, tests, contract stubs | both, first |
| **W** World | Streaming, far view, the 5 km terrain, the Veil, map, Sleeper chains, caves | Thaqif |
| **P** Player | Mouse-look, inventory, tools, enemies, fighting, fishing, minigames, climbing, rafts | Edvin |
| **C** Content | The boss system, then one pack per region (terrain, resources, Stilled, cave, chain, boss) | alternating |

Owners are proposals: change the `owner:` line in a task file if you swap.

### Why the Foundations come first

Before the Foundations, `public/game.js` (3,700 lines) and `server/world.js` (1,200 lines) held almost
everything, so any two features collided there. F1 and F2 split them into one file per
feature, and F5 puts every cross-lane interface in place as a stub. After that, most tasks
only add new files or touch their own lane's files.

### Waves

Tasks in the same row run at the same time. A task can start as soon as its
dependencies are `done`, so the waves are only a guide.

| Wave | Thaqif | Edvin |
|---|---|---|
| 0 | F1 split the server → F3 flags and migrations → F5 contract stubs → F2 split the client | F4 tests (after F2) |
| 1 | W1 objects from the seed · W8 Sleeper chains · W3 far view | P1 mouse-look · P8 minigames · P5 enemy framework |
| 2 | W2 near-players only · W4 the 5 km shape · P4 checkpoints | P2 inventory → P3 tools · P9 climbing and gliding |
| 3 | W5 the Veil · W7 big map · W9 caves · P11 calling out | P6 fighting · P7 fishing · P10 rafts and zip lines |
| 4 | C2 the Crawler · C3 the Stairs | C0 boss system → C1 the Tidewife |
| 5+ | C5 the Mire → C7 the Ashen Shore → C9 the Hollow | C4 the Weeping Wood → C6 the Teeth → C8 the Deep |

In wave 0, F1 and F2 are big file moves. Merge nothing else until both land, then both
of you pull `main` straight away.

### Dependencies that can't be avoided

- Everything needs **F1/F2** (the split) and most things **F5** (the stubs, server-side only, so it didn't wait for F2).
- **W1 → W2 → W4 → W5**: the world has to stream before it can grow, and grow before it can be locked.
- **P2 → P3 → P6**: fighting needs weapons, weapons need slots.
- **P5 → P6 → C0 → bosses**: every boss needs enemies and fighting.
- **Region packs** need W5 (the Veil), W8 (chains), W9 (caves) and P3 (tools). The Wood and the
  Teeth also need P9 (climbing); the Mire needs P10 (rafts). Each pack's boss needs C0, so build it last.

Everything else codes against the stubs in CONTRACTS.md and doesn't wait.

## Working on a task

1. `git pull` on `main`, then run `npm run roadmap -- --ready` and pick a task you own.
2. On your branch, set `status: doing` in the task file as your first commit, so the other person sees it on the board.
3. Build it behind its feature flag (`flag:` in the task file). Merging half-done work to
   `main` is fine while the flag is off, because `main` deploys to Render straight away.
4. PR title starts with the task id: `P2: slot inventory, server side`.
5. In the PR that finishes it: tick the "Done when" boxes, set `status: done`, add a
   line to the task's Log, turn the flag on, and update the Hidden Pages (and its changelog),
   HANDOFF.md and README.md as CLAUDE.md requires.
6. Stuck on a missing contract? Don't reach into the other lane's files. Add a note to your
   task's Log and ask, or extend the stub in CONTRACTS.md in a small separate PR.

Statuses: `todo`, `doing`, `review` (PR open), `done`, `on-hold` (waiting on a decision).

### Files you'll both touch (and how to avoid trouble)

| File | Rule |
|---|---|
| `server/shared/world-gen.js` | Add your feature's rules as its own block (`RULES.COMBAT`, `RULES.FISHING`...) and items in one run per feature. Don't reorder or reformat other blocks. |
| `public/hiddenpages.html` | Changelog lines at the top will conflict; keep both lines when merging. |
| `public/index.html` | Panels and HUD pieces in their own clearly commented blocks. |
| Migrations | One file each, numbered; renumber if both of you took the same number. |
| `docs/HANDOFF.md` | One heading per system; edit only your system's section. |

## Decisions still open

- Fast travel: keep or cut (W10, on hold).
- The Hollow and the ending: waiting on the story plan (C9).
- Crawler screams: Thaqif is finding clips (C2 uses a placeholder until then).

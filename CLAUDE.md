# Unknown Island: notes for anyone changing the game

## Keep the Hidden Pages current (required)
`public/hiddenpages.html` (served at `/hiddenpages`; `/wiki` redirects there) is the
player-facing wiki of the whole game, called the Hidden Pages.
Every time a feature is added or changed, in the same commit:
- update the matching section of `public/hiddenpages.html` (add a section for new systems,
  and the controls table for new keys), and
- add a line at the top of its Changelog.
Anything that gives away a discovery (rare finds, strange events, what hidden systems
do) goes inside a `<details class="spoiler">` box so it's hidden until clicked.
Numbers there are read live from `server/shared/world-gen.js` (`data-r="RULE.PATH"`)
and `/api/hiddenpages` (journal, tide, carving requests), so prefer wiring new numbers the
same way instead of typing them in.

Also keep `docs/HANDOFF.md` (design notes for developers) and `README.md` in step.

## The roadmap and tasks (two people work at once)
The big expansion is planned in `docs/roadmap/`: `DESIGN.md` (decisions), `CONTRACTS.md`
(interfaces between lanes) and one file per task in `docs/roadmap/tasks/`.
- Before starting, read the task file and the contracts it names. Run `npm run roadmap`
  to see the board and what is ready.
- Set the task's `status:` to `doing` in the first commit on the branch, and to `done`
  (with its "Done when" boxes ticked and a Log line) in the PR that finishes it.
- Stay in the task's files. Don't edit another lane's files to get around a missing
  contract; extend the stub in `CONTRACTS.md` in a small PR both people see.
- Build behind the task's feature flag (`RULES.FEATURES`), because `main` deploys to Render
  as soon as it merges.
- If a design decision changes, update `DESIGN.md` in the same PR.
- `npm run roadmap -- --check` must pass.

# Unknown Island: notes for anyone changing the game

## Keep the wiki current (required)
`public/wiki.html` (served at `/wiki`) is the player-facing wiki of the whole game.
Every time a feature is added or changed, in the same commit:
- update the matching section of `public/wiki.html` (add a section for new systems,
  and the controls table for new keys), and
- add a line at the top of its Changelog.
Anything that gives away a discovery (rare finds, strange events, what hidden systems
do) goes inside a `<details class="spoiler">` box so it's hidden until clicked.
Numbers there are read live from `server/shared/world-gen.js` (`data-r="RULE.PATH"`)
and `/api/wiki` (journal, tide, carving requests), so prefer wiring new numbers the
same way instead of typing them in.

Also keep `docs/HANDOFF.md` (design notes for developers) and `README.md` in step.

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

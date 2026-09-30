---
id: P6
title: Fighting
lane: player
owner: edvin
status: todo
depends: [P1, P3, P5]
flag: combat
size: 2 sessions
---
# P6: Fighting

Swords, spears, clubs and slings; attacks, heavy swings, dodging, being knocked down and picked up.

## Scope

- Weapons as items (sword tiers wooden→obsidian with a 3-hit combo, spear, club, sling with stones) with stats in `RULES.COMBAT`.
- Left click attack at the crosshair, hold for heavy; server hit check (cone, reach, cooldown, ~150 ms lag leeway).
- Double-tap Shift dodge roll (~0.35 s untouchable, energy); swipe on the Attack button on phones.
- Downed state: friends revive within 20 s by holding E; otherwise wake at `respawnPoint`.
- Light as a weapon; the Stilled break into fog and re-form later.

## Files it touches

new server/systems/combat.js, new public/js/combat.js, public/js/castaways.js (swing, roll poses), server/shared/world-gen.js (RULES.COMBAT, ITEMS)

## Contracts

Contract §9

## Done when

- [ ] Two players can fight the Landing Stilled together and revive each other.
- [ ] Hidden Pages: fighting section and controls.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

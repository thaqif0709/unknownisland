---
id: P1
title: Mouse-look, crosshair and cursor
lane: player
owner: edvin
status: todo
depends: [F2]
flag: mouselook
size: 1 session
---
# P1: Mouse-look, crosshair and cursor

The mouse turns the camera, a crosshair shows what you're aiming at, and menus give you a cursor.

## Scope

- Pointer lock on click; Esc frees it and opens settings; "Click to continue" when the browser blocks re-locking.
- Ink crosshair that changes over usable and hittable things.
- Any open panel frees the pointer and shows an ink cursor (build on `UI.panels`, CONTRACTS.md §7).
- Mouse wheel cycles hotbar slots. Sensitivity and invert-Y settings apply. Phones unchanged.

## Files it touches

public/js/input.js, public/js/panels.js, public/index.html (crosshair, cursor CSS)

## Contracts

Contract §7

## Done when

- [ ] Works in Chrome, Firefox and Safari on desktop; phones unchanged.
- [ ] Every existing panel shows the cursor.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

---
id: F1
title: Split the server into feature modules
lane: foundations
owner: thaqif
status: done
depends: []
flag: none
size: 1 session
---
# F1: Split the server into feature modules

Make `server/world.js` small enough that two people can work on the server without touching the same file.

## Scope

- Move each section of `server/world.js` (tides, bugs, moon and weather, time, chat, board, patches, Stilled, lanterns, buckets, fires, gathering) into `server/systems/<name>.js`, plugged in like `sleeper.js` is today.
- Move `server/sleeper.js` to `server/systems/sleeper.js`.
- Replace the `switch (msg.t)` in `onMessage` with the message registry from CONTRACTS.md §2, with a start-up check for duplicate names.
- Split `server/content.js` into `server/content/<topic>.js` (CONTRACTS.md §15).
- Move only. No behaviour changes, no renames beyond what the move needs.

## Files it touches

server/world.js, server/sleeper.js, server/content.js, new server/systems/*, server/content/*

## Contracts

Contract §2 (server modules and message registry), §15 (content files)

## Done when

- [x] The game plays exactly as before (all current tests pass).
- [x] `server/world.js` holds only the Island core (under ~400 lines).
- [x] HANDOFF.md describes the new layout.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Notes

Do this before any feature work on the server. Tell Edvin before merging so he can pull it in straight away.

## Log

- 2026-09-30 thaqif: done. world.js is 213 lines; 17 systems in server/systems/, content in server/content/. Same 124 server checks pass before and after; browser smoke test clean. No Hidden Pages change (nothing players can see).
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

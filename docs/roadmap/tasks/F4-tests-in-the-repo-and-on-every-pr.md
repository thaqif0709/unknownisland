---
id: F4
title: Tests in the repo and on every PR
lane: foundations
owner: edvin
status: done
depends: [F2]
flag: none
size: 1 session
---
# F4: Tests in the repo and on every PR

Both of you (and Claude sessions) can check a change before merging, and GitHub checks every PR.

## Scope

- Bring the local test scripts into `tests/`: server tests over WebSocket (join, move, gather, build, lanterns, tides, Sleeper, buckets, chat) with `node:test`, and browser smoke tests with Playwright (loads, no errors, cutscene skip, jump, sit).
- `npm test` runs the server tests against `TEST_DATABASE_URL`; `npm run test:browser` runs the browser ones.
- A GitHub Actions workflow runs `npm test` with a Postgres service on every PR.
- Document how to run them in README.md.

## Files it touches

new tests/*, package.json, new .github/workflows/test.yml, README.md

## Contracts

`npm test` for every later task

## Done when

- [x] `npm test` passes locally and in GitHub Actions.
- [x] The time-of-day setup (midday, clear) is built into the tests so the Stilled don't interfere.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 edvin: tests in `tests/` (35 server checks in 9 files over WebSocket, 4 browser smoke checks), `npm test` / `npm run test:browser`, and the workflow. Passes locally on memory and on Postgres 16 (also run again on the same database); waiting on the first GitHub Actions run to tick the last box and set `done`. Hidden Pages unchanged (nothing players see). Setup goes through a test-only preload (`tests/helpers/test-hooks.js`) instead of test code in the server.
- 2026-09-30 edvin: done (thaqif0709/unknownisland#8). The first GitHub Actions run passed.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

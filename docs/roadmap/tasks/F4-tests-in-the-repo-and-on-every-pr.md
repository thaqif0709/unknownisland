---
id: F4
title: Tests in the repo and on every PR
lane: foundations
owner: edvin
status: todo
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

- [ ] `npm test` passes locally and in GitHub Actions.
- [ ] The time-of-day setup (midday, clear) is built into the tests so the Stilled don't interfere.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

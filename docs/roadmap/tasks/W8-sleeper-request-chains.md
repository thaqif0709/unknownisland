---
id: W8
title: Sleeper request chains
lane: world
owner: thaqif
status: todo
depends: [F5]
flag: chains
size: 1 session
---
# W8: Sleeper request chains

Each open region has a chain of 5 requests; finishing it calls the region's boss.

## Scope

- A `region` and `chain_order` on `sleeper_requests`; requests only come from open regions' chains, in order.
- The Landing's chain of 5, written from today's requests plus new ones.
- On the last one: `island.summonBoss(region)` (stub until C0) and a carving that names the time and place.
- Hidden Pages: chains explained, contents in spoilers.

## Files it touches

server/systems/sleeper.js, server/content/sleeper.js, new migration, public/hiddenpages.html

## Contracts

Calls contract §10

## Done when

- [ ] Answering 5 Landing requests calls the (stub) boss and logs it.
- [ ] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [ ] This file's `status` set to `done` in the PR that finishes it.

## Log

<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

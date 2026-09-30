---
id: W8
title: Sleeper request chains
lane: world
owner: thaqif
status: done
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

- [x] Answering 5 Landing requests calls the (stub) boss and logs it.
- [x] `npm test` passes; Hidden Pages, its changelog, HANDOFF.md and README.md updated where players or developers would notice.
- [x] This file's `status` set to `done` in the PR that finishes it.

## Log

- 2026-09-30 thaqif: done, behind flag `chains` (off: turn it on with the first boss, C1). Changed from the plan: the chain order lives in each region's file (`requests` in `server/regions/<id>.js`) instead of `region`/`chain_order` columns, so region packs never edit a shared table row; `sleeper_requests.in_pool` (migration 0002) keeps chain steps out of the random pool, so with the flag off nothing changes. Progress in `islands.chains`. The Landing's 5 steps are written (fires, stones, gathering, the east lantern, three lanterns), ending with the Tidewife's time and place. Hidden Pages section and changelog line are flag-gated (`data-feature`), so they appear when the flag goes on. 20 new checks plus the existing 152 pass. When turning it on: update README's Sleeper paragraph too.
<!-- Add a dated line per PR: 2026-10-02 edvin: first half merged (#12). -->

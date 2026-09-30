# Contracts between the lanes

These are the seams that let two people build at once. Each contract has an **owner task**
that builds the real thing and a **stub** that exists from the Foundations onward, so the
other lane can code against it before the real version lands.

Rule: **change a contract only in a PR both of you have seen.** Adding an optional field
is fine; renaming or changing meaning is not, without agreeing first.

---

## 1. Feature flags (F3, done)

Unfinished work can merge to `main` (which auto-deploys) without going live.

```js
// server/shared/world-gen.js: add your flag when the task starts
RULES.FEATURES = { slots: false, combat: false };
WG.feature('slots')   // true/false, the same answer on the server and in the browser
WG.features()         // { slots: false, combat: true } (the resolved set)
```

- On Render, the `FEATURES` env var overrides them: `FEATURES="slots,combat"` switches those
  on, `FEATURES="-slots"` switches one off. The server logs the flags that are on at
  start-up, and warns about names that aren't in `RULES.FEATURES` (typos).
- The server sends the resolved flags in the `welcome` message and `public/net.js` applies
  them, so the client never decides on its own.
- Hidden Pages text about a flagged feature goes in an element with
  `data-feature="name"` (a section, a spoiler box, a changelog `<li>`). It stays hidden
  until the flag is on (the page reads the flags from `/api/hiddenpages`).
- Each task names its flag. Flip it to `true` in `RULES.FEATURES` in the task's last PR.
  Once a feature has been on for a while, delete the flag and the `if`s.

## 2. Server feature modules and the message registry (F1)

`server/world.js` keeps only the Island core (loop, players, broadcast, persistence glue).
Every feature lives in `server/systems/<name>.js` (done in F1):

```js
// server/systems/fishing.js
module.exports = {
  messages: { cast(p, msg) {...}, reel(p, msg) {...} },   // msg.t -> handler, `this` is the Island
  onTick(dt) {...},            // optional, every tick after players are updated, before the snapshot
  onDawn(sunrises) {...},      // optional, after the Sleeper and the tide at sunrise
  onJoin(p) {...},             // optional, extra state for the join message
  methods: { ... },            // optional, mixed into Island.prototype
};
```

`onMessage` looks up `msg.t` in the merged registry instead of one big `switch`.
Two modules may not register the same message name or define the same method name
(both checked at start-up, so a clash fails loudly instead of silently overwriting).
Add a new module's name to `SYSTEMS` in `server/world.js`. Shared helpers (`r2`, `num`,
`REACH_SLACK`...) are in `server/systems/util.js`.

## 3. Client feature modules (F2)

`public/game.js` is split into files under `public/js/` loaded in order by `index.html`,
sharing one namespace `window.UI` (renderer, scene, camera, state, helpers). A feature
file registers:

```js
UI.net.on('fish-bite', msg => {...});   // server message handlers
UI.onFrame(dt => {...});                 // per-frame update
UI.panels.register('inventory', {...});  // panels (see 7)
```

## 4. Items and inventory (F5 done as a stub → P2 real)

Nothing outside `server/systems/inventory.js` touches `p.inv`, `p.tools` or `p.buckets`
directly (F5 moved every other use onto these). `this` is the Island:

```js
this.give(p, key, n, meta?)  // -> number actually added (0 for an unknown item; the rest drops in a sack once slots are on)
this.take(p, key, n)         // -> true if removed (checks first; takes nothing otherwise)
this.count(p, key)           // -> total across all slots
this.held(p)                 // -> { key, meta } of the selected hotbar slot, or null
this.hasTool(p, id)          // tools become items in P3; callers don't change
this.addTool(p, id)
this.canAfford(p, cost) / this.spend(p, cost) / this.gain(p, items)   // cost/items = { key: n }
this.takeUpTo(p, key, n)     // -> how many were taken
this.takeShare(p, share)     // -> { key: n } taken (knockdowns)
this.clearItems(p)           // lose everything carried (tools and buckets stay)
this.loadInventory(row) / this.inventoryView(p) / this.inventorySave(p)   // join, client, database
```

Items are declared in `WG.ITEMS` with optional fields:

```js
ITEMS.sword_bronze = { name: 'Bronze sword', kind: 'weapon', stack: 1,
  durability: 150, damage: 14, reach: 1.9, swing: .45, knockback: 1.2 };
ITEMS.trout = { name: 'Mountain trout', kind: 'food', stack: 10, food: 22, cook: 'trout_cooked' };
```

Stub (F5): same functions over today's `p.inv` counts, so W and C lanes can use them now.

## 5. Things you use with E (F5 done)

What E does to each kind of world object is registered by the system that owns it,
instead of a case in one big `onAct`. A system exports `uses` next to its `messages`:

```js
// server/systems/<name>.js
const uses = {
  vent: { reach: 2, use(p, obj, { say, changed }) {   // `this` is the Island
    ...; say('It hisses.'); changed();                  // changed(): save the object and tell everyone
  } },
};
module.exports = { methods, messages, uses };
```

`reach` is optional (default `RULES.REACH`). The reach check, cooldown and "is it gone"
check happen before `use` is called. Two systems registering the same kind fail at
start-up. Today's kinds (palm, tree, bush, rock, ore, dig) are in `server/systems/gather.js`;
`this.useFor(kind)` returns the handler. Other E targets (fires, lanterns, sacks, bugs, tide
finds, carving stones) are separate lists with their own ids and are still routed in `onAct`.

## 6. Regions (F5 stub → W4 real, W5 opening)

```js
WG.regionAt(x, z)        // -> 'landing' | 'stair' | 'wood' | 'mire' | 'teeth' | 'ash' | 'hollow' | 'sea'
                         //    stub (F5): 'landing' on land, 'sea' below sea level
island.isRegionOpen(id)  // stub: only 'landing' (plus any opened since the server started)
island.openRegion(id)    // the Veil lifts at the next dawn. Stub: remembered in memory and
                         //    logged as a 'region_open' island event; W5 saves it properly
WG.REGIONS               // [{ id, name, stage }] in opening order
```

The stubs live in `server/systems/regions.js`. The island event log only keeps the last
60 events for loading, so W5 must store opened regions in their own table, not rely on it.

Region ids are fixed now: `landing stair wood mire teeth ash hollow`.
Content tasks put per-region data in `server/regions/<id>.js` (spawn tables, Stilled kind,
boss, requests), so two region packs never edit the same file.

## 7. Panels and the cursor (P1)

```js
UI.panels.register(name, { el, onOpen, onClose });
UI.panels.open(name) / close(name) / isOpen()
```

Any open panel frees the pointer and shows the cursor; closing the last one locks again.
New panels (inventory, minigames, carvings) register here and get this for free.

## 8. Mobs: the enemy framework (P5)

One framework for the Stilled kinds, the Crawler and bosses.

```js
// server/mobs/<kind>.js
module.exports = {
  kind: 'drowned', hp: 30, speed: 2.2, radius: .5,
  spawn: { region: 'mire', when: 'fog', near: 'water' },
  weak: { fire: 3, silver: 2 },              // damage multipliers by source tag
  states: { idle, stalk, windup, strike, recover, stagger },   // (mob, island, dt) -> next state
  onTouch(island, mob, p) {...},             // knockdown, drag, drain warmth...
};
island.mobs.spawn(kind, x, z, opts)
island.mobs.hit(mob, { amount, source: ['sword', 'silver'], from: p })
island.mobs.telegraph(mob, { shape: 'circle'|'line'|'cone', x, z, r, ms })   // drawn by the client
```

Clients get `mob` snapshots in the normal snapshot plus `telegraph` events. The client draws
mobs by `kind` from `public/js/mobs/<kind>.js`.

## 9. Combat hooks (P6)

```js
island.combat.damagePlayer(p, amount, { from, knock })   // -> downed state, revive, checkpoint
island.combat.onDowned(p) / onRevived(p)
```

## 10. Bosses (C0)

```js
// server/bosses/<id>.js: a mob definition plus
{ region: 'landing', appear: { when: 'lowest-tide', x, z }, arena: 40, phases: [...], trophy: { patch, relic } }
island.summonBoss(regionId)      // W8 calls this when a chain finishes; stub (F5) logs a 'boss_summoned' event
// On defeat the boss system sets island.chains[region].bossDay = island.day (that stops the
// stone's boss hint) and calls island.openRegion(nextRegion).
```

Where and when a boss appears is in its region file, which W8 already reads:
`bossHint: { stone: 'shore', text: 'At the lowest tide. The east sand.' }` (what the stone
says while the boss waits). A region's chain is `requests: ['key1', ...]` in the same file;
each key is a `sleeper_requests` row, written in `server/content/sleeper.js` with
`pool: false` so it's never picked at random.

## 11. Checkpoints (P4)

```js
p.checkpoint        // hearth id or null (players.checkpoint column)
island.respawnPoint(p)   // -> { x, z } used by knockdowns, bosses, caves. Stub (F5): the island's start
```

## 12. Climbing surfaces (P9)

World content marks climbable things; the movement code only asks:

```js
WG.climbAt(x, y, z)  // -> null or { normal, top } from objects with `climb: true` or cliff slopes. Stub (F5): always null
```

## 13. Minigames (P8)

```js
// server
island.minigames.start(p, type, { difficulty, seed, region }) // -> Promise<{ won }>
// client
UI.minigames.register(type, { open(puzzle, answer), close() })   // answer(payload) sends to server
```

The answer stays on the server. Fishing (P7) and future Sleeper requests use this.

## 14. Database migrations (F3, done)

Each change is its own file in `server/migrations/`:

- `NNNN-short-name.sql`: plain SQL, or
- `NNNN-short-name.js`: `module.exports = { async up(q) { await q('ALTER TABLE ...'); } }`.

Each runs once, in number order, in its own transaction, and is recorded in the
`migrations` table. A failing migration is rolled back and stops the server from starting,
with the file name in the error. `0001-baseline` is everything that existed before.
Take the next free number when you open the PR. If both of you took the same number, the
server refuses to start until one is renumbered (whoever merges second). Never edit a
migration that is already on `main`; add a new one.

Default content (journal, tide, Sleeper requests) is not a migration: `seedContent()` in
`server/store.js` inserts whatever is missing on every start.

## 15. Content data files

`server/content.js` is split into `server/content/<topic>.js` (journal, tide, bugs, sleeper,
fish, trivia...). Each still seeds its DB table once.

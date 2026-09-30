# Contracts between the lanes

These are the seams that let two people build at once. Each contract has an **owner task**
that builds the real thing and a **stub** that exists from the Foundations onward, so the
other lane can code against it before the real version lands.

Rule: **change a contract only in a PR both of you have seen.** Adding an optional field
is fine; renaming or changing meaning is not, without agreeing first.

---

## 1. Feature flags (F3)

Unfinished work can merge to `main` (which auto-deploys) without going live.

```js
// server/shared/world-gen.js
RULES.FEATURES = { streaming: false, slots: false, combat: false, ... };
// Render env var FEATURES="slots,combat" (or "-slots") overrides on the server,
// and the server sends the resolved flags to the client in the join message.
WG.feature('slots')   // true/false, works on server and client
```

Each task names its flag. Flip it on (in `RULES.FEATURES`) in the task's last PR.

## 2. Server feature modules and the message registry (F1)

`server/world.js` keeps only the Island core (loop, players, broadcast, persistence glue).
Every feature lives in `server/systems/<name>.js` and plugs in the same way `sleeper.js`
does today:

```js
// server/systems/fishing.js
module.exports = {
  messages: { cast(p, msg) {...}, reel(p, msg) {...} },   // msg.t -> handler, `this` is the Island
  onTick(dt) {...},            // optional, called every tick
  onDawn() {...},              // optional
  onJoin(p) {...},             // optional, extra state for the join message
  methods: { ... },            // optional, mixed into Island.prototype
};
```

`onMessage` looks up `msg.t` in the merged registry instead of one big `switch`.
Two modules may not register the same message name (checked at start-up).

## 3. Client feature modules (F2)

`public/game.js` is split into files under `public/js/` loaded in order by `index.html`,
sharing one namespace `window.UI` (renderer, scene, camera, state, helpers). A feature
file registers:

```js
UI.net.on('fish-bite', msg => {...});   // server message handlers
UI.onFrame(dt => {...});                 // per-frame update
UI.panels.register('inventory', {...});  // panels (see 7)
```

## 4. Items and inventory (F5 stub → P2 real)

Nothing outside the inventory module touches `p.inv` directly.

```js
this.give(p, key, n, meta?)  // -> number actually added (rest drops in a sack when slots are on)
this.take(p, key, n)         // -> true if removed (checks first)
this.count(p, key)           // -> total across all slots
this.held(p)                 // -> { key, meta } of the selected hotbar slot, or null
```

Items are declared in `WG.ITEMS` with optional fields:

```js
ITEMS.sword_bronze = { name: 'Bronze sword', kind: 'weapon', stack: 1,
  durability: 150, damage: 14, reach: 1.9, swing: .45, knockback: 1.2 };
ITEMS.trout = { name: 'Mountain trout', kind: 'food', stack: 10, food: 22, cook: 'trout_cooked' };
```

Stub (F5): same functions over today's `p.inv` counts, so W and C lanes can use them now.

## 5. Things you use with E (F5)

Objects register what happens on use instead of editing one `onAct`:

```js
WG.USE.register('vent', { reach: 2, use(island, p, obj, held) {...} });
```

## 6. Regions (F5 stub → W4 real, W5 opening)

```js
WG.regionAt(x, z)        // -> 'landing' | 'stair' | 'wood' | 'mire' | 'teeth' | 'ash' | 'hollow' | 'sea'
island.isRegionOpen(id)  // stub: only 'landing'
island.openRegion(id)    // records an island event; the Veil lifts at the next dawn
WG.REGIONS               // [{ id, name, stage }] in opening order
```

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
island.bosses.summon(regionId)   // W8 calls this when a chain finishes; stub logs an event
// On defeat the boss system calls island.openRegion(nextRegion).
```

## 11. Checkpoints (P4)

```js
p.checkpoint        // hearth id or null (players.checkpoint column)
island.respawnPoint(p)   // -> { x, z } used by knockdowns, bosses, caves
```

## 12. Climbing surfaces (P9)

World content marks climbable things; the movement code only asks:

```js
WG.climbAt(x, y, z)  // -> null or { normal, top } from objects with `climb: true` or cliff slopes
```

## 13. Minigames (P8)

```js
// server
island.minigames.start(p, type, { difficulty, seed, region }) // -> Promise<{ won }>
// client
UI.minigames.register(type, { open(puzzle, answer), close() })   // answer(payload) sends to server
```

The answer stays on the server. Fishing (P7) and future Sleeper requests use this.

## 14. Database migrations (F3)

Each change is its own file, `server/migrations/NNNN-short-name.sql` (or `.js`), run once in
order and recorded in a `migrations` table. Pick the next free number when you open the PR;
if both of you took the same number, the second to merge renumbers.

## 15. Content data files

`server/content.js` is split into `server/content/<topic>.js` (journal, tide, bugs, sleeper,
fish, trivia...). Each still seeds its DB table once.

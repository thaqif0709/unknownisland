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

## 3. Client parts and hooks (F2, done)

The browser code is in `public/js/NNN-name.js`, one file per part (renderer, terrain,
castaways, input, map, loop...). The server joins them in number order into the one
`/game.js` the page loads (`server/client-bundle.js`, re-read when a file changes), with a
source map so errors and the debugger show the real file and line.

- All parts share **one scope**, exactly as when they were one file: a part can use any
  function, and any `const`/`let` from a part numbered before it. (Function declarations
  work from anywhere; a `const` from a later part only works inside functions that run
  after loading.)
- `000-start.js` opens the scope and `999-end.js` closes it. Add a new part as a new file
  with a free number in the right place (numbers go up in tens, so there's room), e.g.
  `255-inventory.js`. Keep parts under ~600 lines.
- New features plug in through hooks instead of editing shared code:

```js
UI.net.on('fish-bite', m => {...});   // after the core has handled each message of that type
UI.onFrame(dt => {...});               // every frame, before drawing
UI.panels.register('inventory', { el, onOpen });   // Esc, closing and "a panel is open" include it
UI.panels.toggle(name) / UI.panels.close() / UI.panels.isOpen()
```

`UI.panels.register` must run from a part numbered after `240-input.js` (or inside a
function). `window.UI` is also handy in the browser console.

**Far view (W3, flag `farview`, `125-far-view.js`):** with it on, the camera reaches
`UI.farView.radius + 300` m (2 km ring on desktop, 1 km on coarse pointers, none on Low
graphics; it shrinks itself below 24 fps unless `UI.farView.lock`), the near plane is 0.25 m and
`scene.fog` runs from 160 m to the ring's edge. Anything that sets `camera.far` or `scene.fog`
should leave them alone while `WG.feature('farview')` is on (cutscenes are exempt: the far view
switches off while `Cut.on`). The ring is coarse and cut away within 114 m of you, so anything
that must look right up close still belongs in the chunks.

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

As built (P2, flag `slots`):

- `p.slots` is 38 entries: 0-7 the hotbar, 8-37 the bag. Each is `null`, `{ k, n }` (n of item k,
  1 to its stack size) or `{ b: id }` (one of `p.buckets`). `p.sel` is the hotbar slot in hand
  (-1 for none). `p.inv` is still there, as the totals (recounted after every change), so
  `count` and anything reading `stats.inv` in the browser keep working. Without the flag
  `p.slots` is undefined and everything works on the counts, as before.
- Buckets stay in `p.buckets` (buckets.js, crafting.js and drops.js change that list);
  `inventoryView` gives any new bucket a slot and clears the slots of ones that are gone.
- `give(p, key, n, { sack })` fills stacks of that item first, then empty slots, the hotbar
  first (so what you carry shows along the bottom, as before the bag). What doesn't fit goes in
  a sack at the player's feet with a toast, unless `sack: false` (then the caller keeps it, as
  picking up a sack does). It returns how many went into the slots.
- `take` empties the bag's last slots first and the one in hand last.
- `held(p)` is `{ key }` or `{ key: 'bucket', bucket: id }` from `p.slots[p.sel]`.
- New: `roomFor(p, key)`, `takeFromSlot(p, i, n)`, `moveSlots(p, from, to, count)`.
- Item details are `WG.ITEM_INFO` (with `WG.itemInfo(key)` filling in the stack size), not
  fields on `ITEMS`, whose values stay plain names: `{ kind: 'food', food, water, stack }`.
  Stacks default to `RULES.SLOTS.STACK` (50), food to `RULES.SLOTS.FOOD_STACK` (10).
- Messages: `move { from, to, count }` (to -1: across, bag <-> hotbar; always answered with
  `me`), `select { slot }`, `eat { slot }` (food only, at most every `RULES.SLOTS.EAT_GAP` s),
  and `dropitem { slot, count }` alongside the old `{ key, count }` / `{ bucket }`.
- **Everything you eat or drink from your hand works the same way:** hold E, a ring fills for
  `RULES.SLOTS.EAT_TIME`, and when it's full the count and the meter change right then (the
  browser shows it before the server answers); holding on has the next one. A new food only
  needs `ITEM_INFO` `{ kind: 'food', food, water }`. Anything else to consume (a new drink, a
  potion) goes through `consumable()` / `applyBite()` in `public/js/255-inventory.js`, and its
  server handler must count the request in `p.bites` and answer every request, refused or
  not, with `sendMe` (see `eat` in inventory.js and `drink` in buckets.js).
- `me` and `welcome.you` carry `slots` and `sel`. The saved inventory JSON gains `slots`.
  Loading lays the counts out again over the saved arrangement (so the counts always win, and
  switching the flag off and on loses nothing); anything that no longer fits goes in a sack at
  the player's feet when they join.

As built (P3, flag `tools`, needs `slots`):

- Tools are items: `ITEMS.shovel / pickaxe / axe / ironpick`, with `ITEM_INFO` `{ kind: 'tool',
  tool: 'axe' | 'pick' | 'shovel', returns }`; `WG.itemInfo(key)` adds `stack: 1` and `uses`
  (from `RULES.TOOLS.USES`). A tool's slot is `{ k, n: 1, d }`, `d` its uses left. It keeps
  `d` when moved, dropped (a sack holds `items.tools: [{ k, d }]`) and saved.
- `this.toolFor(p, job)` -> the key of the tool used for 'axe', 'pick' or 'shovel': the one in
  the player's hand with the flag, the best one owned without it; null for bare hands.
- `this.wearTool(p, key)` -> one use of the tool in hand; returns text for the toast (a
  warning at `RULES.TOOLS.WARN` of its uses, or that it broke and left one of `returns`).
- `this.repairTool(p, fire)` -> a lit hearth mends the worn tool in hand for
  `RULES.TOOLS.REPAIR` of its recipe; returns the message, or null if there's nothing to mend.
- `hasTool(p, id)` is true for a tool kept forever (`p.tools`, before P3) or one in the bag;
  `addTool` makes an item with the flag on. Owned tools in `p.tools` become items (once) when
  a player joins with the flag on. Tools are kept through knockdowns (`takeShare`) and death
  (`clearItems`).
- Weapons for P6 can be items the same way: `kind: 'weapon'`, `stack: 1`, uses in a `RULES` table,
  worn with `wearTool`.

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
                         //    real with the `bigworld` flag (W4); without it all land is 'landing'
island.isRegionOpen(id)  // the Landing always; others once the Veil has lifted (W5)
island.openRegion(id)    // the Veil lifts at the next dawn (regions_open table, a 'region_open'
                         //    event, a 'regions' message to everyone at dawn). Safe to repeat
island.veilAt(x, z)      // true on locked land (only with `bigworld` on; water never)
WG.REGIONS               // [{ id, name, stage }] in opening order
```

All in `server/systems/regions.js`. The server turns you around (`veil` message, +6 dread)
if a move would step onto locked land; the browser (`115-veil.js`) stops you first, turns
you round and draws the fog bank along locked borders within 180 m. `welcome.regions` and
`regions {open, lifted}` tell clients what's open. Admins (usernames in the `ADMINS` env var)
can type `/open <region>` in chat.

Region ids are fixed now: `landing stair wood mire teeth ash hollow`.

The 5 km ground (W4, flag `bigworld`, which needs `streaming` on too):
- `WG.heightAt` and `WG.biomeAt` give the big world when the flag is on. Near the Landing,
  any spot that was land (height 0.05 or more) keeps its exact old height; only water is
  filled in (the neck, the new coast).
- `WG.landingHeightAt` is the Landing's own ground, always. Anything that places the
  Landing's things (objects, lanterns, carving stones, the spawn point) must use it, or the
  Landing's object ids would shift.
- `WG.WORLD` lists each region's centre and size; `WG.RIVERS` the river lines. Borders
  between regions wander (the shapes are measured in warped space).
- Each region's `spawn` table is in its file; they're placeholders until its pack.
Content tasks put per-region data in `server/regions/<id>.js` (spawn tables, Stilled kind,
boss, requests), so two region packs never edit the same file.

## 7. Panels and the cursor (P1)

```js
UI.panels.register(name, { el, onOpen, onClose });
UI.panels.open(name) / close(name) / isOpen()
```

Any open panel frees the pointer and shows the cursor; closing the last one locks again.
New panels (inventory, minigames, carvings) register here and get this for free.

As built (P1, flag `mouselook`, `305-mouse-look.js`): `close()` with no name closes whatever
is open (one panel is open at a time); `close(name)` only if that one is open; `isOpen(name)`
asks about one, `isOpen()` about any (chat and the intro count as open too). `onClose` runs
whenever a panel closes, however it was closed. Only desktop mice lock (`(any-pointer: fine)`);
phones are unchanged. The browser may refuse to lock again without a click (always right
after Esc); then a "Click to continue" pill shows. With the flag on, the wheel cycles the
hotbar and Ctrl + wheel zooms.

Crosshair: it snaps onto `target` (what E would use). For things you can hit (P6), push a
function that says whether one is aimed at right now; the crosshair (otherwise hidden) shows,
in red, while any does:

```js
UI.crosshair.hittable.push(() => aimedMob != null);
```

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

As built (P5, done): the engine is `server/mobs/index.js` (`island.mobs`, made in the Island
constructor); a new kind is a file in `server/mobs/` added to the `KINDS` list there. Besides
`states` (each `(mob, island, dt, ctx) -> next state name or nothing`; `ctx` is `{ lights, now,
players }` with the living players not watching the intro), a kind can have `start` (first
state, default `idle`), `tick(island, dt, ctx)` once a tick for the whole kind (spawning,
fading), `touch` (a distance: `onTouch` runs for players that close, plus `radius`),
`onHit(island, mob, hit)`, `onDeath(island, mob, hit)` and `view(mob)` (a small extra in the
snapshot). A mob is `{ id, kind, x, z, face, hp, state, t (seconds in this state), ... }`;
`mob.gone = true` (or `island.mobs.remove(mob)`) removes it at the end of the tick. Also
`island.mobs.of(kind)`, `byId(id)`, `setState(mob, s)`, `inTelegraph(mob, x, z)` (is a spot
inside its last warning, for resolving the strike) and `stateOf(kind)` (a per-kind object for
timers). `hit()` multiplies by every matching `weak` tag, broadcasts `{ t: 'mobhit', id, hp,
max, dmg }`, kills at 0 hp and otherwise puts the mob in `stagger` if it has one.
`telegraph()` broadcasts `{ t: 'telegraph', id, shape, x, z, r, ms, a, len, w }` (`a` the
direction for line and cone, `w` the line's width or the cone's half-angle).

The snapshot's `m` is `[id, kind, x, z, face, state, extra?]` per mob (it replaced the old
`s` list of Stilled). In the browser, `public/js/135-mobs.js` plays them back; each kind
registers `UI.mobs.register(kind, { make(id) -> Object3D, pose(mob, dt, now) })` from
`public/js/mobs/<kind>.js` (the client bundle joins a part's folder right after it, so
`135-mobs.js` is followed by `mobs/*.js`); `mob.state` and `mob.stateAt` drive poses.
Telegraphs are draped over the ground in ink and darken until they land.

The Crawler (C2) is the kind `crawler` (`server/mobs/crawler.js`, drawn by
`public/js/mobs/crawler.js`): one lives in each cave whose description lists it (`lair:
['crawler']` in the region file; the Landing's sea cave), spawned by its `tick`, back the day
after it's killed. It moves along the cave's nodes (never through rock or water deeper than
`C.DRY`); states `lurk` (on the roof), `hunt`, `windup` (a `line` telegraph), `strike` (knock
plus a drag deeper), `recover`, `recoil` (from a lit torch within `C.LIGHT`), `stagger`. It
hears `p.running`, `p.lastCallAt` and `p.lastChatAt` (chat.js sets both) within `C.HEAR_*`.
`view` is `[surface ('f' floor | 'c' ceiling), height]`. It broadcasts `{ t: 'scream', id, x,
z, under }` (dread for those near, a shake, a sound: clips listed in
`public/sfx/crawler/list.json`, or a made-up screech). `weak: { fire: 3, light: 2 }` for P6.

The Stilled are the kind `stilled` (their behaviour is unchanged: `tick` fades and spawns,
one `stalk` state moves and knocks). `dummy` is a test mob (never spawns by itself): admins
type `/spawn dummy` (or any kind) in chat, with their name in `ADMINS`. Each region's
`stilled:` field (server/regions/) can name its own kind once one exists.

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

## 11. Checkpoints (P4, done, flag `checkpoints`)

```js
p.checkpoint             // the fire id (a clay hearth) p wakes at, or null. island_members.checkpoint (migration 0007)
island.respawnPoint(p)   // -> { x, z, say?, dread? }: beside their hearth (each player at their own spot round it);
                         //    cold (dread) if it's out; the Landing's beach if it's gone (and the checkpoint is cleared)
                         //    or they have none. Used by dying (onRespawn) and knockdowns; bosses can use it too.
island.checkpointFire(p) / island.wake(p)   // their hearth or null; stop sleeping
```

- `server/systems/checkpoints.js`. The browser (`145-hearth-checkpoints.js`) sends
  `{ t: 'sleep', on, fire }` once you've sat down (`sit`) within 3 m of a lit hearth; the
  server checks it and broadcasts `{ t: 'sleep', id, on }`; after 3 s asleep it saves the
  checkpoint and broadcasts `{ t: 'checkpoint', id, fire }` (fire null when cleared).
  Standing up, moving or being knocked down wakes you. `welcome.checkpoints` is
  `{ playerId: fireId }` for everyone on the island, `publicView(p).sleep` whether they're asleep.
- Knockdowns: when `p.knockedUntil` passes, a player with a checkpoint is moved to
  `respawnPoint(p)` (a `correct` and a toast). Without one they get up where they fell.
  Anything that knocks players down just sets `knockedUntil` (as `island.knock(p)` does).
- Test commands (tests/helpers/test-hooks.js): `knock`, `fire { fire, fuel | remove }`.

## 12. Climbing surfaces (P9)

World content marks climbable things; the movement code only asks:

```js
WG.climbAt(x, y, z)  // -> null or { normal, top } from objects with `climb: true` or cliff slopes. Stub (F5): always null
```

As built (P9, flag `travel`): `WG.climbAt(x, y, z, objs)`. Cliffs need nothing else: ground
steeper than `RULES.TRAVEL.CLIFF_SLOPE` gives `{ kind: 'cliff', nx, nz, slope, top }` (`nx, nz`
point out of the face, downhill; `top` is the first gentle spot uphill, `{ x, z, h }`, or null).
Trunks need the nearby objects passed as `objs`; one with `climb: true` (not gone, not a
sapling) within its radius + `TRAVEL.TRUNK_REACH` gives `{ kind: 'trunk', o, nx, nz, top }`,
with `top` its measured height (`o._top` in the browser) or 4.2 × `maxScale`, and null once
`y` is above that. `generateObjects` marks palms with `maxScale >= 1.2` `climb: true` (79 on the
Landing); new land (C4's giant trunks, vines) can set `climb: true` on its own objects. Also
`WG.slopeAt(x, z) -> { gx, gz, g }`.

Movement (browser, `385-climbing.js`, with hooks in `380-jumping.js` and `390-loop.js`): with
`travel` on you can't walk up a cliff, you grab trunks and cliffs by walking into them, and in
the air your height is kept against the sea (`hop.abs`), so you fall off cliffs and a glide
carries you out over the drop. The server (`players.js`) takes `pose: 'climb' | 'glide'` with
`pos`: a glide may drift at `TRAVEL.GLIDE_SPEED`, `stand` may go up to `TRAVEL.MAX_HEIGHT`,
both use energy (`WG.stepEnergy(p, dt, sprint, drain)`, the same on both sides), and each
snapshot row gets a 9th value (after W9's cave), the pose (0, 1 climbing, 2 gliding), which the browser plays
back with `poseTravel`.

## 13. Minigames (P8)

```js
// server
island.minigames.start(p, type, { difficulty, seed, region }) // -> Promise<{ won }>
// client
UI.minigames.register(type, { open(puzzle, answer), close() })   // answer(payload) sends to server
```

The answer stays on the server. Fishing (P7) and future Sleeper requests use this.

As built (P8, done; the player-facing text waits behind the `fishing` flag for P7):
`island.minigames.start(p, type, { difficulty: 'easy'|'medium'|'hard', seed, ms })` resolves
`{ won, reason }` with reason `right`, `wrong`, `late`, `early`, `gave up` or `replaced` (a new
game for the same player ends the old one). Types: `trivia`, `untangle`, `ripple`, `pull`,
`water`, each a file in `server/minigames/` with `build(rng, level, island) -> { puzzle,
check(answer), solve(), ms, minMs? }`. Messages: the server sends `{ t: 'minigame', id, type,
name, difficulty, ms, puzzle }` and `{ t: 'minigame-result', id, won, reason }`; the client sends
`{ t: 'minigame-answer', id, answer }` or `{ t: 'minigame-quit', id }`. Answers (all under the
socket's 4 KB limit): trivia `{ choice }`, untangle `{ rots }` (a turn 0-3 per tile), ripple
`{ seq }`, pull `{ flips }` (the fixed-step numbers where the button changed; the server
replays them with `server/shared/minigame-sim.js`, which the page also loads, and an answer
before the round is played out is `early`), water `{ marks: [[x, y], ...] }` (0-1, up to 5).
In the browser the game shows in a panel registered as `minigame` (`285-minigames.js`), so
Esc and the mouse behave like any panel; closing it before the result gives up. Each game
draws from `public/js/minigames/<type>.js`: `UI.minigames.register(type, { open(puzzle,
answer, body, game), close(), result(m) })`. Trivia questions live in the `fishing_trivia`
table (migration 0008; defaults in `server/content/trivia.js`, answers[0] is the right one).
Admins try a game with `/minigame <type> [difficulty]`.

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

## 16. World objects and chunks (W1, done)

Trees, palms, bushes, rocks, ore and dig patches. Only `server/systems/objects.js` knows
where they're kept:

```js
this.obj(id)             // one object, or undefined (also when its chunk isn't loaded)
this.eachObject()        // every object in memory: the Landing's, then each loaded chunk's
await this.loadChunk(cx, cz)   // make it from the seed + apply saved changes; safe to repeat
this.unloadChunk(cx, cz) // false while it has unsaved changes
WG.generateChunk(seed, cx, cz, tables)   // the same result on the server and in the browser
WG.chunkOf(x, z) / WG.chunkKey(cx, cz) / WG.chunkOfId(id)   // chunks are WG.CHUNK = 32 m
```

- The Landing's objects are today's `generateObjects` list: ids 0, 1, 2 ..., always loaded.
- Chunk objects have ids from `WG.CHUNK_ID_BASE` (10,000,000) up; the id encodes the chunk.
  Anything that stores or sends object ids must treat them as sparse numbers, not array
  indexes (the client does today; W2 changes that).
- Spawn tables are plain data in each region file (`spawn: [rule]`), so they can be sent to
  the browser: `{ type, per, biomes?, minH?, maxH?, pad?, extra? }` where `per` is the
  expected count in a whole 32 m chunk of that region.
- Saved changes are `world_objects` rows tagged with their `chunk`; an object back to how
  the seed made it has no row.

### Streaming (W2, done, flag `streaming`)

- Every half second the server works out the chunks within 3 of each player (7 x 7), loads
  them and sends `{ t: 'chunk', key, objects: [{ id, type, x, z, ..., state }] }` for any with
  objects; chunks further than 4 away get `{ t: 'unchunk', key }`. `p.chunks` is what a player
  is in range of, `p.sentChunks` what they were actually sent.
- `this.sendObjs(list)` is how object changes go out: the Landing's to everyone, a chunk's
  only to players who have it. Don't `broadcast({ t: 'objs' })` directly.
- `this.regrow(o)` is what sunrise does to one object. A chunk that wakes up after a dawn
  runs it for its objects; `chunk_days` (migration 0004) records the day each loaded chunk
  was last saved, and a chunk only unloads once its changes and today's date are saved.
- Browser: `105-chunk-objects.js` adds streamed objects into the same per-chunk buckets the
  Landing's objects use, so drawing, targeting and collisions need nothing else;
  `objectById(id)` finds either kind.
- Fires, lanterns and sacks are still sent to everyone (there are few of them). The
  Stilled already only exist near players.
- `SPAWN_TEST=1` (server env, testing only) scatters extra trees, rocks and bushes over the
  Landing's chunks so streaming can be seen before any region has land.

## 17. The map (W7, done)

- `UI.mapLayers.push({ draw(g, at, dotScale, full) })` adds markers: `at(x, z)` gives canvas
  pixels for a world spot, `dotScale` is the marker size (1 on the full map, smaller on the
  minimap), `full` is true on the full map (draw labels only there). Use `markerShape(g,
  kind, cx, cy, scale, fill)` for the ink style, and add a `MARK` entry if it belongs in the
  legend. P4's hearth flags, C0's boss markers and P11's calls go here.
- With `bigworld` on: the full map pans and zooms (`295-map-controls.js`), sharper 256 m tiles
  are drawn when zoomed in, the minimap follows the player, and charting covers unexplored
  land in parchment: one bit per 32 m chunk, `islands.seen` (migration 0006), `welcome.seen`
  (base64) and `seen { list: [[cx, cz]] }` as land is found (`server/systems/charting.js`).


## 18. Caves (W9, done, flag `caves`)

A region's cave is described in its region file and built the same way on the server and in
the browser (`server/shared/caves.js`, `window.Caves` in the browser):

```js
// server/regions/<id>.js
cave: {
  id: 'seacave', sea: true,          // sea caves fill with the tide
  x, z, dir,                         // the mouth (where the floor meets the ground) and the way in (0 = north, π/2 = east)
  length, wander,                    // metres; how far it drifts sideways (from the cave's own seed)
  floor:  [[s, y], ...],             // floor height along the way (s = metres from the mouth)
  width:  [[s, halfWidth], ...],
  height: [[s, h], ...],             // floor to the top of the arch; walls are straight up to CAVE.WALL of it
  branch: { at, dir: ±1, length, floor, width, height, wander },   // optional side passage
}
Caves.generateCave(spec)      // -> { id, region, sea, nodes: [{ x, z, y, w, h, s }], segs, out, bbox }
Caves.caveHit(cave, x, z)     // -> { floor, roof, w, h, d, s, ... } or null (outside it)
Caves.caveAt(caves, x, z) / Caves.groundCut(caves, x, z, groundH)   // the ground is cut at the mouth
Caves.darkness(hit) / Caves.tideLevel(t) / Caves.waterLevel(cave, t)
island.caveList() / caveById(id) / caveHitOf(p) / caveCut(x, z) / caveLit(p)
```

- Pick the spot with a script, not by eye: past the mouth there must be at least a metre of
  ground over the roof everywhere (W9's test checks the Landing's). Nothing stands on the
  cut ground at the mouth: chunk objects there are never made, and the Landing's are hidden
  in the browser and can't be used.
- `p.under` is the id of the cave a player is in (null above ground). The browser says so on
  `pos` (`under: id`); the server only lets you in or out at the mouth (within `CAVE.MOUTH`
  metres), keeps you inside the walls, and never moves you part-way through rock. It's in
  `welcome.caves`, `publicView(p).under` and the 8th field of each `snap` player entry.
  Underground players are saved just outside the mouth (`island.savedSpot(p)`).
- Underground: no fog, no cold, no Stilled (`server/mobs/stilled.js` leaves out players with `p.under`), no fires, and
  nothing up on the ground is in reach (E does nothing yet: cave finds come with the region
  packs, and should check `p.under`). The Dark (`RULES.DREAD.CAVE_DARK`, scaled by
  `Caves.darkness`) builds unless you, or a friend within `FRIEND_RADIUS` in the same cave,
  hold a lit torch (item `torch`, recipe flagged `caves`, burns `RULES.TORCH.BURN` s in hand
  underground), or you have the firefly jar.
- Sea caves: water inside is `Caves.tideLevel(t)` (twice a day, `CAVE.TIDE`). Deeper than
  `CAVE.PUSH` where you stand and the sea drags you out to `cave.out`; you can't walk into
  water that deep.
- Global chat from underground reaches everyone not in the same cave muffled
  (`{ muffled: true }`, some words lost). Whispers are clear.
- Browser (`135-caves.js`): `myCave`, `caveFloorAt(id, x, z)`, `caveStep(nx, nz)` /
  `caveCommit` (used by the movement code), `av.under` on castaways (`poseCastaway` stands
  them on the cave floor). The sea's shader leaves out the nearest cave's footprint (a mask
  texture); the camera stays under the roof; daylight fades with `Caves.darkness`; up to two
  torch lights. `__dbg.cave()` for tests.
- The Crawler (C2) lives in caves whose description has `lair: ['crawler']` (section 8).
  Test command `place { x, z, under }` puts a player in (or out of) a cave.

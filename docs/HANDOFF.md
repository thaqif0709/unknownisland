# Unknown Island: handoff notes

Everything decided so far and where the build stands, so a new session can
continue without re-explaining. Secrets (database URL, invite code) are
deliberately not written here; they live only in Render's environment settings.

## What this is

A 3D survival browser game in an inked illustration style, no game engine:
plain HTML/CSS/JS with three.js r128 for rendering. (Style history: watercolor,
low poly, soft and cute, pixel-art previews; Thaqif then chose a neo-traditional
tattoo/illustration look from a reference image: thick dark ink outlines, flat
three-tone cel shading, muted earthy palette on cream paper, curly swirl clouds.)

Rendering: toon materials with a 3-step gradient; the scene is drawn once for
colour+depth and once with MeshNormalMaterial, then a full-screen pass inks
depth jumps and normal creases (`inkMat` in public/js/020-ink-pass.js). The sea is drawn
into the normal buffer in pure red so the shoreline gets a line. Tiny
decorations (flowers, tufts) have depthWrite off and are hidden from the normal
pass so they stay as uninked dabs; swirl clouds are canvas sprites with their
own outline.

Characters are humanoid frogs (head from Thaqif's character sheet: green, spotted,
bulging orange-ringed eyes, long smile) wearing only a simple hooded cloak, part
wizard, part wanderer: a long ragged robe with a rope belt and a patch, wide
sleeves, a hood with a drooping tip, and bare webbed hands and feet. The cloak
colour identifies the player (`CLOAKS`). Feet sit at y=0 and everything stands on
`groundAt()`, which follows the drawn terrain triangles rather than `heightAt()`.

Sky: east is +x and north is -z. The sun rises in the east, passes slightly
south (`SUN_TILT`) and sets in the west; the moon is opposite. Shadows follow
whichever is up. Also: varied swirl clouds, a mist band around the horizon,
fireflies at night, inked smoke puffs over fires, curling wave crests off the
shore, and per-id shape variation for trees (round/tall/wide/forked, pine
tiers), bushes and lumpy stones. Settings has a Graphics option (Auto/High/Low;
Low = device pixel ratio 1, no shadows, depth-only outlines).

Survival rule change: hunger and thirst only drain while the player is moving
(server-side; moving = client flag or any real position change). Standing
still costs nothing; night cold still hurts.

The game started as a single-player prototype
(Castaway, https://claude.ai/artifact/67m4EsRbAwp9zuvBU89AD7) and is now a
private, persistent multiplayer island for Thaqif and friends (about 2 to 10 players).

Thaqif is technically curious but not a full-time developer: explain plainly,
don't assume command-line fluency, and build in playable stages.

## Build order and status

1. **Shared live island**: done. Players see each other move (≈12.5 Hz snapshots,
   interpolated 150 ms behind) and share object state, fires and time of day.
2. **Accounts and persistence**: done. Sign-up with invite code, login,
   30-day sessions, saving to Neon every 30 s, on disconnect and on shutdown.
3. **Catch-up when the island wakes**: done (it was a small addition to step 2).
4. **Polish**: partly done (name tags, online list, reconnect with backoff).
   Still open: chat bubbles or emotes, mobile tuning.
5. **Content added after v1**: flora sizes and growth, tree/bush/rock species by
   biome, decorative flowers by biome, ore rocks and dig patches, tools and
   recipes (recipe book, B), sprint with energy/exhaustion, settings (Esc) with
   key rebinding.

Deploy status: live at https://unknown-island.onrender.com (Render service
`unknown-island`, id `srv-datju8vavr4c73drnjb0`, free plan, Singapore), deploying
automatically from `main`. Env vars are set in Render.

## Key decisions

- **Server is authoritative.** It owns time of day, fires, object states and
  player stats, and validates every action (distance with a latency slack,
  resources, costs, cooldown). Clients move themselves locally and report
  position; the server rejects impossible jumps and sends a correction.
- **World model: catch-up simulation.** The server doesn't need to run 24/7. When
  the first player joins after a quiet period it computes the elapsed time since
  `islands.last_tick_at` and fast-forwards (`advance` in `server/systems/time.js`):
  clock and day counter, fire fuel, coconut/berry refills, tree and rock regrowth.
  Regrowth depends only on the final day number, so any length of downtime is O(1).
- **Offline characters vanish.** Stats and inventory freeze until the player returns;
  they reappear where they logged off.
- **Accounts:** username + password (bcrypt). First sign-up needs the invite code
  (`INVITE_CODE` env var). Session tokens are random; the database stores only an
  HMAC of the token keyed by `SESSION_SECRET`. Logging in elsewhere kicks the old
  connection.
- **Multiple islands later:** the schema and `Island` class are keyed by island id;
  everyone joins island 2 (`DEFAULT_ISLAND` in `server/index.js`).
- **Death:** you drop, see how long the island has lasted, and wake up on the beach
  with starting stats and empty pockets.

## Changes from the prototype (deliberate)

- **Object placement no longer shares an RNG with mesh building.** The prototype drew
  leaf angles etc. from the same RNG as positions. Now `generateObjects(seed)` in
  `server/shared/world-gen.js` draws only positions/sizes; the client seeds visual
  details from each object's id. The layout therefore differs from Castaway's, but
  is stable for this island. **Never change the placement order or tests for an
  existing island**, because `world_objects.obj_id` is the index in that list.
- **The server sends the object list** in the welcome message instead of each client
  generating it, so a floating-point difference between browsers can't make ids
  disagree.
- **Rocks regrow** after 3 in-game days (`RULES.ROCK_REGROW_DAYS`). The prototype
  never regrew them, which would slowly strip a persistent island of stone.
- **Fire lights use a pool of 4 point lights** assigned to the nearest lit fires,
  instead of one light per fire.
- **three.js is served by our own server** (`/vendor/three.min.js`, npm package
  `three@0.128.0`) rather than cdnjs.
- Starting a second fire within 1.4 units of another is refused.

## The big island (island 2)

The island was enlarged from radius 36 to about 170 (roughly 300 units across).
It is a new island row (id 2, seed 11, created by `store.migrate()`); island 1's
data is kept but unused. `heightAt` in world-gen has a coastline with coves and
headlands, rolling land, seven hills (the big hill in the north) and four spring
basins (`SPRINGS`; the main one is south of the big hill). `biomeAt` gives sea,
beach, meadow, forest, highland, peak or spring, and placement/species/decor use it.
About 2,000 objects; `generateObjects` uses a spatial hash and is cached.

The client streams the world in 32x32 chunks around you: terrain within 4
chunks, props within 3, flowers within 2. Each object's meshes are merged per
material (`bake`) to keep draw calls down. The layout comes once from
`/api/world` (gzipped, ~28 KB); the welcome message only carries non-default
object states. The sea, clouds and fireflies follow the camera.

## Narrative systems (from the narrative brief)

Built so far (non-progression systems only; quests/story progression are being
planned separately by Thaqif):

- **Phase 1, fog and dread (done).** Fog is one shared rule, `fogAt()` in
  world-gen, used by the server (dread, gameplay) and client (drawing). It always
  sits over deep sea; at dusk a "front" rises from the sea, filling low ground
  first (normal night: up to ~7.5 height, hills stay clear); fires cut clear
  circles (radius = warmth x 1.4). The client builds a 64x64 fog map around the
  focus point (4-unit cells) every 0.25 s and the ink shader reconstructs each
  pixel's world position to draw fog as tint + stipple + cross-hatching; ink lines
  dissolve into dots in fog. Dread (0-100, saved in `island_members.dread`) rises
  in fog, darkness and solitude and falls near fire, in daylight, with friends and
  when eating (`RULES.DREAD`). The shader's `dread` uniform drains colour, spreads
  stippling, trembles and blows out lines, and creeps ink in from the edges. At
  high dread the client shows phantom frogs and plays footsteps/whispers (Web Audio,
  toggle in Settings). `Island.knock(p)` knocks a player down (health, dread,
  half the inventory into a sack saved in the `drops` table; anyone can pick it up).
  The Stilled call it.
- **Phase 2, the Stilled (done).** Server-side (`updateStilled` in `server/systems/stilled.js`,
  tuning in `RULES.STILLED`): at night they spawn in fog 22-42 units from players
  (2 per player, +1 if alone, +1 if dread > 70, max 12, doubled on Drowning
  nights), never in plain sight. Clients send their camera yaw with position; a
  Stilled inside any player's view cone (±0.85 rad, 60 units) is frozen. Unwatched,
  it walks (2.4 u/s) toward the player it has noticed (notice radius grows with
  dread and solitude), only through fog >= 0.35, so light and clear air stop it.
  Reaching you knocks you down (20 s cooldown) and it vanishes; they fade when
  their spot clears. Being within 15 units raises dread. Client draws them with a
  shader that writes alpha 0 into the colour target; the ink pass sees that and
  leaves them as flat pale negative space with only a little fog stipple.
- **Phase 3, stone lanterns (done; light only, no map gating).** 26 lanterns from
  `generateLanterns(seed)` (one near the spawn beach, one by the main spring; the
  4 highest others are great lanterns needing lamp oil from 3 different frogs).
  Lamp oil = 3 seeds (seeds from berries, coconuts, sometimes digging). One oil
  = 480 s of fuel (max 1920). A lit lantern clears fog in a radius (14, great 24),
  warms within 60% of it, and borrows a light from the fire-light pool. State in
  the `lanterns` table.
- **The fog fights back (done).** A lantern that runs dry goes cold (offerings
  reset). Its clearing then shrinks in 4 steps over 2 in-game days
  (`reclaim_progress` 0..1, `clearRadius()`); relighting stops it. When fully
  reclaimed (`reclaimed()`): 35% of objects in the radius are swallowed (gone,
  regrow on the usual schedule), fires there are removed, sacks are dragged
  4-10 units deeper. Burn rate rises +25% per day held clear (`cleared_since`,
  max 2.5x) and doubles on Drowning nights (`env.drowning`, set in Phase 5).
  All of it runs during offline catch-up; inventories and journals are never
  touched.
- **Phase 4, tides, bugs and the journal (done; no bottles/relics/name stones,
  which are story).** Content lives in the database so it can be edited in Neon
  without redeploying: `journal_entries` (key, category bugs/shells/glass/tide/
  strange, name, description, rarity) and `tide_table` (weight, min_day, kind
  resource/food/collectible/strange, gives JSON, entry_key). Defaults are in
  `server/content/` and only inserted if missing; the server reloads content
  every 5 minutes (on join). Each sunrise `tide()` clears the old `washups` and
  washes 8-12 new ones onto beaches (at most one strange thing per tide; the
  footprints lead to the nearest fire/lit lantern). Bugs (`CONTENT.BUGS`) spawn
  around players by biome and time, last 1-2 minutes, and can be caught (food,
  a little less dread). `discoveries` records per player with `first_on_island`
  and a count; first finds are announced to everyone. The journal (J) is a flash
  sheet with a canvas-drawn inked icon per entry.
- **Phase 5, cloak and events (done).**
  - *Moon:* 8-day cycle, `moonPhase(day) = (day + 3) % 8`, so day 1 is full and
    phase 0 (days 5, 13, ...) is the Drowning Moon: fog front up to 40, lanterns
    burn 2x, more Stilled. The moon disc is drawn per phase; the HUD shows the
    phase and weather; a dusk warning comes before a Drowning night.
  - *Weather:* rolled at dawn and noon (`RULES.WEATHER`): clear 6, rain 3,
    storm 1, fog storm 1 (from day 3). Rain refills thirst, shrinks all light and
    warmth radii to 70% and brings rain bugs; a storm night makes the next tide
    1.6x bigger and digging can turn up buried finds; a fog storm adds +9 to the
    fog front by day. Saved in `islands.weather` / `moon_day`.
  - *Overnight changes:* when the island wakes after more than 0.8 of a day,
    `overnight()` does one or two of: leaves a Stilled frozen near a lit camp,
    puts out a lantern, puts out the fires, drags a sack, pins a note nobody
    wrote (`CONTENT.ISLAND_NOTES`).
  - *Driftwood board:* by the first lantern. Read and pin notes (200 characters,
    one per 30 s, within 4 units), in `board_notes` (last 40 kept).
  - *Cloak patches:* up to 3 (`RULES.PATCH_SLOTS`), stitched in the journal from
    things you've found (`WG.PATCHES`, each a perk and a cost), in
    `cloak_items`, shown on everyone's cloak.
  - *Full-moon and rain bugs:* glowing mushroom, lantern fish (full moon);
    glass snail, rain beetle (rain).
  - *The extra one at the fire:* client-only. At night, warm by a fire with a
    friend nearby and dread >= 50, you may see one more frog sitting at the fire
    (a cloak colour nobody has, no name tag). It goes if you stare at it.
- **The Sleeper (done).** Three carving stones (`generateCarvings(seed)`: by the
  beach camp, near the main spring, on the highest ground). One request at a
  time from `sleeper_requests` (editable in Neon: text, conditions, reward,
  penalty, min_day, weight, days, stone, done_text, fail_text, enabled). Code in
  `server/systems/sleeper.js`, mixed into `Island`. At dawn (also during catch-up) an
  expired request fails and applies its penalty; a resolved request is replaced
  at the next dawn. Condition types: `offer {item,count}` (bring items to the
  stone), `lanterns_lit {count,minHeight}`, `lantern_fed {which,fuel}`,
  `gather {count}` (at night, within 6 of the stone), `fires_dawn {count}`,
  `fog_walk {seconds}` (in thick fog, then back into light), `bugs {count}`,
  `find {key}`. Rewards: `calm` (fog front drops to 1.5 for the night),
  `gift` (lamp oil and seeds left at the stone), `relic` (carved mask, eye
  stone or old tooth, journal category `relics`), `note`, `light` (the nearest
  cold lantern lights itself). Penalties: `press` (fog front +4, lanterns burn
  1.5x), `dread`, `douse`. Every request and mood is logged in `island_events`.
- **Sleeper request chains (built, flag `chains`, off until the first boss exists).**
  Each region's chain is a list of request keys in `server/regions/<id>.js`
  (`requests`), in order; chain-only requests have `in_pool = false` in
  `sleeper_requests` so they never come up at random. With the flag on, the next step
  of the first open region whose chain isn't finished is always carved; an ignored step
  is carved again at the next dawn; between chains, pool requests come at random as
  before. Progress is `islands.chains` (`{ landing: { done, completeDay, bossDay } }`).
  Finishing a chain calls `summonBoss(region)` and the region's `bossHint` stone gives the
  time and place until the boss system (C0) sets `bossDay`. The Landing's chain (5 steps,
  leading to the Tidewife) is written. When the flag goes on, a request already carved
  finishes first.
  Gifts left at a stone survive the tide. The carved text re-inks itself on the
  stone when it changes; reading a stone at night plays breathing; Drowning
  nights bring small tremors.
- **Map (done).** A top-down chart (M, or the phone Map button), a panel like the
  journal/book. The base terrain is inked once into an offscreen canvas from
  `WG.heightAt`/`biomeAt` (flat colour per biome, no gameplay data) and cached;
  markers for the springs, lanterns (lit/unlit, bigger for great lanterns),
  carving stones, the driftwood board, fires (lit/unlit) and players (each
  their own cloak colour; you get an arrow showing facing) are redrawn on top
  while the panel is open, refreshed every 0.3 s from `tick()` so others'
  positions keep moving. A round always-on minimap (190px) sits in the
  top-right HUD corner next to the online list, drawing the same cached
  chart scaled down (`drawMap`/`drawMapMarkers` are shared, size- and
  dot-scale-parameterised); clicking it opens the full panel. Unlike the
  other panels, the map doesn't freeze movement or block key handling
  (`blocksInput()` excludes it from the set that does) and its panel
  backdrop is nearly transparent and pushed toward the top of the screen,
  so you can keep walking and see your surroundings while it's open.
  Player markers (yours and everyone else's, on both the full map and the
  minimap) sit on a bright cream halo so they read clearly against any
  biome colour underneath; each player's marker and halo use their own
  cloak colour (`colorFor(id)`), same as their name tag and online-list dot.
  Client-only; nothing new from the server.
  (Since then, `markerShape`/`MARK` replaced plain coloured dots with small
  pictograms — a lantern is a bronze cage with a glowing dot, a fire has
  crossed logs under the flame, the board shows plank seams, a carving
  stone has a scratched rune — so markers read as the thing they represent
  rather than just a colour-coded shape; `iconFor` reuses the same drawing
  code for the legend.)
- **Intro cutscene (done).** In-engine, about 73 s, skippable (button, Esc,
  Enter, Space): the chart inks itself, a storm with the reed boat and
  lightning, something vast passes under the boat, the grey beach, PELL in the
  collar, the fog with a Stilled at its edge for a moment, the title, then the
  frog stands and the camera settles into play. Plays on a player's first
  arrival if `players.seen_intro` is false; Settings has "Rewatch the intro".
  While it plays the server holds the player (no hunger, cold, dread or
  Stilled; at most 150 s). Code: the "Intro cutscene" section of game.js.

## Content model (added after v1)

- **Object list:** the original 84 objects (ids 0-83) are unchanged. Ore rocks
  (8 copper, 5 iron) and 18 dig patches were appended as ids 84-114 using a
  separate RNG stream. Species (`pine`/`oak`/`blossom`, `berry`/`blueberry`,
  `pebble`/`mossy`/`granite`) and full-grown sizes (`maxScale`) come from hashes of
  the id, never from the placement RNG.
- **Growth:** `state.planted` = in-game day a sapling sprouted; size grows from
  20% to `maxScale` over `FLORA[type].growDays`. Chops needed scale with size.
  Palms fruit only when full-grown, bushes from 60%.
- **Inventory:** `wood`/`stone` columns plus `island_members.inventory` JSONB for
  `clay`, `copper`, `iron` and `tools` (array). `fires.kind` is `campfire` or
  `hearth`. Both columns are added by `store.migrate()` on server start.
- **Energy:** 0-100, not persisted. `stepEnergy` in world-gen is shared by the
  server (authoritative: hunger cost, speed check) and the client (prediction).
- **Decorative flowers** are client-only instanced meshes, not in the database.
- **Chop/mine animation (client-only).** `swingToolFor(o)` decides whether an axe or
  pickaxe shows in hand for the swing at a tree/palm/rock/ore: it's optional for
  chopping and rock (a tool just yields more, per the existing server rule) so it
  only shows one you actually own, but ore always shows a pickaxe since mining it
  requires one. `setSwingTool` attaches `heldModel('axe'|'pickaxe')` to the swinging
  arm for the swing's 0.35s (hiding whatever hotbar item was in hand) and
  `poseCastaway` puts it away the instant `swingT` reaches 0. The server's `fx`
  broadcast (already carrying the object id for these hits) now also triggers a
  small burst of wood/stone/ore-coloured debris cubes (`spawnChips`/`updateChips`,
  a small reused pool like the smoke puffs) on every player's hit, not just your
  own. One gotcha for anyone testing with `?debug`: these debris cubes must not be
  added to the `noInk` set - that set is for opacity-managed things (like the smoke
  puffs) which the two-pass renderer force-`visible=true`s after its normal pass,
  which fights a pool that manages on/off purely via `.visible`. Also: the debug
  `teleport(x,z)` now also sends a `pos` update, since `onPos`'s per-message
  distance clamp (speed * 1.4 * min(dt,1) + 0.6, so at most roughly 7 units
  regardless of how long you wait) otherwise makes a single big instant test-jump
  get silently reverted server-side - real walking never notices this since it's
  many small legitimate steps.

## Survival rules

All in `RULES` in `server/shared/world-gen.js` (the server sends them to clients):
day = 20 min: 15 min of daylight (RULES.DAYLIGHT_LEN, incl. short dawn/dusk) + 5 min night (RULES.NIGHT_LEN); the clock runs faster at night (WG.advanceT); t: 0 midnight, .25 sunrise, .5 noon, .75 sunset; night is t < .22 or
t ≥ .8; the day counter increments at sunrise); hunger −0.28/s, thirst −0.42/s;
start 100/80/70; −1.6/s health each when hunger or thirst is 0; −0.6/s at night
away from a lit fire (radius 5.5); +0.8/s regen when both > 35 and unhurt; spring
+35 water; seawater −4; coconut +18 food +14 water (3 per palm); berries +12 food;
rocks 2 stone each; trees/palms 3 chops (1 wood each); fire 4 wood + 3 stone, 110 fuel burning 0.2/s (about 9 real minutes),
+55 per wood (max 200); coconuts and berries refill each sunrise; felled trees
regrow after 2 days, mined rocks after 3.

## Server layout
`server/world.js` is only the Island core: constructor and loading, the tick loop and
snapshots, the message registry, networking helpers and saving. Everything else is a
system in `server/systems/<name>.js` that exports `methods` (mixed into `Island.prototype`),
`messages` (client `msg.t` handlers) and optional `onTick`, `onDawn`, `onJoin` hooks; see
`docs/roadmap/CONTRACTS.md` section 2. Systems: journal, tides, bugs, weather, time (clock,
regrowth, catch-up, overnight), chat, board, patches, players (join/leave, views, movement,
survival loop, show-only messages), gather (E on things), crafting, fires, stilled (and
knockdowns), lanterns (and `lights()`), buckets, drops, sleeper, inventory, regions.
Default content is in `server/content/<topic>.js`.
- **Inventory:** only `systems/inventory.js` touches `p.inv`, `p.tools`, `p.buckets`; everything
  else calls `give/take/count/held/hasTool/...` (CONTRACTS.md section 4).
- **E on world objects:** each system exports `uses: { kind: { reach?, use(p, obj, { say, changed }) } }`;
  palm, tree, bush, rock, ore and dig are in `systems/gather.js` (section 5).
- **World objects:** only `systems/objects.js` knows where objects are kept (`obj(id)`,
  `eachObject()`, `loadChunk`, `unloadChunk`). The Landing's objects (ids 0..N) are always
  loaded; new land comes in 32 m chunks from `WG.generateChunk` and each region's `spawn`
  table, with ids from 10,000,000 up. `world_objects` rows carry their `chunk` (migration
  0003). With the `streaming` flag on, `systems/streaming.js` loads the chunks around each
  player, sends them (`chunk`/`unchunk`), and unloads unused ones once saved; object changes
  go out through `sendObjs`. CONTRACTS.md section 16.
- **The 5 km world (flag `bigworld`, W4):** the Landing stays at the origin; the other six
  regions lie north of it (`WORLD`, `mainlandHeightAt` in `world-gen.js`), joined by a sandy
  neck, with river valleys through the Wood and the Mire. Near the Landing, old land keeps
  its exact height (`landingHeightAt`, used for all Landing placement). The browser rebuilds
  terrain and the map when the server switches it on. Placeholder colours and spawn tables.
- **The Veil (W5, part of `bigworld`):** every region but the Landing is locked until
  `openRegion` (the previous region's boss, C0; or an admin's `/open <region>` in chat, with
  usernames in the `ADMINS` env var); the Veil lifts at the next dawn (`regions_open`,
  migration 0005). Stepping onto locked land turns you around (server and browser both
  check); the browser draws a fog bank along locked borders and hatches them on the map.
- **The map (W7):** pan and zoom on the full map; with `bigworld` on, sharper tiles when
  zoomed in, a minimap that follows you, and charting (explored 32 m chunks, shared and
  saved in `islands.seen`, revealed 5 x 5 chunks around each player every second). Other parts
  add markers through `UI.mapLayers` (CONTRACTS.md section 17).
- **Placeholders for later work:** `WG.REGIONS`, `WG.regionAt`, `WG.climbAt`,
  `isRegionOpen/openRegion`, `summonBoss`, `respawnPoint` (`systems/regions.js`), and one file
  per region in `server/regions/<id>.js` for region packs to fill in.

## Client layout
The browser code is `public/js/NNN-name.js`, one file per part, joined in number order into
`/game.js` by `server/client-bundle.js` (with `/game.js.map`, so errors point at the right
file). They share one scope as if they were one file. New parts are new numbered files and
plug in with `UI.net.on`, `UI.onFrame` and `UI.panels.register` (`000-start.js`,
`240-input.js`). Details: `docs/roadmap/CONTRACTS.md` section 3.

## Feature flags and migrations
- **Flags:** `RULES.FEATURES` in `world-gen.js`, read with `WG.feature(name)` on both sides.
  The `FEATURES` env var on Render overrides them (`"slots,combat"`, `"-slots"`); the server
  resolves them once at start-up (`server/index.js`) and sends them in `welcome`
  (`public/net.js` applies them). Details: `docs/roadmap/CONTRACTS.md` section 1.
- **Migrations:** numbered files in `server/migrations/` (`.sql`, or `.js` exporting
  `up(q)`), each run once in its own transaction under a transaction-level advisory lock,
  recorded in the `migrations` table. `0001-baseline` holds everything the old `migrate()`
  did (all idempotent). Default content is seeded separately on every start
  (`seedContent()` in `store.js`). Details: CONTRACTS.md section 14.

## Infrastructure

- **Neon:** project `unknown-island` (id `proud-water-43664930`), AWS Singapore,
  Postgres 18, database `unknown_island`. Schema (`db/schema.sql`) is already
  applied, with island 1 seeded (seed 7). `world_objects` only holds objects whose
  state differs from the default; defaults are deleted on save.
- **Render:** one Node web service (Singapore, free tier) serving the client and
  the WebSocket server, created from `render.yaml`. Env: `DATABASE_URL`,
  `INVITE_CODE`, `SESSION_SECRET` (generated by Render).
- **GitHub:** `thaqif0709/unknownisland` (public by choice; no secrets in it).
  Work on a branch and merge into `main`; `main` deploys.
- **Netlify:** not used in v1.

## Protocol (WebSocket `/ws`, JSON)

Client → server: `hello {token}` (first message), `pos {x,z,face,moving,sprint,cam}`
(≈15 Hz while moving, 1 Hz idle), `act {target}` where target is `o<id>`, `f<id>`
(fire), `d<id>` (sack), `l<id>` (lantern), `w<id>` (wash-up), `b<id>` (bug),
`c<id>` (carving stone offering), `spring` or `sea`, `build {recipe,x,z}`,
`respawn`, `pin {text}`, `patch {key,on}`, `intro` / `intro-seen`, `hold {key}` (item in hand, shown to others), `dropitem {key,count}` (into a sack at your feet; merges into a sack within 1.5), `bucket {id, action: fill|place|drink, fire}`, `chat {text}`
(the server parses `/w`, `/whisper`, `/tell`, `/msg`, `/r`, `/who`, `/help`; plain
text is global; max 240 characters, 6 messages per 8 s; the last 30 global
messages are kept in memory and sent in `welcome.chat`; nothing is saved).

Server → client: `welcome` (you, island, objects, fires, players, rules), `snap`
(time, day, `[id,x,z,face,moving,dead]` per player), `me` (own stats ≈4 Hz),
`join`, `leave`, `objs` (object state changes), `chunk {key, objects}` / `unchunk {key}`
(streamed land, flag `streaming`), `fire` (new fire), `fires`
(fuel sync ≈1 Hz), `fx` (swing animation), `toast`, `dawn`, `died`,
`respawned`, `correct`, `kicked`, `auth-failed`, plus `knocked`, `drop`/`undrop`/
`movedrop`, `unfire`, `lanterns`, `wash`/`unwash`, `bugs`, `journal`,
`discovery`, `env` (moon, weather, Sleeper moods), `note`, `patches`, `carvings`,
`chat {kind: all|whisper|system, from, id, to, toId, text, at}`.

## Testing locally

`npm start` without `DATABASE_URL` runs an in-memory island with invite code `dev`.
To test against Postgres, create a database from `db/schema.sql` and set
`DATABASE_URL`, `INVITE_CODE` and `SESSION_SECRET`; the server runs the migrations in
`server/migrations/` on start.

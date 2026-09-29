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
depth jumps and normal creases (`inkMat` in public/game.js). The sea is drawn
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
  `islands.last_tick_at` and fast-forwards (`Island.advance` in `server/world.js`):
  clock and day counter, fire fuel, coconut/berry refills, tree and rock regrowth.
  Regrowth depends only on the final day number, so any length of downtime is O(1).
- **Offline characters vanish.** Stats and inventory freeze until the player returns;
  they reappear where they logged off.
- **Accounts:** username + password (bcrypt). First sign-up needs the invite code
  (`INVITE_CODE` env var). Session tokens are random; the database stores only an
  HMAC of the token keyed by `SESSION_SECRET`. Logging in elsewhere kicks the old
  connection.
- **Multiple islands later:** the schema and `Island` class are keyed by island id;
  for now everyone joins island 1 (`DEFAULT_ISLAND` in `server/index.js`).
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
- **Phase 2, the Stilled (done).** Server-side (`updateStilled` in world.js,
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

## Survival rules

All in `RULES` in `server/shared/world-gen.js` (the server sends them to clients):
day 240 s (t: 0 midnight, .25 sunrise, .5 noon, .75 sunset; night is t < .22 or
t ≥ .8; the day counter increments at sunrise); hunger −0.28/s, thirst −0.42/s;
start 100/80/70; −1.6/s health each when hunger or thirst is 0; −0.6/s at night
away from a lit fire (radius 5.5); +0.8/s regen when both > 35 and unhurt; spring
+35 water; seawater −4; coconut +18 food +14 water (3 per palm); berries +12 food;
rocks 2 stone each; trees/palms 3 chops (1 wood each); fire 4 wood + 3 stone, 110 s
fuel, +55 per wood (max 200); coconuts and berries refill each sunrise; felled trees
regrow after 2 days, mined rocks after 3.

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

Client → server: `hello {token}` (first message), `pos {x,z,face,moving}` (≈15 Hz
while moving, 1 Hz idle), `act {target}` where target is `o<id>`, `f<id>`, `spring`
or `sea`, `build {x,z}`, `respawn`.

Server → client: `welcome` (you, island, objects, fires, players, rules), `snap`
(time, day, `[id,x,z,face,moving,dead]` per player), `me` (own stats ≈4 Hz),
`join`, `leave`, `objs` (object state changes), `fire` (new fire), `fires`
(fuel sync ≈1 Hz), `fx` (swing animation), `toast`, `dawn`, `died`,
`respawned`, `correct`, `kicked`, `auth-failed`.

## Testing locally

`npm start` without `DATABASE_URL` runs an in-memory island with invite code `dev`.
To test against Postgres, create a database from `db/schema.sql` and set
`DATABASE_URL`, `INVITE_CODE` and `SESSION_SECRET`.

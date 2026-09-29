# Unknown Island: handoff notes

Everything decided so far and where the build stands, so a new session can
continue without re-explaining. Secrets (database URL, invite code) are
deliberately not written here; they live only in Render's environment settings.

## What this is

A watercolor-styled 3D survival browser game, no game engine: plain HTML/CSS/JS
with three.js r128 for rendering. It started as a single-player prototype
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

Deploy status: code is ready; Render service not created yet (see README).

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
- **GitHub:** `thaqif0709/unknownisland`. Render must be authorized by Thaqif.
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

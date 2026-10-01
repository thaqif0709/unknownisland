# Unknown Island

An illustrated survival island you share with your friends, played in the browser.
Find water and food, chop trees, gather stone, dig clay, mine ore, craft tools, and
keep a fire going through the cold nights. The island is persistent: whatever you chop, pick or build stays that
way for everyone, and time keeps passing even when nobody is playing.

## How it fits together

- **The game server** (`server/`) runs on Render. It serves the game page, handles
  logins, and runs the island: it decides what time it is, who has what, and
  whether an action is allowed. Browsers can't cheat their way to extra wood.
- **The database** is on Neon. It stores accounts, where everyone is, what they're
  carrying, and every tree, rock and fire that's been changed.
- **The game page** (`public/`) is what players see. It draws the island with
  three.js in an inked illustration style (bold outlines, flat colours, cream paper), and sends your moves to the server.

When nobody is playing, the free Render server goes to sleep. The next person to
visit wakes it up (this can take up to a minute). When the island wakes, it works
out how much time passed and fast-forwards: days go by, fires burn out, coconuts
and berries grow back, and felled trees regrow.

## Putting it online (Render)

You only do this once.

1. **Connect GitHub to Render.** In the [Render dashboard](https://dashboard.render.com),
   go to *Account settings → Git* (or you'll be asked in step 2) and allow Render to
   see the `unknownisland` repository.
2. **Create the service from the Blueprint.** Click **New → Blueprint**, pick the
   `unknownisland` repository, and Render will read `render.yaml` from this repo.
   It sets up a free web service in Singapore called `unknown-island`.
3. **Fill in the settings Render asks for:**
   - `DATABASE_URL`: the Neon connection string for the `unknown_island` database.
     In the Neon dashboard: project *unknown-island* → **Connect** → choose the
     `unknown_island` database → copy the connection string (it starts with
     `postgresql://`).
   - `INVITE_CODE`: the secret word friends need the first time they sign up.
   - `SESSION_SECRET` is filled in automatically with a random value. Leave it.
4. Click **Apply**. The first build takes a couple of minutes. When it's done,
   Render shows the address, something like `https://unknown-island.onrender.com`.

After that, every change pushed to the branch Render is watching (normally `main`) is deployed automatically.

Never put the database connection string or the invite code into the repository.
They only live in Render's settings.

## Inviting friends

Send them the Render address and the invite code. The first time, they choose
**I have an invite**, pick a name and password, and type the invite code. After
that they just log in. Everyone lands on the same island.

To change the invite code later, edit `INVITE_CODE` in Render (*your service →
Environment*). Existing players aren't affected.

## Playing

- **Computer:** WASD or arrow keys to walk, hold **Shift** to sprint, **Space** to jump (hold it to leap up to three times higher and forward), drag the mouse
  to look around, scroll to zoom, **E** to use whatever you're next to, **B** for the
  recipe book, **J** for the journal, **T** to put your hood up or down, **V** to sit, **1-8** (or **Q** to cycle) to hold an item and **G** to drop one (Shift+G drops the whole stack, in a sack anyone can pick up with E; that's how you give things to friends), **M** for the map, **F** to quickly build a
  campfire, **Esc** for settings.
  Click the island and the mouse turns the camera (**Esc** frees it), the wheel picks your item,
  and **Ctrl + wheel** zooms (mouse-look, the `mouselook` flag, on).
  Walk into a tall palm or a cliff to climb it (**W**/**S**, **Space** lets go), and hold
  **Space** while falling from high up to glide with your cloak (the `travel` flag, on).
  **I** opens your 30-slot bag (phones: **Bag**): drag stacks between it and the hotbar.
  Coconuts and berries go in it, and holding **E** with one in hand eats it (the `slots` flag,
  on; `FEATURES=-slots` goes back to the old 8 slots without losing anything).
- **Calling out:** press **C** (phones: **Call**) and friends nearby hear you from your
  direction; everyone sees where you called from on the map for a minute.
- **Chat:** press **Enter** (or **/**) to type, Enter to send, Esc to close. Plain
  text goes to everyone. `/w name message` whispers to one person (their number
  from `/who` works too), `/r message` replies to your last whisper, `/who` lists
  who's on the island, `/help` shows the commands. Settings has the same list.
- **Phone:** drag on the left side to walk, drag on the right side to look around,
  and use the **Act**, **Run** and **Recipes** buttons. The gear button opens settings.
- **Settings (Esc):** change any key, camera sensitivity and invert. Settings are
  saved in your browser.

**Clean water from the sea:** make a bucket (wooden: 6 wood, lasts 5 boils;
iron: 2 wood + 4 iron ore, lasts 20 and boils faster). Hold it (1-8), wade into
the sea and press E to fill it, then press E at a lit fire to set it on to boil.
A countdown shows over the fire; when it says ready, press E at the fire to take
it back, then press E while holding it to drink (3 drinks per bucket).

Survival basics: hunger and thirst only go down while you're moving (standing still
costs nothing, but the night cold still hurts). Drink at the spring inland (seawater makes it worse), eat coconuts
and berries, and build a fire to stay warm at night. Sprinting uses energy and makes
you hungry faster; if energy runs out you're exhausted and slow until you recover.

Crafting (see the recipe book in the game):

| Make | Costs | What it does |
|---|---|---|
| Campfire | 4 wood, 3 stone | Warmth at night |
| Shovel | 3 wood, 2 stone | Dig clay from soft dirt patches |
| Stone pickaxe | 3 wood, 3 stone | Mine copper and iron ore; breaks stone faster |
| Clay hearth | 4 wood, 4 stone, 3 clay | Bigger, longer-burning fire |
| Copper axe | 2 wood, 3 copper ore | 2 wood per chop |
| Iron pickaxe | 2 wood, 3 iron ore (needs a stone pickaxe) | 2 ore per swing |

Copper ore is on the hill, iron ore near the rocky top. Every tree, palm and bush
has its own full-grown size; felled trees come back as saplings and grow.

When you log off, your castaway leaves the island and everything is frozen until you
come back. If you die, you wake up on the beach: you keep your tools but lose what
you were carrying.

## The island's stranger side

- **Fog and dread.** Fog rolls in from the sea at night. Being in fog, in the dark
  or alone raises your dread; fires, lanterns, daylight and friends bring it down.
  High dread makes you see and hear things.
- **The Stilled** stand in the fog at night and only move when nobody is looking.
  If one reaches you, you're knocked down and drop half of what you carry.
- **Stone lanterns** push the fog back while they burn lamp oil (pressed from
  seeds). When they run dry, the fog slowly takes the ground back.
- **Tides, bugs and the journal (J).** Every morning the sea washes things up.
  Catch bugs, collect shells and sea glass. Stitch up to three patches onto your
  cloak from the journal; each one helps and costs something.
- **Moon and weather.** The moon turns every 8 days; the Drowning Moon brings the
  thickest fog. Rain, storms and fog storms come and go.
- **The driftwood board** by the first lantern holds notes anyone pins.
- **The carving stones.** Three old stones where the island itself asks for
  things. Answer and it gives something back; ignore it and the fog gets worse.
- **The intro** plays the first time you arrive (Settings → Rewatch the intro).

Journal entries, tide items, the carving stones' requests and the fishing trivia questions
live in database tables (`journal_entries`, `tide_table`, `sleeper_requests`,
`fishing_trivia`), so you can add or change them in Neon without touching the code.

## Changing the rules

All the survival numbers (day length, hunger, sprinting, regrowth, plant sizes), the
recipes and the fire types are at the top of `server/shared/world-gen.js` (`RULES`,
`RECIPES`, `FIRES`). Change a number, push, and Render redeploys. New recipes show
up in the recipe book automatically; a new kind of item also needs a line in `ITEMS`.

Unfinished features are switched off with flags in `RULES.FEATURES`. To try one on the live
island before it's finished, add a `FEATURES` environment variable on Render (for example
`FEATURES=slots` to switch one on, `FEATURES=-slots` to switch it off).

Database changes go in `server/migrations/` as numbered files; the server runs any new ones
when it starts.

To open a region by hand (for testing the big world), put your username in an `ADMINS`
environment variable on Render (comma-separated for several) and type `/open stair` in chat.
The Veil lifts at the next dawn. Admins can also type `/spawn dummy` to put the test creature
(a straw dummy that warns before it strikes) in front of them, and `/minigame trivia hard`
(or `untangle`, `ripple`, `pull`, `water`; `easy`, `medium`, `hard`) to try the fishing games.
For getting around quickly while testing, admins have a creative mode like Minecraft's (only
the flying): `/creative` (or `/gamemode creative`), then double-tap **Space** to fly, again to
stop. The walking keys fly you fast where the camera looks, **Space** rises, **Shift** sinks, and
you can cross the sea and the Veil. `/normal` turns it off (it's off after a rejoin anyway).

The big world is behind three flags that go together: `FEATURES=streaming,bigworld,farview`
(chunks load around each player, the 5 km world, and the view out to 2 km).
Caves (the Landing's sea cave, torches and the Dark, and the Crawler that lives down there)
are their own flag: `caves`. It works with or without the big world. The Crawler's screams:
put sound clips in `public/sfx/crawler/` and list their names in `list.json` there (see the
README in that folder); until then it uses a made-up screech.

The Stairs' own things (flint, herbs, flax, old walls, standing stones, tin, three bugs, the
Leaning on windy nights, the old mine and the Stairs' run of carvings) are the `region-stair`
flag; it needs `streaming,bigworld` (and `caves` for the mine). Switching it on adds them to
the land without moving anything already there.

Hearth checkpoints are the `checkpoints` flag: sit by a lit clay hearth to wake there after a
knockdown or collapsing.

When you switch something on for players, put a few lines about it in `NEWS` at the top of
`public/js/215-whats-new.js`: they show in a "What's new" box on the start screen (each line
can name a flag, so it only shows while that's on). Change its `id` and it opens by itself
again for everyone. Switching a flag off again is safe: anyone whose saved spot isn't
walkable any more (the sea where the big world was, say) comes back on the Landing's beach.

## Trying it on your own computer (optional)

You need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm start
```

Then open http://localhost:3000. Without a `DATABASE_URL` it runs with a
temporary in-memory island (nothing is saved) and the invite code is `dev`.

## Tests

```
npm test               # the server, over WebSocket (about a minute)
npm run test:browser   # the game in a real browser: loads, sign-up, intro, jump, sit
```

`npm test` starts a real server for each file in `tests/server/` (joining, moving,
gathering, building, lanterns, tides, the Sleeper, buckets, chat) and plays it with test
players. It keeps everything in memory unless `TEST_DATABASE_URL` points at a Postgres
database. Give the tests their own database, never the live one: they make accounts and
change the island. An empty database gets `db/schema.sql` automatically. The tests always
start the island at midday in clear weather, so the Stilled stay away.

GitHub runs `npm test` against a fresh Postgres on every pull request
(`.github/workflows/test.yml`), so check that it passes before merging.

The browser tests need Playwright's Chromium once (`npx playwright install chromium`), or
set `CHROMIUM_PATH` to a Chrome or Chromium that's already installed. Set
`TEST_SERVER_LOG=1` to see the game server's own output while the tests run.

## What's in the repository

```
server/index.js           Web server: game files, login API, game connection
server/auth.js            Sign-up with invite code, login, sessions
server/world.js           The island core: loop, snapshots, messages, saving
server/systems/           One file per feature (players, gathering, crafting, fires,
                          lanterns, the Stilled, tides, bugs, chat, the Sleeper...)
server/mobs/              Creatures: the engine (index.js) and one file per kind
server/minigames/         The fishing minigames: the engine (index.js) and one file per game
server/content/           Default journal, tide, bug and request content, by topic
server/store.js           Database access (Neon), or in-memory for testing
server/shared/world-gen.js Island shape, object placement, survival rules
                          (used by both the server and the browser)
public/index.html         Login screens, HUD and styles
public/js/                The browser game, one file per part (drawing, controls, map, recipe
                          book, settings...), joined into /game.js by server/client-bundle.js
public/net.js             Connection to the server, smoothing other players
db/schema.sql             Database tables (already created on Neon)
tests/                    npm test (server, tests/server/) and npm run test:browser
                          (tests/browser/); helpers/ starts servers and test players
.github/workflows/        GitHub Actions: npm test on every pull request
render.yaml               Render setup
docs/HANDOFF.md           Design decisions and status, for picking up work later
docs/roadmap/             The plan for the 5 km world: design, contracts, one file per task
scripts/roadmap.js        Prints the task board (npm run roadmap)
```

Working on the expansion? Start at `docs/roadmap/README.md` and run `npm run roadmap`.

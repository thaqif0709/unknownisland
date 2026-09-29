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

- **Computer:** WASD or arrow keys to walk, hold **Shift** to sprint, **Space** to jump (hold it to jump higher), drag the mouse
  to look around, scroll to zoom, **E** to use whatever you're next to, **B** for the
  recipe book, **J** for the journal, **T** to put your hood up or down, **1-8** (or **Q** to cycle) to hold an item and **G** to drop one (Shift+G drops the whole stack, in a sack anyone can pick up with E; that's how you give things to friends), **M** for the map, **F** to quickly build a
  campfire, **Esc** for settings.
- **Chat:** press **Enter** (or **/**) to type, Enter to send, Esc to close. Plain
  text goes to everyone. `/w name message` whispers to one person (their number
  from `/who` works too), `/r message` replies to your last whisper, `/who` lists
  who's on the island, `/help` shows the commands. Settings has the same list.
- **Phone:** drag on the left side to walk, drag on the right side to look around,
  and use the **Act**, **Run** and **Recipes** buttons. The gear button opens settings.
- **Settings (Esc):** change any key, camera sensitivity and invert. Settings are
  saved in your browser.

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

Journal entries, tide items and the carving stones' requests live in database
tables (`journal_entries`, `tide_table`, `sleeper_requests`), so you can add or
change them in Neon without touching the code.

## Changing the rules

All the survival numbers (day length, hunger, sprinting, regrowth, plant sizes), the
recipes and the fire types are at the top of `server/shared/world-gen.js` (`RULES`,
`RECIPES`, `FIRES`). Change a number, push, and Render redeploys. New recipes show
up in the recipe book automatically; a new kind of item also needs a line in `ITEMS`.

## Trying it on your own computer (optional)

You need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm start
```

Then open http://localhost:3000. Without a `DATABASE_URL` it runs with a
temporary in-memory island (nothing is saved) and the invite code is `dev`.

## What's in the repository

```
server/index.js           Web server: game files, login API, game connection
server/auth.js            Sign-up with invite code, login, sessions
server/world.js           The island simulation, catch-up, saving
server/sleeper.js         The carving stones (the island's requests)
server/content.js         Default journal, tide, bug and request content
server/store.js           Database access (Neon), or in-memory for testing
server/shared/world-gen.js Island shape, object placement, survival rules
                          (used by both the server and the browser)
public/index.html         Login screens, HUD and styles
public/game.js            Drawing the island, controls, recipe book, settings
public/net.js             Connection to the server, smoothing other players
db/schema.sql             Database tables (already created on Neon)
render.yaml               Render setup
docs/HANDOFF.md           Design decisions and status, for picking up work later
```

# Unknown Island

A watercolor survival island you share with your friends, played in the browser.
Find water and food, chop trees, gather stone, and keep a fire going through the
cold nights. The island is persistent: whatever you chop, pick or build stays that
way for everyone, and time keeps passing even when nobody is playing.

## How it fits together

- **The game server** (`server/`) runs on Render. It serves the game page, handles
  logins, and runs the island: it decides what time it is, who has what, and
  whether an action is allowed. Browsers can't cheat their way to extra wood.
- **The database** is on Neon. It stores accounts, where everyone is, what they're
  carrying, and every tree, rock and fire that's been changed.
- **The game page** (`public/`) is what players see. It draws the island with
  three.js and the watercolor effect, and sends your moves to the server.

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

- **Computer:** WASD or arrow keys to walk, drag the mouse to look around, scroll to
  zoom, **E** to use whatever you're next to, **F** to build a fire.
- **Phone:** drag on the left side to walk, drag on the right side to look around,
  and use the **Act** and **Build fire** buttons.

Survival basics: drink at the spring inland (seawater makes it worse), eat coconuts
and berries, collect wood and stone, and build a fire (4 wood + 3 stone) to stay
warm at night. When you log off, your castaway leaves the island and your health,
food, water and inventory are frozen until you come back. If you die, you wake up
on the beach again with empty pockets.

## Changing the rules

All the survival numbers (day length, how fast hunger drops, fire costs, regrowth)
are in one place: the `RULES` list at the top of `server/shared/world-gen.js`.
Change a number, push, and Render redeploys.

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
server/store.js           Database access (Neon), or in-memory for testing
server/shared/world-gen.js Island shape, object placement, survival rules
                          (used by both the server and the browser)
public/index.html         Login screens, HUD and styles
public/game.js            Drawing the island, watercolor effect, controls
public/net.js             Connection to the server, smoothing other players
db/schema.sql             Database tables (already created on Neon)
render.yaml               Render setup
docs/HANDOFF.md           Design decisions and status, for picking up work later
```

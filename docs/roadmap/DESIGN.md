# The Wider Island: design decisions

What we decided to build, taken from the planning page ("The Wider Island" artifact,
rounds 1–3). This file is the source of truth now; if a decision changes, change it
here in the same PR as the code.

How it's split into tasks: [README.md](README.md). How the pieces talk to each other:
[CONTRACTS.md](CONTRACTS.md).

> Spoilers: this file describes bosses, weaknesses and secrets. The repo is public.

## 1. The world

- **Size:** 5 × 5 km, about 15 km² of land (today: 350 × 335 m, 0.075 km²).
- **Walking across:** about 18 min straight, 24–27 min by a real route.
- **Heights:** up to about 600 m in the Teeth, snow above 400 m.
- **Today's island is kept** as **The Landing**, same shape, everything built on it stays.
- **Day length:** 20 min, of which 15 min day and 5 min night (confirmed; W6 done).
- **Log in** where you logged out (as now).
- **Phones:** quality picks itself (shorter far view, thinner leaves). No setting.
- **Objects** (trees, rocks...) come from the world seed. Only changes are saved.
  The server sends each player only what's near them. Only areas near players run live;
  the rest catch up when visited.
- **Far view:** full detail about 130 m, simple shapes out to about 2 km.

## 2. Regions and the order they open

| Stage | Region | Biome | Heights | Cave |
|---|---|---|---|---|
| 0 | The Landing | coastal meadow and forest (today's island) | 0–35 m | sea cave, low tide only |
| 1 | The Stairs | highland terraces, ruins, standing stones | 60–220 m | old mine shafts |
| 2 | The Weeping Wood | rainforest, 60–90 m trees, vines, walkways | 10–120 m | root hollows |
| 3 | The Mire | swamp, mangroves, drowned village | 0–8 m | flooded burrows (raft) |
| 4 | The Teeth | giant mountains, snow, cold | 200–600 m | ice caves, deep caverns |
| 5 | The Ashen Shore | black sand, hot springs, vents | 0–90 m | lava tubes |
| 6 | The Hollow | the Sleeper's crater and eye pool | crater, 150 m deep | the way down |

Plus **The Deep**: one cave system under several regions, with shortcuts between them
and the route down to the Sleeper.

Layout as built in W4 (x east, z south, metres, the Landing stays at the origin so nothing on
it moves): Stairs (0, -1250) straight north across a sandy neck from the Landing's north shore,
Weeping Wood (1400, -1350) with a river valley to the east coast, Mire (-1350, -1150) with pools
and a river, Hollow (200, -2350) a crater, Teeth (350, -3150) up to about 600 m, Ashen Shore
(-1300, -2750) an old volcano on the north-west coast. Rivers only run through the lowlands
(water in the game is sea level). See `WORLD` in `server/shared/world-gen.js`.

## 3. Progression: the Sleeper opens the world

- Each **open** region has a **chain of 5 requests** at the carvings ("steady" pace),
  carved one after another in a fixed order (the region's file). Ignore one and the same
  request comes back at the next dawn, after the usual penalty. Between chains (while a
  boss waits to be met), the stones ask random requests as before. Built in W8.
- Finishing the chain **calls that region's boss**. Beating the boss **opens the next
  region at dawn**. Fixed order (table above).
- Locked land is behind **the Veil**: a wall of thick fog. Walking in raises dread
  fast and turns you around (you come out facing back).
- **Opened stays open.** Regions never close again.

## 4. Controls and inventory

| Input | Does |
|---|---|
| Mouse | turns the camera (pointer lock), crosshair in the middle |
| Left click | attack / swing held tool; hold for a heavy swing |
| Right click | aim sling, cast rod (block with a shield later) |
| `I` | inventory: hotbar + 30-slot bag, cursor shown |
| `E` | use / collect into the bag; **hold E** with food selected to eat |
| Double-tap `Shift` | dodge roll (holding Shift still sprints) |
| `1`–`8`, `Q`, wheel | pick hotbar slot |
| `Esc` | frees the cursor, opens settings; click the game to continue |
| `F B J M G T V Enter` | unchanged (campfire, book, journal, map, drop, hood, sit, chat) |

- Any open panel frees the mouse and shows an ink-style cursor; closing it locks again.
  Chrome blocks re-locking for ~1 s after Esc, so show "Click to continue".
- Crosshair changes shape over usable (hand), hittable (blade) things.
- Phones keep drag-to-look and touch buttons.
- **Slots:** 8 hotbar + 30 bag. Stacks: materials 50, food 10, tools/weapons 1.
  Drag to move/merge/swap, Shift-click jumps bag↔hotbar, right-click takes half,
  drag out of the panel drops a sack. Phones: tap to pick up, tap to place; a **Half** button
  under the bag splits (P2 built buttons rather than hold-to-split: a long press fought with taps).
  Full bag: new items drop in a sack at your feet.
- **Tools and weapons are items** that take a slot. The selected tool is what you use;
  without the right one you use bare hands (slow, or can't). **Durability:** stone pickaxe
  60 uses, copper axe 120, bronze 150, iron 200, silver 250. Red at 20% with a warning.
  A broken tool vanishes and gives back one material. **Repair** at a lit hearth for half
  its materials. (P3 as built, behind its own flag `tools` since `slots` was already on: shovel
  80 uses; tools are kept through knockdowns and death, as tools always were.)
- **E collects** berries, coconuts and everything else into the bag (no eating on the
  spot). **Hold E ~1 s** on a food slot to eat; a ring fills round the crosshair.
  (P2: silverfin from the tide and bugs are still eaten on the spot for now; they're journal
  finds as well, and fishing (P7) will bring food of its own into the bag.)
- Existing inventories and owned tools move into slots automatically, nothing lost.

## 5. Fighting

- **Weapons:** axe and pickaxe count. New: **sword** (wooden → bronze → iron → silver →
  obsidian; three-hit combo, third hit knocks back), spear (reach), club (knockback),
  sling (throws stones from the bag). Silver does double damage to all the Stilled.
- **Attack** with left click at the crosshair, hold for a heavy swing (energy, staggers).
- **Dodge:** double-tap Shift, ~0.35 s untouchable, costs energy.
- **Every enemy attack is telegraphed** (ink shape on the ground, wind-up pose, sound)
  for at least 0.5 s. Damage only lands at the end of the wind-up, checked on the server.
- **Light as a weapon:** in lantern light or holding a torch, fog creatures are slower
  and take more damage. A thrown torch makes a short burst of fire.
- **Knocked down, not killed:** friends can pick you up within 20 s (hold E); otherwise
  you wake at your hearth checkpoint.
- **The Stilled can be broken into fog** but re-form later that night.
- (P6 as built so far: weapons wear out like tools; the bronze sword needs tin and the sling
  flax, both from the Stairs; silver and obsidian swords have stats but no recipes until their
  region packs; the attack key is R as well as the click, for anyone without mouse-look; the
  torch is thrown with a heavy swing while it's in hand, and the Stilled move at half speed
  towards someone in light.)

## 6. Hearth checkpoints

- Hold `V` next to your own lit hearth: your frog lies down curled, hood over its face;
  after 3 s the checkpoint is saved ("The fire will remember you."). Resting refills
  energy faster.
- Knocked down and not revived: wake at the checkpoint. Hearth out: you still wake there
  (cold, some dread). Hearth gone: the Landing.
- Map shows your checkpoint as a flag in your colour (legend entry); friends' flags fainter.
  A small pennant on the hearth in the world.
- Friends can share one hearth as a group camp.
- As built (P4): *sit* (`V`, which already sits you down) beside any lit clay hearth, yours or
  a friend's, rather than holding `V` by your own; after 3 s asleep it saves. Sleeping
  doubles energy regeneration. With no checkpoint, a knockdown leaves you where you fell (as
  before) and dying takes you to the Landing's beach. Friends reviving you (P6) comes first
  when it's built: this is where you go when nobody does.

## 7. Getting around

All kept: climbing (vines, trunks, cliffs; energy), cloak gliding, rafts (rivers, the Mire),
camps (checkpoints above), zip lines (player-built with vine rope), a map that fills in
where someone has walked (shared), calling out to friends (sound from your direction plus
a faint map mark for a minute).

(P10 as built: a raft is wood only and a zip line kit is wood and copper, so both can be made
on the Landing before vine rope exists; two frogs to a raft, the first paddles; zip lines run
from a higher post to a lower one, between 6 and 80 m; both stay in the world for anyone.)

**Fast travel between lit lanterns (paying oil):** kept (Thaqif, 1 Oct). Stand in a lit
lantern's light to remember it; at a lit lantern, travel to another lit one you remember, paying
1 lamp oil per 150 m (at least 1). Both ends must be lit, so it rewards keeping lanterns fed.

## 8. Caves

- **Built under the ground:** tunnels and chambers shaped from the seed, placed under the
  terrain with a hole at the mouth. No loading; friends see you go in.
- Real darkness (torch or lantern needed), cave-only finds, **the Dark** (dread builds
  without light or friends) instead of fog, ropes for shafts (stay for everyone), caves that
  change overnight when the Sleeper stirs, echoes (chat from underground is muffled outside).
- Sea caves only open at low tide and flood as it rises.
- As built (W9): the Landing's sea cave is under the low hill on the east shore. It dips below
  the sea on the way in, so it's shut at high tide and opens for a few minutes around each of
  the two low tides a day; the rising water pushes you back out onto the sand. Torches (wood
  and seeds) are the light you carry; they burn about five minutes underground. No fires
  underground. The Stilled don't follow you down; the Crawler (C2) will.
- **The Crawler** (cave creature): like the Stilled but 3× the size, long arms and legs,
  crawls on floors, walls and ceilings. Its scream bursts dread for everyone who hears it,
  shakes the screen and gives away where it is. Hunts by sound (running, chat, fighting).
  Backs off from bright light, flees fire, can't cross water. Touch: knockdown and a short
  drag deeper. Screams: Thaqif supplies clips (1–3 s, .ogg/.mp3, licence allows use, e.g.
  CC0) into `public/sfx/crawler/`; placeholder until then.
- As built (C2): one Crawler in the Landing's sea cave. It hangs from the roof and lurks; it
  hears running (25 m), calling (60 m) and chat (30 m), and anyone within 5 m. Its lunge is
  warned for 0.8 s; caught, you're knocked down and dragged about 8 m deeper. A lit torch
  within 4.5 m drives it back (so a torch is protection, not just light). No fires underground,
  so "flees fire" waits for thrown torches (P6). Clips: list their names in
  `public/sfx/crawler/list.json`.

## 9. The Stilled of each region

Same core rules everywhere (fog and night, knock down rather than kill). Each kind only
spawns in its region.

| Region | Kind | Ability | Weakness |
|---|---|---|---|
| Landing | The Stilled | close the gap while unwatched | being looked at, light |
| Stairs | The Leaning | only move with the wind; shove you down a terrace | shelter: walls, ruins, lee of stones |
| Wood | The Hung | hang from branches, drop on you, lift you | cut their vine; wind chimes give them away |
| Mire | The Drowned | rise in groups; grab holds you at wading speed, drags to deep water | can't leave water; fire dries them |
| Teeth | The Frozen | seen in blizzards; touch drains warmth | fire melts them; bare rock is safe |
| Ashen Shore | The Ashen | burning footprints | a thrown bucket of water |
| Hollow | The Dreaming | look like your friends on the map | calling out (real friends answer) |

Each kind gets a journal entry for surviving an encounter; its weakness goes in a spoiler
box on the Hidden Pages.

## 10. Region bosses

Shared rules: appears at the time and place the carvings name when the chain is done, and
a map marker shows it. Everyone within ~40 m takes part; health = base × (1 + 0.6 per extra
frog). 2–3 phases. If everyone is knocked down it leaves and returns at its next time with
full health. Beaten once per island; drops a cloak patch and a relic for everyone present;
an "echo" at the same spot lets latecomers earn the patch. Server state machine per boss,
saved in a `bosses` table so a restart resumes the fight.

| Region | Boss | When/where | The trick |
|---|---|---|---|
| Landing | The Tidewife (wreck crab) | lowest tide, east sands | hit the barnacle eyes when it rears; fire burns its kelp; beat it before the tide turns |
| Stairs | The Keeper of Steps (stone giant) | ruined village, dusk | touch the standing stone matching the symbol on its back to make it kneel |
| Wood | The Hanging Mother | canopy walkways, night | dodge its shadow; cut 3 vines to drop it; bright bugs/lanterns blind it |
| Mire | The Drowned Choir | drowned village, in fog | light reed braziers to split it; lay each figure to rest by its name at the name stones |
| Teeth | The White Ram | high snowfield, blizzard | bait its charges into rock walls; shelter from avalanches; fire keeps it back |
| Ashen Shore | The Cinder Eel | steam vents, midday | hit it when it surfaces; plug vents with stones; a bucket of water cools it |
| Hollow | The Sleeper's Dream | the eye pool | one phase per earlier boss; the ending choice follows (needs the story plan) |

## 11. What each region gives

| Region | Gather | Ore | Bugs | Fish | Crafts |
|---|---|---|---|---|---|
| Landing | today's list | copper, iron | today's list | silverfin, pool minnow, lantern fish | today's + rod, spear, sword |
| Stairs | flint, healing herbs, flax, old bricks | tin → **bronze** | stone beetle, wind moth, terrace grasshopper | mountain trout | bronze gear, herb poultice, flax rope |
| Wood | hardwood, resin, vine rope, strange fruit, giant leaves | amber | lantern beetle, glasswing, bark mantis | river catfish, glass carp | bow, resin torches, leaf glider, rafts |
| Mire | peat, reeds, mud, pearls | **bog iron** (no rust) | water strider, bog firefly, leech | mudfish, spotted eel, old pike | all-night peat fires, reed baskets (+bag slots), bog-iron gear |
| Teeth | ice, crystal, pine resin, hare fur | **silver** | snow moth, ice louse | ice char (ice hole) | silver weapons, fur-lined cloak (warmth), crystal lamps |
| Ashen Shore | obsidian, sulphur, glass sand | sunstone | ember beetle, ash cicada | hot-spring shrimp | obsidian blades, glass bottles, sunstone lantern (no oil) |
| Hollow | nothing | none | none | one fish in the eye pool | relics only |

Tiers: stone/wood → copper → bronze → iron → bog iron → silver → obsidian.
New stat in the Teeth: **warmth** (fire, hood, fur cloak help).

## 12. Fishing

1. Craft a rod (wood + vine rope + bone/copper hook). Optional bait (bugs, berries, worms).
2. Hold a rod, face water, hold `E` to charge the cast, release. Bobber floats.
3. Bite after 5–40 s (faster at night, in rain, rising tide, full moon). Walking away reels in.
4. Bobber dips: press `E` within 1 s to hook.
5. A **minigame** decides the catch. Lose: the line snaps, hooks can break.
6. Cook fish on a fire. Rare fish go in the journal (a fish page: where and when they bite).

(P7 as built: the rod is wood and copper; bait is made from berries and seeds and is taken by
each bite; the Landing has the silverfin (sea), the pool minnow (springs, uncommon) and the lantern
fish (sea, full-moon nights, rare); a cooked fish is one item whatever it was; the games keep
their own time limits rather than the table below.)

All five minigames are kept:
- **Island trivia:** 3–4 answers, from a `fishing_trivia` table (editable in Neon).
- **Untangle the line:** rotate tiles, 3×3 up to 5×5.
- **Ripple memory:** repeat carving symbols (teaches them for the Keeper of Steps).
- **Pull and ease:** keep a marker in a drifting zone (runs on the client; server checks timing).
- **Read the water:** spot three differences.

| Rarity | Game | Time |
|---|---|---|
| Common | easy, or none | 10–12 s |
| Uncommon | medium | 8–10 s |
| Rare | two hard games in a row | 6–8 s each |
| Strange | story trivia | 12 s |

The server picks the fish and builds the puzzle, and keeps the answer; the client only gets
the question. Friends nearby can press E once per catch for +1 s. New Sleeper requests can ask
for fish.

## 13. Open questions

- The Hollow and the ending need Thaqif's story plan.
- Crawler scream sounds: Thaqif is finding them.

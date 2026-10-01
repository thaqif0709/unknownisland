// Shared between the server (Node) and the browser.
// Island shape, deterministic prop placement, and the survival tuning numbers.
// In the browser this file sets `window.WorldGen`; in Node it is `require`d.
(function (root) {
  'use strict';

  // ================= Tuning =================
  let activeFeatures = null;   // feature flags once the server has said (see setFeatures)
  const RULES = {
    // Real seconds per in-game day: 20 minutes, 15 of daylight (sunrise to sunset,
    // including both) and 5 of night.
    // Time simply runs faster through the night. DAY_LEN is the whole cycle.
    DAYLIGHT_LEN: 900,       // 15 min
    NIGHT_LEN: 300,          // 5 min
    DAY_LEN: 1200,           // 20 min
    HUNGER_DRAIN: 0.28,      // per second while moving (standing still costs no hunger or thirst)
    THIRST_DRAIN: 0.42,
    STARVE_DMG: 1.6,         // per second each, when hunger or thirst is 0
    COLD_DMG: 0.6,           // per second at night away from a lit fire
    REGEN: 0.8,              // per second when fed, watered and unhurt
    REGEN_MIN: 35,
    START: { health: 100, hunger: 80, thirst: 70 },
    SPRING_WATER: 35,
    SEA_WATER: -4,
    COCONUT_FOOD: 18, COCONUT_WATER: 14, COCONUTS: 3,
    BERRY_FOOD: 12,
    ROCK_STONE: 2,           // hits before a stone is used up (1 stone per hit, 2 with a pickaxe)
    CHOPS: 3,                // chops for an original-size tree (1 wood per chop, 2 with an axe)
    ORE_HITS: 3,             // swings before an ore rock is used up (needs a pickaxe)
    DIG_CLAY: 2,             // clay from one dig patch (needs a shovel)
    TREE_REGROW_DAYS: 2,
    ROCK_REGROW_DAYS: 3,     // not in the original prototype; keeps a shared island from running out of stone
    ORE_REGROW_DAYS: 4,      // dig patches refill every morning
    WALK_SPEED: 4.6, WADE_SPEED: 2.6,
    REACH: 1.4,              // how close you must be to use an object (edge distance)
    SPRING_REACH: 3.4,
    // Flora sizes. Every plant has its own full-grown size between min and max
    // (1 = the original prototype size). Regrown trees and palms start as
    // saplings and grow to that size over growDays in-game days.
    FLORA: {
      tree: { min: 0.7, max: 1.5, growDays: 4 },
      palm: { min: 0.75, max: 1.35, growDays: 3 },
      bush: { min: 0.7, max: 1.3, growDays: 2 },
    },
    SAPLING: 0.2,            // a new sapling starts at this fraction of its full size
    FRUIT_AT: 0.6,           // bushes fruit once this grown; palms only when fully grown
    // Sprinting uses energy (0-100) and makes you hungry faster. Run out and
    // you're exhausted: slower, and no sprinting until energy is back to EXHAUST_RECOVER.
    SPRINT_MULT: 1.65,
    ENERGY_DRAIN: 20,        // per second while sprinting
    ENERGY_REGEN: 16,        // per second, after a short rest
    ENERGY_REST: 0.8,        // seconds without sprinting before energy comes back
    EXHAUST_RECOVER: 35,
    EXHAUSTED_MULT: 0.75,    // walking speed while exhausted
    SPRINT_HUNGER: 0.9,      // extra hunger per second while sprinting
    JUMP_ENERGY: 6,          // energy per normal hop; a full-charge leap (three times as high) costs three times as much
    // Dread (0-100) changes what you perceive. Per-second rates:
    DREAD: {
      FOG: 2.4,          // times the fog density where you stand
      DARK: 1,           // at night with no light nearby
      ALONE_NIGHT: .6,   // no friend within FRIEND_RADIUS, at night
      ALONE_DAY: .1,
      LIGHT: -5,         // warm by a fire (or lantern)
      DAY: -1.5,         // daylight, out of the fog
      FRIENDS: -1.5,     // a friend nearby
      EAT: -6,           // each time you eat
      FRIEND_RADIUS: 12,
      CAVE_DARK: 2.2,    // the Dark: deep in a cave with no light (yours or a friend's)
    },
    TORCH: { BURN: 300 },  // seconds a torch burns in your hand underground
    CALL: { GAP: 8, HEAR: 160, SHOW: 60 },  // calling out (P11): seconds between calls, metres it carries, seconds on the map
    KNOCK: { HEALTH: 20, DREAD: 25, DROP: .5, DOWN_MS: 3000 },
    // Old stone lanterns. Oil keeps them lit; lit, they clear the fog around them.
    LANTERN: {
      FUEL_PER_OIL: 2400, MAX_FUEL: 9600,  // seconds (a day is 1200): one oil lasts about two days
      RADIUS: 14, BIG_RADIUS: 24,          // fog cleared around a lit lantern
      BIG_OFFERINGS: 3,                    // different frogs needed to light a great lantern
      // The fog fights back: a cold lantern's clearing shrinks in steps over
      // RECLAIM_DAYS; long-held clearings burn more oil; the Drowning Moon drains all.
      RECLAIM_DAYS: 2, RECLAIM_STEPS: 4,
      HELD_PER_DAY: .25, HELD_MAX: 1.5,    // +25% burn per day held clear, up to +150%
      DROWNING_MULT: 2,
      SWALLOW_CHANCE: .35,                 // chance each thing in a reclaimed clearing is taken
    },
    SEED_CHANCE_DIG: .35,
    MOON_CYCLE: 8,                          // days; phase 0 is the Drowning Moon, 4 is full
    WEATHER: {
      WEIGHTS: { clear: 6, rain: 3, storm: 1, fogstorm: 1 },
      FOGSTORM_MIN_DAY: 3,
      RAIN_WATER: .4,                       // thirst refilled per second while it rains
      RAIN_LIGHT: .7,                       // fire and lantern light shrink in rain
      STORM_TIDE: 1.6,                      // more wash-ups the morning after a storm
    },
    PATCH_SLOTS: 3,
    // Buckets: carry seawater, boil it clean on a fire, drink it. uses = boils
    // before it wears out; boil = seconds on a burning fire.
    BUCKET: { wood: { uses: 5, boil: 75 }, iron: { uses: 20, boil: 45 }, DRINKS: 3, DRINK: 30, MAX: 4 },
    // The Sleeper: requests carved on the stones. Days to answer, and what its moods do.
    SLEEPER: { DAYS: 3, CALM_TOP: 1.5, PRESS_TOP: 4, PRESS_BURN: 1.5, FOG_WALK: .7, GATHER_RADIUS: 6, REACH: 2.2 },
    // Feature flags: unfinished work can be merged to main while switched off.
    // Add `name: false` when a task starts and set it to true in the task's last PR.
    // On the server the FEATURES env var overrides these ("slots,combat" or "-slots").
    // See docs/roadmap/CONTRACTS.md section 1.
    FEATURES: {
      chains: false,     // W8: Sleeper request chains per region (goes live with the first boss)
      streaming: false,  // W2: send and run only the chunks of new land near players
      bigworld: false,   // W4: the 5 km world around the Landing (needs streaming on too)
      farview: false,    // W3: see out to about 2 km (1 km on phones)
      caves: false,      // W9: caves you walk into (the Landing's sea cave), torches and the Dark
      checkpoints: false, // P4: sleep by a lit hearth to wake there after a knockdown or dying
      travel: true,      // P9 climbing (palm trunks, cliffs) and gliding with the cloak
      fishing: false,    // P7 fishing, with P8's minigames (only admins' /minigame until fishing lands)
      mouselook: true,   // P1: the mouse turns the camera (pointer lock), crosshair, ink cursor, wheel cycles slots
      slots: true,       // P2: 8 hotbar slots and a 30-slot bag (I), stacks, dragging; berries and coconuts are carried, to eat later
      fasttravel: false, // W10: travel between lit lanterns you've stood by, paying lamp oil
      tools: false,      // P3: tools are items in the bag, used from your hand, that wear out (needs slots)
      'region-stair': false,   // C3: the Stairs' own things (flint, herbs, flax, ruins, standing stones, tin), bugs, the Leaning, the old mine, its request chain
    },
    // Creative mode, for testing only: admins (the ADMINS env var) type /creative in chat,
    // then double-tap Space to fly. Speeds in m/s; walking is WALK_SPEED.
    CREATIVE: {
      FLY_SPEED: 30,           // across, where the camera looks
      RISE_SPEED: 14,          // up (Space) and down (Shift)
      MAX_HEIGHT: 200,         // above the ground or the sea
    },
    // Tools that wear out (P3, flag tools): how many uses each lasts, when it warns you (a share
    // of its uses left), and what a repair at a lit hearth costs (a share of its recipe).
    TOOLS: {
      USES: { shovel: 80, pickaxe: 60, axe: 120, ironpick: 200 },
      WARN: .2,
      REPAIR: .5,
    },
    // The slot inventory (P2, flag slots). Stack sizes per kind of item are in ITEM_INFO.
    SLOTS: {
      HOTBAR: 8,               // slots 0-7, keys 1-8
      BAG: 30,                 // slots 8-37, the bag on I
      STACK: 50,               // most things stack this high
      FOOD_STACK: 10,          // food
      EAT_TIME: 1,             // seconds holding E (or Act) with food or clean water in hand to eat or drink it
      EAT_GAP: .45,            // seconds between two bites or sips, at least (well under EAT_TIME: messages can bunch up on a slow connection)
    },
    // Climbing and gliding (P9, flag travel). Speeds in m/s, energy per second.
    // Travelling between lit lanterns (W10, flag fasttravel): stand in a lit lantern's light
    // to remember it; from one you remember, travel to another, paying oil by distance.
    LANTERN_TRAVEL: { PER_OIL: 150, MIN_OIL: 1 },   // metres per oil, and at least this much
    TRAVEL: {
      CLIMB_SPEED: 1.6,        // up or down a trunk or a cliff
      CLIMB_ENERGY: 9,         // while moving on it
      HANG_ENERGY: 3,          // while hanging still
      SLIDE_SPEED: 3,          // sliding down when your energy runs out
      CLIFF_SLOPE: 1.6,        // ground steeper than this (rise over run, about 58°) is a cliff: climb it, you can't walk up it
      TRUNK_REACH: .75,        // how close to a climbable trunk you must be to grab it
      GLIDE_SPEED: 6,          // forward drift while gliding
      GLIDE_FALL: 1.5,         // how fast you sink while gliding
      GLIDE_ENERGY: 7,
      GLIDE_MIN_HEIGHT: 2.2,   // above the ground: lower than this and the cloak can't catch the air
      MAX_HEIGHT: 40,          // highest anyone can be shown at (a tall trunk, a glide off a cliff)
    },
    // The Stilled: pale figures that only exist in fog, and only move unwatched.
    STILLED: {
      PER_PLAYER: 2, ALONE_EXTRA: 1, DREAD_EXTRA: 1, MAX: 12,
      SPEED: 2.4,              // walking is 4.6, so you can outpace them
      FOG_MIN: .35,            // they cannot step where fog is thinner than this
      SPAWN_MIN: 22, SPAWN_MAX: 42,
      VIEW_HALF_ANGLE: .85,    // radians either side of a player's camera direction
      VIEW_RANGE: 60,
      NOTICE: 10, NOTICE_PER_DREAD: .4, NOTICE_ALONE: 8,
      REACH: 1.1, KNOCK_COOLDOWN_MS: 20000,
      NEAR_DREAD: 3, NEAR_RADIUS: 15,   // dread per second while one is close
    },
  };

  // Things you can carry (inventory keys and their names).
  const ITEMS = { wood: 'Wood', stone: 'Stone', clay: 'Clay', copper: 'Copper ore', iron: 'Iron ore', seeds: 'Seeds', oil: 'Lamp oil', torch: 'Torch',
    berries: 'Berries', coconut: 'Coconut',
    shovel: 'Shovel', pickaxe: 'Stone pickaxe', axe: 'Copper axe', ironpick: 'Iron pickaxe',   // (tools: items with the tools flag, P3)
    flint: 'Flint', herbs: 'Healing herbs', flax: 'Flax', bricks: 'Old bricks', tin: 'Tin ore' };   // (the last five: the Stairs, C3)
  // More about an item than its name (all optional): kind 'food' is eaten from a slot (food,
  // water: how much it gives), stack is how many fit in one slot (RULES.SLOTS.STACK otherwise).
  const ITEM_INFO = {
    berries: { kind: 'food', food: RULES.BERRY_FOOD },
    coconut: { kind: 'food', food: RULES.COCONUT_FOOD, water: RULES.COCONUT_WATER },
    torch: { stack: 10 },
    // tools (P3, flag tools): one to a slot; `tool` is what they're for, `returns` what a broken one leaves
    shovel: { kind: 'tool', tool: 'shovel', returns: 'stone' },
    pickaxe: { kind: 'tool', tool: 'pick', returns: 'stone' },
    ironpick: { kind: 'tool', tool: 'pick', returns: 'iron' },
    axe: { kind: 'tool', tool: 'axe', returns: 'copper' },
  };
  const itemInfo = key => {
    const i = ITEM_INFO[key] || {};
    if (i.kind === 'tool') return { ...i, stack: 1, uses: RULES.TOOLS.USES[key] };
    return { ...i, stack: i.stack || (i.kind === 'food' ? RULES.SLOTS.FOOD_STACK : RULES.SLOTS.STACK) };
  };

  // Things that stand in a region's land besides trees, bushes, rocks and ore (C3 and the other
  // region packs): what they start as, how many days until they grow back once used up
  // (0: never), and how big they are. What E does to them is in server/systems/<region>.js,
  // how they look in public/js/<region part> (UI.things).
  const THINGS = {
    flint: { state: { left: 2 }, regrow: 3, r: .4 },        // flint nodules in the turf (the Stairs)
    herb: { state: { picked: false }, regrow: 1, r: .3 },    // healing herbs
    flax: { state: { picked: false }, regrow: 2, r: .35 },   // blue-flowered flax
    ruin: { state: { left: 3 }, regrow: 6, r: 1.2 },         // a tumbledown wall of old bricks
    standing: { state: {}, regrow: 0, r: .6 },              // a standing stone (shelter from the wind)
  };

  // Things you can build. Add new entries here; the recipe book lists them all.
  // kind 'fire' places a fire of that type in front of you; kind 'tool' is kept forever.
  const RECIPES = [
    { id: 'campfire', kind: 'fire', name: 'Campfire', cost: { wood: 4, stone: 3 },
      desc: 'Keeps you warm at night. Stand close to it, and feed it wood to keep it burning.' },
    { id: 'shovel', kind: 'tool', name: 'Shovel', cost: { wood: 3, stone: 2 },
      desc: 'Dig up clay from the soft dirt patches.' },
    { id: 'pickaxe', kind: 'tool', name: 'Stone pickaxe', cost: { wood: 3, stone: 3 },
      desc: 'Mine copper and iron from ore rocks, and break stone twice as fast.' },
    { id: 'hearth', kind: 'fire', name: 'Clay hearth', cost: { wood: 4, stone: 4, clay: 3 },
      desc: 'A bigger fire. Warms a wider circle and burns twice as long.' },
    { id: 'axe', kind: 'tool', name: 'Copper axe', cost: { wood: 2, copper: 3 },
      desc: 'Two wood from every chop.' },
    { id: 'ironpick', kind: 'tool', name: 'Iron pickaxe', cost: { wood: 2, iron: 3 }, needs: 'pickaxe',
      desc: 'Twice the ore from every swing. Needs a stone pickaxe to make.' },
    { id: 'bucket_wood', kind: 'bucket', mat: 'wood', name: 'Wooden bucket', cost: { wood: 6 },
      desc: 'Fill it in the sea, set it on a fire, and the water boils clean to drink. Lasts 5 boils; boils in about 75 seconds.' },
    { id: 'bucket_iron', kind: 'bucket', mat: 'iron', name: 'Iron bucket', cost: { wood: 2, iron: 4 },
      desc: 'Like the wooden one, but lasts 20 boils and heats faster (about 45 seconds).' },
    { id: 'oil', kind: 'item', name: 'Lamp oil', cost: { seeds: 3 }, gives: { oil: 1 },
      desc: 'Pressed from seeds. An offering for the old stone lanterns: one lights a lantern for about two days.' },
    { id: 'torch', kind: 'item', name: 'Torch', cost: { wood: 2, seeds: 1 }, gives: { torch: 1 }, flag: 'caves',
      desc: 'A stick wrapped in seed-oil rags. Hold it for light underground, where it burns for about five minutes.' },
  ];

  // Cloak patches: stitched from things you have found. Each helps, and costs.
  const PATCHES = [
    { key: 'moon_wing', name: 'Moon moth wing', needs: 'moon_moth', perk: 'You see further in the fog.', cost: 'Dread rises faster.' },
    { key: 'violet_charm', name: 'Violet glass charm', needs: 'glass_violet', perk: 'Lamp oil you offer burns half again as long.', cost: 'The dark frightens you more.' },
    { key: 'firefly_jar', name: 'Firefly jar', needs: 'firefly', perk: 'A small light of your own that pushes the fog back.', cost: 'The Stilled notice you from further away.' },
    { key: 'silverfin_scale', name: 'Silverfin scale', needs: 'silverfin', perk: 'Fires warm you from further away.', cost: 'The Stilled notice you more easily.' },
    { key: 'conch_charm', name: 'Conch charm', needs: 'conch', perk: 'Friends calm you twice as much.', cost: 'You get hungry faster.' },
  ];
  const MOON_NAMES = ['Drowning Moon', 'thin crescent', 'half moon', 'swelling moon', 'full moon', 'waning moon', 'half moon', 'old crescent'];
  // day 1 is a full moon (a gentle first night); the first Drowning Moon is day 5
  const moonPhase = day => ((day + 3) % RULES.MOON_CYCLE + RULES.MOON_CYCLE) % RULES.MOON_CYCLE;

  // Fire types: warmth radius, how fast they burn (1 = one fuel per second), fuel.
  const FIRES = {
    // burn is fuel per real second (scaled to the 20-minute day: a fresh campfire lasts most of a night)
    campfire: { warm: 5.5, burn: 0.2, start: 110, add: 55, max: 200 },
    hearth: { warm: 8, burn: 0.1, start: 160, add: 70, max: 300 },
  };

  const isNight = t => t < 0.22 || t >= 0.8;
  // Clock speed (day-fraction per real second): night covers .42 of the dial in
  // NIGHT_LEN seconds, daylight .58 in DAYLIGHT_LEN.
  const tRate = t => isNight(t - Math.floor(t)) ? .42 / RULES.NIGHT_LEN : .58 / RULES.DAYLIGHT_LEN;
  const nextEdge = f => f < .22 ? .22 : f < .8 ? .8 : 1;
  // Move the clock t (days, unbounded) forward by sec real seconds.
  function advanceT(t, sec) {
    const whole = Math.floor(sec / RULES.DAY_LEN);   // full days first
    t += whole; sec -= whole * RULES.DAY_LEN;
    while (sec > 0) {
      const f = t - Math.floor(t), r = tRate(t), d = nextEdge(f) - f, need = d / r;
      if (sec < need) return t + sec * r;
      t += d + 1e-9; sec -= need;
    }
    return t;
  }
  // Real seconds until the clock next reaches target (0-1) from t.
  function secondsUntil(t, target) {
    let f = t - Math.floor(t), sec = 0, left = ((target - f) % 1 + 1) % 1;
    while (left > 1e-9) {
      const edge = nextEdge(f), d = Math.min(edge - f, left), r = tRate(f);
      sec += d / r; left -= d; f = edge >= 1 && d === edge - f ? 0 : f + d;
    }
    return sec;
  }
  // 0 by day, 1 at night, easing in through dusk and out through dawn.
  function nightFactor(t) {
    if (t >= .74 && t < .82) return smoothstep(.74, .82, t);
    if (t >= .82 || t < .2) return 1;
    if (t < .28) return 1 - smoothstep(.2, .28, t);
    return 0;
  }
  function smoothstep(a, b, x) { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); }
  function phaseName(t) {
    if (isNight(t)) return 'night';
    if (t < 0.3) return 'dawn'; if (t < 0.45) return 'morning'; if (t < 0.62) return 'midday';
    if (t < 0.72) return 'afternoon'; return 'dusk';
  }

  // ================= Noise & island shape =================
  function hash2(x, z) { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z) { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2; a *= .5; } return s; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  // ================= The island =================
  // A big island: a mountain in the north, several hills, forests and meadows in
  // the lowlands, highlands with pines, and a few springs in sheltered basins.
  // East is +x, north is -z.
  const ISL = 170;
  const HILLS = [
    { x: 30, z: -62, h: 24, r: 34 },    // the big hill
    { x: -72, z: -24, h: 11, r: 24 },
    { x: 84, z: 26, h: 9, r: 22 },
    { x: -34, z: 74, h: 7, r: 20 },
    { x: 8, z: -122, h: 12, r: 22 },
    { x: -112, z: 52, h: 8, r: 18 },
    { x: 118, z: -58, h: 10, r: 20 },
  ];
  // The main spring is south of the big hill ("past the rocks, south of the big hill").
  const SPRINGS = [{ x: 24, z: -14 }, { x: -60, z: 22 }, { x: 70, z: -100 }, { x: -20, z: 120 }];
  const SPRING = SPRINGS[0];
  const nearestSpring = (x, z) => SPRINGS.reduce((b, s) => Math.hypot(x - s.x, z - s.z) < Math.hypot(x - b.x, z - b.z) ? s : b);

  // The Landing's ground: today's island, exactly as it has always been.
  function landingHeightAt(x, z) {
    // coves and headlands: big slow wobble plus a medium one, and a few carved bays
    const ang = Math.atan2(z, x);
    const warp = (fbm(x * .008 + 10, z * .008) - .47) * 110 + (fbm(x * .028 + 3, z * .028) - .47) * 30
      + Math.max(0, Math.sin(ang * 3 + 1.2)) ** 6 * 38 + Math.max(0, Math.sin(ang * 5 - .4)) ** 10 * 26;
    const d = Math.hypot(x, z) + warp;
    const island = 1 - d / ISL;
    let h;
    if (island > 0) {
      const inland = smooth(0, .2, island);                         // steep beaches, then rolling land
      h = .35 + island * 5 * inland + island * 2 + (fbm(x * .03, z * .03) - .35) * 5 * inland + (fbm(x * .1, z * .1) - .5) * 1.2 * inland;
      for (const hl of HILLS) h += hl.h * Math.exp(-((x - hl.x) ** 2 + (z - hl.z) ** 2) / (hl.r * hl.r)) * inland;
    } else h = .35 + island * 16;
    for (const s of SPRINGS) {                                        // sheltered basins with a pool
      const sd = Math.hypot(x - s.x, z - s.z);
      const k = smooth(9, 4.5, sd); h = h * (1 - k) + 2.2 * k;
      const k2 = smooth(2.6, 1.2, sd); h = h * (1 - k2) + 1.65 * k2;
    }
    return Math.max(h, -6);
  }

  // ================= The wider world (task W4, flag `bigworld`) =================
  // The Landing stays at the origin, untouched. The rest of the 5 km world lies north of it
  // (x east, z south, metres): the Stairs straight north across a sandy neck, the Weeping
  // Wood to the north-east, the Mire to the north-west, the Hollow's crater further north,
  // the Teeth beyond it, and the Ashen Shore's volcano on the north-west coast.
  const WORLD = [
    { id: 'stair', x: 0, z: -1250, r: 760 },
    { id: 'wood', x: 1400, z: -1350, r: 850 },
    { id: 'mire', x: -1350, z: -1150, r: 850 },
    { id: 'hollow', x: 200, z: -2350, r: 330 },
    { id: 'teeth', x: 350, z: -3150, r: 1000 },
    { id: 'ash', x: -1300, z: -2750, r: 700 },
  ];
  const LANDING_R = 300;                  // inside this, only the Landing's own ground (and the neck)
  const NECK = [[0, -150], [0, -640]];    // the sandy neck from the Landing's north shore to the Stairs
  const RIVERS = [
    [[950, -2350], [1300, -1850], [1250, -1300], [1600, -900], [2150, -650]],   // through the Weeping Wood to the east coast
    [[-900, -1850], [-1200, -1300], [-1500, -900], [-1950, -600]],               // through the Mire
  ];
  function segDist(x, z, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  }
  function polyDist(x, z, pts) { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i - 1], pts[i])); return d; }
  // How high each region's land stands (metres above the shore), before coasts and rivers.
  function regionProfile(id, x, z, dd, n, ridge) {
    switch (id) {
      case 'stair': {   // terraces climbing north, from the shore up to about 220 m
        const H = 12 + 208 * clamp((-z - 380) / 1350, 0, 1) + (n - .5) * 24, step = 9, q = H / step, f = q - Math.floor(q);
        return (Math.floor(q) + smooth(.7, 1, f)) * step;
      }
      case 'wood': return 35 + (n - .5) * 70 + ridge * 25;
      case 'mire': return 1.4 + (n - .5) * 3 - 2.8 * smooth(.56, .64, fbm(x * .018 + 9, z * .018 - 4));   // flat and wet, with pools
      case 'hollow': return dd < .75 ? 90 + 150 * smooth(.35, .75, dd) : 240 - 200 * smooth(.75, 1.2, dd);   // a crater
      case 'teeth': return 180 + 420 * ridge ** 1.6 * (1 - smooth(.55, 1, dd)) + (n - .5) * 60;   // peaks to about 600 m
      case 'ash': return 12 + 85 * Math.exp(-((dd / .45) ** 2)) - (dd < .08 ? 30 * (1 - dd / .08) : 0) + (n - .5) * 10;   // an old volcano
    }
    return 0;
  }
  // The sandy neck: 0.4 m where it leaves the Landing, rising to about 4 m at the Stairs.
  function neckHeight(x, z) {
    const nd = segDist(x, z, NECK[0], NECK[1]) + (fbm(x * .03, z * .03) - .5) * 20, k = 1 - nd / 38;
    if (k <= 0) return -6;
    return .35 + (.07 + 3.6 * clamp((-z - 150) / 490, 0, 1)) * smooth(0, .4, k);
  }
  // Region shapes are measured in warped space, so coasts and borders wander instead of
  // being circles and straight lines.
  const warpX = (x, z) => x + (fbm(x * .0011 + 3, z * .0011) - .5) * 800 + (fbm(x * .006 + 9, z * .006) - .5) * 140;
  const warpZ = (x, z) => z + (fbm(x * .0011, z * .0011 + 8) - .5) * 800 + (fbm(x * .006, z * .006 - 5) - .5) * 140;
  function mainlandHeightAt(x, z) {
    const n = fbm(x * .0035 + 40, z * .0035 - 20), ridge = 1 - Math.abs(2 * fbm(x * .006 - 11, z * .006 + 5) - 1);
    const wx = warpX(x, z), wz = warpZ(x, z);
    let wsum = 0, hsum = 0, mask = -1;
    for (const R of WORLD) {
      const dd = Math.hypot(wx - R.x, wz - R.z) / R.r;
      mask = Math.max(mask, 1 - dd / 1.3);
      const w = Math.max(0, 1 - dd / 1.6) ** 3;
      if (w > 0) { wsum += w; hsum += w * regionProfile(R.id, x, z, dd, n, ridge); }
    }
    mask += (fbm(x * .004 + 7, z * .004 + 3) - .47) * .3;   // a ragged coast
    let h = mask > 0 && wsum > 0 ? .35 + (hsum / wsum) * smooth(0, .14, mask) : .35 + mask * 60;
    h = Math.max(h, neckHeight(x, z));
    for (const r of RIVERS) {   // river valleys: a 10 m bed just below the water, walls rising out
      const rd = polyDist(x, z, r) + (fbm(x * .02 + 1, z * .02) - .5) * 14;
      if (rd < 500) h = Math.min(h, -.4 + Math.max(0, rd - 10) * .13);
    }
    return Math.max(h, -6);
  }
  const bigOn = () => !!(activeFeatures || RULES.FEATURES).bigworld;
  // The ground height anywhere. With the big world off it's just the Landing.
  function heightAt(x, z) {
    if (!bigOn()) return landingHeightAt(x, z);
    const dl = Math.hypot(x, z);
    if (dl >= 420) return mainlandHeightAt(x, z);
    // Near the Landing, its land (even wet beach) keeps its exact height; only water is filled in.
    const L = landingHeightAt(x, z);
    if (L >= .05) return L;
    return Math.max(L, dl < LANDING_R ? neckHeight(x, z) : mainlandHeightAt(x, z));
  }
  // Which region a spot is in (land only; the neck belongs to the Landing).
  function worldRegionAt(x, z) {
    if (Math.hypot(x, z) < LANDING_R + 40 || (z > -370 && neckHeight(x, z) > 0)) return 'landing';   // the neck, up to the Stairs' shore
    const wx = warpX(x, z), wz = warpZ(x, z);
    let best = 'landing', bd = 1e9;
    for (const R of WORLD) { const dd = Math.hypot(wx - R.x, wz - R.z) / R.r; if (dd < bd) { bd = dd; best = R.id; } }
    return best;
  }

  // ================= Fog =================
  // The fog is the antagonist. It always sits over the deep sea; at dusk it
  // rises from the sea like a tide, filling low ground and valleys first; on a
  // normal night it covers the lowlands (the hills stay clear); at dawn it
  // drains away. Light (fires, lanterns) cuts clear circles out of it.
  // env: { drowning: bool (thickest nights), fogStorm: bool (fog by day) }
  // calm: the Sleeper holds its dreams back for a night; press: it pushes them harder.
  function fogFront(t, env = {}) {
    let top = env.drowning ? 40 : 7.5;
    if (env.calm) top = RULES.SLEEPER.CALM_TOP;
    else if (env.press) top += RULES.SLEEPER.PRESS_TOP;
    return -2 + (top + 2) * nightFactor(t) + (env.fogStorm && !env.calm ? 9 : 0);
  }
  // lights: [{ x, z, r }] clear radius r
  function fogAt(x, z, h, t, lights = [], env = {}) {
    const front = fogFront(t, env);
    let f = Math.max(smoothstep(-1.5, -4.5, h), smoothstep(front + 2.5, front - 1.5, h));
    for (const L of lights) f *= smoothstep(L.r * .8, L.r * 1.5, Math.hypot(x - L.x, z - L.z));
    return Math.max(0, Math.min(1, f));
  }

  // Old stone lanterns, spread across the land. The great ones stand on high
  // ground and need several frogs to light. Ids are the index in this list.
  const lanternCache = new Map();
  function generateLanterns(seed) {
    if (lanternCache.has(seed)) return lanternCache.get(seed);
    const rng = mulberry32((seed ^ 0x1A7E2B) >>> 0), out = [];
    const ok = (x, z) => {
      const h = landingHeightAt(x, z), b = landingBiomeAt(x, z, h);
      return h > 1.3 && b !== 'spring' && b !== 'beach' && out.every(l => Math.hypot(l.x - x, l.z - z) > 30);
    };
    // one by the south beach where everyone arrives, one at the main spring
    const fixed = [[SPAWN.x + 6, SPAWN.z - 22], [SPRING.x + 8, SPRING.z + 5]];
    for (const [x0, z0] of fixed) {
      for (let r = 0; r < 12; r += 1) { const x = x0 + (rng() - .5) * r, z = z0 + (rng() - .5) * r; if (ok(x, z)) { out.push({ x, z }); break; } }
    }
    for (let tries = 0; tries < 6000 && out.length < 26; tries++) {
      const x = (rng() - .5) * ISL * 2.2, z = (rng() - .5) * ISL * 2.2;
      if (ok(x, z)) out.push({ x, z });
    }
    // the highest few become great lanterns
    const byHeight = out.map((l, i) => [landingHeightAt(l.x, l.z), i]).filter(x => x[1] >= fixed.length).sort((a, b) => b[0] - a[0]);   // the first two stay small
    const big = new Set(byHeight.slice(0, 4).map(x => x[1]));
    const list = out.map((l, i) => ({ id: i, x: +l.x.toFixed(2), z: +l.z.toFixed(2), big: big.has(i) }));
    lanternCache.set(seed, list);
    return list;
  }

  // Carving stones: where the Sleeper speaks. One by the beach camp, one at the
  // main spring, one on the highest ground. Ids are the index in this list.
  const carvingCache = new Map();
  function generateCarvings(seed) {
    if (carvingCache.has(seed)) return carvingCache.get(seed);
    const L = generateLanterns(seed), rng = mulberry32((seed ^ 0x51EE9) >>> 0);
    const free = (x, z) => landingHeightAt(x, z) > 1.2 && L.every(l => Math.hypot(l.x - x, l.z - z) > 3.5);
    const near = (x0, z0) => { for (let r = 0; r < 14; r += .5) { const a = rng() * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; if (free(x, z)) return [x, z]; } return [x0, z0]; };
    let best = [0, 0], bh = -1;   // the highest walkable point (coarse search)
    for (let x = -ISL; x <= ISL; x += 4) for (let z = -ISL; z <= ISL; z += 4) { const h = landingHeightAt(x, z); if (h > bh && h < 24) { bh = h; best = [x, z]; } }
    const spots = [['shore', ...near(L[0].x - 3.5, L[0].z + 2.5)], ['spring', ...near(SPRING.x - 7, SPRING.z - 5)], ['ridge', ...near(best[0] + 3, best[1] + 3)]];
    const list = spots.map(([key, x, z], id) => ({ id, key, x: +x.toFixed(2), z: +z.toFixed(2), face: Math.atan2(SPAWN.x - x, SPAWN.z - z) }));
    carvingCache.set(seed, list);
    return list;
  }

  // Biomes: what grows where.
  const forestMask = (x, z) => fbm(x * .022 + 3, z * .022 - 7);
  function biomeAt(x, z, h = heightAt(x, z)) {
    if (!bigOn() || Math.hypot(x, z) < LANDING_R) return landingBiomeAt(x, z, h);
    if (h < .05) return 'sea';
    if (h < .95) return 'beach';
    switch (worldRegionAt(x, z)) {   // placeholders until each region pack brings its own ground
      case 'stair': return h > 160 ? 'highland' : 'meadow';
      case 'wood': return 'forest';
      case 'teeth': return h > 420 ? 'peak' : 'highland';
      case 'hollow': return 'highland';
      case 'ash': return 'beach';
      case 'mire': return h > 30 ? 'highland' : forestMask(x, z) > .55 ? 'forest' : 'meadow';
    }
    return landingBiomeAt(x, z, h);
  }
  // The Landing's biomes, as they have always been.
  function landingBiomeAt(x, z, h) {
    if (h < .05) return 'sea';
    if (h < .95) return 'beach';
    if (Math.hypot(x - nearestSpring(x, z).x, z - nearestSpring(x, z).z) < 9) return 'spring';
    if (h > 17) return 'peak';
    if (h > 10) return 'highland';
    return forestMask(x, z) > .5 ? 'forest' : 'meadow';
  }

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Spawn on the south beach.
  function findSpawn() {
    for (let r = ISL + 60; r > 0; r -= .3) { const x = 3, z = r; if (landingHeightAt(x, z) > .55) return { x, z: z - 1 }; }
    return { x: 0, z: 0 };
  }
  const SPAWN = findSpawn();

  // Deterministic prop placement. The index in the returned array is the
  // object's id (world_objects.obj_id), so this order must never change for
  // an existing island. Visual details are not drawn from this RNG; the client
  // derives them from the object's id instead.
  const genCache = new Map();
  function generateObjects(seed) {
    if (genCache.has(seed)) return genCache.get(seed).map(o => ({ ...o }));
    const rng = mulberry32(seed);
    const objects = [];
    const CELL = 8, grid = new Map();                                 // spatial hash for spacing checks
    const cellKey = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    function blocked(x, z, pad) {
      if (SPRINGS.some(s => Math.hypot(x - s.x, z - s.z) < 4.2 + pad) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4 + pad) return true;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const list = grid.get((cx + i) + ',' + (cz + j));
        if (list && list.some(o => Math.hypot(o.x - x, o.z - z) < o.r + pad + .6)) return true;
      }
      return false;
    }
    function place(type, count, test, extra, pad = .8) {
      let tries = 0;
      while (count > 0 && tries++ < count * 400) {
        const x = (rng() - .5) * ISL * 2.3, z = (rng() - .5) * ISL * 2.3, h = landingHeightAt(x, z);
        if (!test(h, landingBiomeAt(x, z, h), x, z) || blocked(x, z, pad)) continue;
        const o = { id: objects.length, type, x: +x.toFixed(2), z: +z.toFixed(2), r: .5 };
        if (type === 'palm') o.r = .35;
        else if (type === 'bush') o.r = .6;
        else if (type === 'rock') { o.s = +(.8 + rng() * .9).toFixed(3); o.r = +(.55 * o.s).toFixed(3); }
        else if (type === 'ore') { o.s = +(1 + rng() * .5).toFixed(3); o.r = +(.6 * o.s).toFixed(3); }
        else if (type === 'dig') o.r = .45;
        Object.assign(o, extra);
        objects.push(o); count--;
        const k = cellKey(o.x, o.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
      }
    }
    place('palm', 330, (h, b) => b === 'beach' ? h > .45 : b === 'meadow' && h < 2.6);
    place('tree', 560, (h, b) => b === 'forest', null, .5);
    place('tree', 90, (h, b) => b === 'meadow');
    place('tree', 200, (h, b) => b === 'highland');
    place('bush', 280, (h, b) => b === 'meadow' || b === 'forest' || b === 'spring');
    place('rock', 320, (h, b) => b !== 'sea' && h > .4);
    place('ore', 70, (h, b) => b === 'highland' && h < 15, { ore: 'copper' });
    place('ore', 40, (h, b) => (b === 'highland' || b === 'peak') && h > 13, { ore: 'iron' });
    place('dig', 170, (h, b) => b === 'meadow' || b === 'beach' || b === 'spring');
    // Full-grown sizes and species come from a hash of the id, not from `rng`.
    for (const o of objects) {
      if (RULES.FLORA[o.type]) o.maxScale = maxScaleFor(seed, o);
      o.species = speciesOf(seed, o);
      // the taller palms have trunks you can climb (task P9); only used with the travel flag on
      if (o.type === 'palm' && o.maxScale >= 1.2) o.climb = true;
    }
    genCache.set(seed, objects);
    return objects.map(o => ({ ...o }));
  }

  function hashOf(seed, id, salt) { return mulberry32((seed * 73856093) ^ (id * 19349663) ^ salt)(); }

  // Species depend on where things grow.
  function speciesOf(seed, o) {
    const h = heightAt(o.x, o.z), b = biomeAt(o.x, o.z, h), r = hashOf(seed, o.id, 0x2c1b3c6d);
    if (o.type === 'tree') return b === 'highland' || b === 'peak' ? 'pine' : r < (b === 'meadow' ? .45 : .15) ? 'blossom' : 'oak';
    if (o.type === 'rock') return b === 'beach' ? 'pebble' : b === 'forest' || b === 'spring' || r < .15 ? 'mossy' : 'granite';
    if (o.type === 'bush') return r < .3 ? 'blueberry' : 'berry';
    if (o.type === 'ore') return o.ore;
    return o.type;
  }

  function maxScaleFor(seed, o) {
    const f = RULES.FLORA[o.type];
    const r = hashOf(seed, o.id, 0x5bd1e995);
    return +(f.min + (f.max - f.min) * r).toFixed(3);
  }

  // How grown a plant is, 0.2 (sapling) to 1 (full size). `state.planted` is
  // the in-game day it sprouted; plants without it are fully grown.
  function growth(type, state, day, time) {
    const f = RULES.FLORA[type];
    if (!f || state.planted == null) return 1;
    const age = day + ((time - 0.25 + 1) % 1) - state.planted;   // days count from sunrise
    return clamp(RULES.SAPLING + (1 - RULES.SAPLING) * age / f.growDays, RULES.SAPLING, 1);
  }
  const sizeOf = (o, state, day, time) => (o.maxScale || 1) * growth(o.type, state, day, time);
  // Bigger trees take more chops (and give more wood): 3 at the original size.
  const chopsFor = (o, state, day, time) => Math.max(1, Math.round(RULES.CHOPS * sizeOf(o, state, day, time)));

  // One step of the energy model, shared by the server and the client's prediction.
  // p: { energy, exhausted, rest }; wantSprint means "holding sprint while moving".
  // `drain` is any other energy use per second (climbing, gliding: RULES.TRAVEL).
  function stepEnergy(p, dt, wantSprint, drain = 0) {
    const running = wantSprint && !p.exhausted && p.energy > 0;
    if (drain > 0 && !running) {
      p.energy = Math.max(0, p.energy - drain * dt);
      p.rest = 0;
      if (p.energy <= 0) p.exhausted = true;
    } else if (running) {
      p.energy = Math.max(0, p.energy - RULES.ENERGY_DRAIN * dt);
      p.rest = 0;
      if (p.energy <= 0) p.exhausted = true;
    } else {
      p.rest += dt;
      if (p.rest >= RULES.ENERGY_REST) p.energy = Math.min(100, p.energy + RULES.ENERGY_REGEN * dt);
      if (p.exhausted && p.energy >= RULES.EXHAUST_RECOVER) p.exhausted = false;
    }
    return running;
  }
  // A jump costs energy (more for a charged one) and pauses recovery, like sprinting.
  // mul: 1 (tap) to 3 (full charge). Shared so the server and your browser agree.
  function spendJump(p, mul = 1) {
    p.energy = Math.max(0, p.energy - RULES.JUMP_ENERGY * Math.min(3, Math.max(1, mul)));
    p.rest = 0;
    if (p.energy <= 0) p.exhausted = true;
  }
  const speedMult = (running, exhausted) => running ? RULES.SPRINT_MULT : exhausted ? RULES.EXHAUSTED_MULT : 1;

  // Object state. Only states that differ from the default are stored in the database.
  function defaultState(type) {
    switch (type) {
      case 'palm': return { coconuts: RULES.COCONUTS, hits: 0 };
      case 'tree': return { hits: 0 };
      case 'bush': return { berries: true };
      case 'rock': return { left: RULES.ROCK_STONE };
      case 'ore': return { left: RULES.ORE_HITS };
      case 'dig': return { dug: false };
    }
    if (THINGS[type]) return { ...THINGS[type].state };
    return {};
  }
  function isDefaultState(type, s) {
    const d = defaultState(type);
    return Object.keys(s).every(k => k in d) && Object.keys(d).every(k => s[k] === d[k]);
  }
  const recipeById = id => RECIPES.find(r => r.id === id);

  // Feature flags. The server resolves RULES.FEATURES plus the FEATURES env var once at
  // start-up and sends the result to each client when it joins, so both sides agree.
  const setFeatures = f => { activeFeatures = { ...f }; };
  const features = () => ({ ...(activeFeatures || RULES.FEATURES) });
  const feature = name => !!(activeFeatures || RULES.FEATURES)[name];
  // "slots,combat" switches those on, "-slots" switches one off.
  function resolveFeatures(env) {
    const out = { ...RULES.FEATURES };
    for (const part of String(env || '').split(',')) {
      const name = part.trim();
      if (!name) continue;
      if (name[0] === '-') out[name.slice(1)] = false;
      else out[name.replace(/^\+/, '')] = true;
    }
    return out;
  }

  // ================= Regions (docs/roadmap/CONTRACTS.md section 6) =================
  // The planned regions in opening order. Ids are fixed; names can change.
  const REGIONS = [
    { id: 'landing', name: 'The Landing', stage: 0 },
    { id: 'stair', name: 'The Stairs', stage: 1 },
    { id: 'wood', name: 'The Weeping Wood', stage: 2 },
    { id: 'mire', name: 'The Mire', stage: 3 },
    { id: 'teeth', name: 'The Teeth', stage: 4 },
    { id: 'ash', name: 'The Ashen Shore', stage: 5 },
    { id: 'hollow', name: 'The Hollow', stage: 6 },
  ];
  // Which region a spot belongs to: 'sea' below sea level. With the big world off, all land
  // is the Landing.
  const regionAt = (x, z) => (heightAt(x, z) < 0 ? 'sea' : bigOn() ? worldRegionAt(x, z) : 'landing');
  // A climbable surface at this spot, or null (CONTRACTS.md section 12, task P9).
  // Cliffs: ground steeper than RULES.TRAVEL.CLIFF_SLOPE. Returns { kind: 'cliff', nx, nz }
  // (the way the face looks out: downhill) and `top`: the first spot uphill that's gentle
  // enough to stand on ({ x, z, h }), if there is one within 16 m.
  // Trunks: pass nearby objects as `objs` (the browser's, with their `climb` mark, states
  // and optionally `_top`, the height of the leaves); a climbable one within reach gives
  // { kind: 'trunk', o, nx, nz (from the trunk towards you), top }.
  function slopeAt(x, z) {
    const e = .4, gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return { gx, gz, g: Math.hypot(gx, gz) };
  }
  function climbAt(x, y, z, objs) {
    const T = RULES.TRAVEL;
    if (objs) {
      let best = null, bd = Infinity;
      for (const o of objs) {
        if (!o.climb || (o.state && (o.state.gone || o.state.planted != null))) continue;
        const d = Math.hypot(x - o.x, z - o.z);
        if (d < (o.r || .35) + T.TRUNK_REACH && d < bd) { bd = d; best = o; }
      }
      if (best) {
        const d = bd || 1, top = best._top != null ? best._top : 4.2 * (best.maxScale || 1);
        if (y < top) return { kind: 'trunk', o: best, nx: bd ? (x - best.x) / d : 0, nz: bd ? (z - best.z) / d : 1, top };
      }
    }
    const s = slopeAt(x, z);
    if (s.g < T.CLIFF_SLOPE || heightAt(x, z) < .3) return null;
    const nx = -s.gx / s.g, nz = -s.gz / s.g;
    let top = null;
    for (let d = .25; d <= 16; d += .25) {
      const tx = x - nx * d, tz = z - nz * d;
      if (slopeAt(tx, tz).g < T.CLIFF_SLOPE * .75) { top = { x: tx, z: tz, h: heightAt(tx, tz) }; break; }
    }
    return { kind: 'cliff', nx, nz, top, slope: s.g };
  }

  // ================= Chunks (task W1) =================
  // The Landing's objects come from generateObjects (ids 0, 1, 2 ...), unchanged. All new
  // land is made per 32 m chunk by generateChunk, from its region's spawn table, the same
  // way every time on the server and in the browser. Chunk objects get ids from
  // CHUNK_ID_BASE up, which encode their chunk, so they never collide with the Landing's.
  const CHUNK = 32;
  const CHUNK_ID_BASE = 10000000, CHUNK_SPAN = 320, CHUNK_OFF = 160, CHUNK_MAX = 512;   // chunks -160..159 each way (±5 km)
  const chunkOf = (x, z) => ({ cx: Math.floor(x / CHUNK), cz: Math.floor(z / CHUNK) });
  const chunkKey = (cx, cz) => cx + ',' + cz;
  const chunkObjectId = (cx, cz, i) => CHUNK_ID_BASE + ((cx + CHUNK_OFF) * CHUNK_SPAN + (cz + CHUNK_OFF)) * CHUNK_MAX + i;
  function chunkOfId(id) {
    if (id < CHUNK_ID_BASE) return null;
    const k = Math.floor((id - CHUNK_ID_BASE) / CHUNK_MAX);
    return { cx: Math.floor(k / CHUNK_SPAN) - CHUNK_OFF, cz: (k % CHUNK_SPAN) - CHUNK_OFF };
  }
  // tables: { region: [rule] }, a rule being plain data (so it can be sent to the browser):
  //   { type, per,              expected number in a whole 32 m chunk of that region
  //     biomes?, minH?, maxH?,  where it may stand
  //     pad?, extra? }          spacing (like generateObjects) and fields copied onto it
  // opts.regionAt replaces the world's regionAt (tests).
  function generateChunk(seed, cx, cz, tables, opts = {}) {
    const regionOf = opts.regionAt || regionAt;
    const rng = mulberry32((seed * 2654435761) ^ ((cx + CHUNK_OFF) * 40503) ^ ((cz + CHUNK_OFF) * 69069) ^ 0x5bd1e995);
    const out = [], x0 = cx * CHUNK, z0 = cz * CHUNK, EDGE = .6;
    const clear = (x, z, pad) => !out.some(o => Math.hypot(o.x - x, o.z - z) < o.r + pad + .6);
    for (const [region, rules] of Object.entries(tables || {})) {
      for (const rule of rules || []) {
        let n = Math.floor(rule.per) + (rng() < rule.per % 1 ? 1 : 0), tries = 0;
        while (n > 0 && tries++ < 20 + n * 20 && out.length < CHUNK_MAX) {
          const x = x0 + EDGE + rng() * (CHUNK - 2 * EDGE), z = z0 + EDGE + rng() * (CHUNK - 2 * EDGE), h = heightAt(x, z);
          if (regionOf(x, z) !== region) continue;
          if (rule.biomes && !rule.biomes.includes(biomeAt(x, z, h))) continue;
          if ((rule.minH != null && h < rule.minH) || (rule.maxH != null && h > rule.maxH)) continue;
          if (!clear(x, z, rule.pad ?? .8)) continue;
          const o = { id: chunkObjectId(cx, cz, out.length), type: rule.type, x: +x.toFixed(2), z: +z.toFixed(2), r: .5 };
          if (THINGS[o.type]) o.r = THINGS[o.type].r;
          else if (o.type === 'palm') o.r = .35;
          else if (o.type === 'bush') o.r = .6;
          else if (o.type === 'rock') { o.s = +(.8 + rng() * .9).toFixed(3); o.r = +(.55 * o.s).toFixed(3); }
          else if (o.type === 'ore') { o.s = +(1 + rng() * .5).toFixed(3); o.r = +(.6 * o.s).toFixed(3); }
          else if (o.type === 'dig') o.r = .45;
          Object.assign(o, rule.extra);
          if (RULES.FLORA[o.type]) o.maxScale = maxScaleFor(seed, o);
          o.species = speciesOf(seed, o);
          out.push(o); n--;
        }
      }
    }
    return out;
  }

  const WorldGen = {
    RULES, ITEMS, ITEM_INFO, itemInfo, RECIPES, FIRES, PATCHES, MOON_NAMES, moonPhase, ISL, SPRING, SPRINGS, HILLS, SPAWN, recipeById, nearestSpring, biomeAt, forestMask,
    isNight, phaseName, nightFactor, fogFront, fogAt, hash2, vnoise, fbm, clamp, smooth, heightAt, mulberry32,
    generateObjects, generateLanterns, generateCarvings, defaultState, isDefaultState, growth, sizeOf, chopsFor, stepEnergy, spendJump, advanceT, secondsUntil, speedMult,
    feature, features, setFeatures, resolveFeatures,
    REGIONS, regionAt, climbAt, slopeAt, landingHeightAt, WORLD, RIVERS,
    THINGS, CHUNK, CHUNK_ID_BASE, chunkOf, chunkKey, chunkObjectId, chunkOfId, generateChunk,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorldGen;
  else root.WorldGen = WorldGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);

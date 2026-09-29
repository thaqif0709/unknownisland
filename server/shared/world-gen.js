// Shared between the server (Node) and the browser.
// Island shape, deterministic prop placement, and the survival tuning numbers.
// In the browser this file sets `window.WorldGen`; in Node it is `require`d.
(function (root) {
  'use strict';

  // ================= Tuning =================
  const RULES = {
    // Real seconds per in-game day, loosely Minecraft's: 20 minutes, of which about
    // 10 min is day, 8 min 20 s is night, and dusk and dawn are short in between.
    DAY_LEN: 1200,
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
    JUMP_ENERGY: 6,          // energy per normal hop; a full-charge jump (twice as high) costs twice as much
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
    },
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
    // The Sleeper: requests carved on the stones. Days to answer, and what its moods do.
    SLEEPER: { DAYS: 3, CALM_TOP: 1.5, PRESS_TOP: 4, PRESS_BURN: 1.5, FOG_WALK: .7, GATHER_RADIUS: 6, REACH: 2.2 },
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
  const ITEMS = { wood: 'Wood', stone: 'Stone', clay: 'Clay', copper: 'Copper ore', iron: 'Iron ore', seeds: 'Seeds', oil: 'Lamp oil' };

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
    { id: 'oil', kind: 'item', name: 'Lamp oil', cost: { seeds: 3 }, gives: { oil: 1 },
      desc: 'Pressed from seeds. An offering for the old stone lanterns: one lights a lantern for about two days.' },
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

  function heightAt(x, z) {
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
      const h = heightAt(x, z), b = biomeAt(x, z, h);
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
    const byHeight = out.map((l, i) => [heightAt(l.x, l.z), i]).filter(x => x[1] >= fixed.length).sort((a, b) => b[0] - a[0]);   // the first two stay small
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
    const free = (x, z) => heightAt(x, z) > 1.2 && L.every(l => Math.hypot(l.x - x, l.z - z) > 3.5);
    const near = (x0, z0) => { for (let r = 0; r < 14; r += .5) { const a = rng() * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; if (free(x, z)) return [x, z]; } return [x0, z0]; };
    let best = [0, 0], bh = -1;   // the highest walkable point (coarse search)
    for (let x = -ISL; x <= ISL; x += 4) for (let z = -ISL; z <= ISL; z += 4) { const h = heightAt(x, z); if (h > bh && h < 24) { bh = h; best = [x, z]; } }
    const spots = [['shore', ...near(L[0].x - 3.5, L[0].z + 2.5)], ['spring', ...near(SPRING.x - 7, SPRING.z - 5)], ['ridge', ...near(best[0] + 3, best[1] + 3)]];
    const list = spots.map(([key, x, z], id) => ({ id, key, x: +x.toFixed(2), z: +z.toFixed(2), face: Math.atan2(SPAWN.x - x, SPAWN.z - z) }));
    carvingCache.set(seed, list);
    return list;
  }

  // Biomes: what grows where.
  const forestMask = (x, z) => fbm(x * .022 + 3, z * .022 - 7);
  function biomeAt(x, z, h = heightAt(x, z)) {
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
    for (let r = ISL + 60; r > 0; r -= .3) { const x = 3, z = r; if (heightAt(x, z) > .55) return { x, z: z - 1 }; }
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
        const x = (rng() - .5) * ISL * 2.3, z = (rng() - .5) * ISL * 2.3, h = heightAt(x, z);
        if (!test(h, biomeAt(x, z, h), x, z) || blocked(x, z, pad)) continue;
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
  function stepEnergy(p, dt, wantSprint) {
    const running = wantSprint && !p.exhausted && p.energy > 0;
    if (running) {
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
  // mul: 1 (tap) to 2 (full charge). Shared so the server and your browser agree.
  function spendJump(p, mul = 1) {
    p.energy = Math.max(0, p.energy - RULES.JUMP_ENERGY * Math.min(2, Math.max(1, mul)));
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
    return {};
  }
  function isDefaultState(type, s) {
    const d = defaultState(type);
    return Object.keys(s).every(k => k in d) && Object.keys(d).every(k => s[k] === d[k]);
  }
  const recipeById = id => RECIPES.find(r => r.id === id);

  const WorldGen = {
    RULES, ITEMS, RECIPES, FIRES, PATCHES, MOON_NAMES, moonPhase, ISL, SPRING, SPRINGS, HILLS, SPAWN, recipeById, nearestSpring, biomeAt, forestMask,
    isNight, phaseName, nightFactor, fogFront, fogAt, hash2, vnoise, fbm, clamp, smooth, heightAt, mulberry32,
    generateObjects, generateLanterns, generateCarvings, defaultState, isDefaultState, growth, sizeOf, chopsFor, stepEnergy, spendJump, speedMult,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorldGen;
  else root.WorldGen = WorldGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);

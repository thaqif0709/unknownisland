// Shared between the server (Node) and the browser.
// Island shape, deterministic prop placement, and the survival tuning numbers.
// In the browser this file sets `window.WorldGen`; in Node it is `require`d.
(function (root) {
  'use strict';

  // ================= Tuning =================
  const RULES = {
    DAY_LEN: 240,            // real seconds per in-game day
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
  };

  // Things you can carry (inventory keys and their names).
  const ITEMS = { wood: 'Wood', stone: 'Stone', clay: 'Clay', copper: 'Copper ore', iron: 'Iron ore' };

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
  ];

  // Fire types: warmth radius, how fast they burn (1 = one fuel per second), fuel.
  const FIRES = {
    campfire: { warm: 5.5, burn: 1, start: 110, add: 55, max: 200 },
    hearth: { warm: 8, burn: 0.5, start: 160, add: 70, max: 300 },
  };

  const isNight = t => t < 0.22 || t >= 0.8;
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

  const ISL = 36;
  const SPRING = { x: -7, z: 3 };
  const HILL = { x: 9, z: -7 };
  function heightAt(x, z) {
    const d = Math.hypot(x, z) + (fbm(x * .045 + 10, z * .045) - .47) * 16;
    const island = 1 - d / ISL;
    let h = island > 0 ? island * 3.2 + fbm(x * .09, z * .09) * 2.2 * island + .35 : .35 + island * 7;
    const hd = (x - HILL.x) ** 2 + (z - HILL.z) ** 2;
    h += 5.5 * Math.exp(-hd / 70) * clamp(island * 3, 0, 1);
    const sd = Math.hypot(x - SPRING.x, z - SPRING.z);
    const k = smooth(6.5, 3.5, sd); h = h * (1 - k) + 1.9 * k;
    const k2 = smooth(2.6, 1.2, sd); h = h * (1 - k2) + 1.35 * k2;
    return Math.max(h, -5);
  }

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Spawn on the south beach.
  function findSpawn() {
    for (let r = ISL + 6; r > 0; r -= .3) { const x = 3, z = r; if (heightAt(x, z) > .55) return { x, z: z - 1 }; }
    return { x: 0, z: 0 };
  }
  const SPAWN = findSpawn();

  // Deterministic prop placement. The index in the returned array is the
  // object's id (world_objects.obj_id), so this order must never change for
  // an existing island. Visual details (leaf angles, etc.) are not drawn from
  // this RNG; the client derives them from the object's id instead.
  function generateObjects(seed) {
    let rng = mulberry32(seed);
    const objects = [];
    const blocked = (x, z, pad) => Math.hypot(x - SPRING.x, z - SPRING.z) < 4.2 + pad || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 3 + pad
      || objects.some(o => Math.hypot(o.x - x, o.z - z) < o.r + pad + .6);
    function place(type, count, test, extra) {
      let tries = 0;
      while (count > 0 && tries++ < 4000) {
        const x = (rng() - .5) * ISL * 2.2, z = (rng() - .5) * ISL * 2.2, h = heightAt(x, z);
        if (!test(h) || blocked(x, z, .8)) continue;
        const o = { id: objects.length, type, x: +x.toFixed(3), z: +z.toFixed(3), r: .5 };
        if (type === 'palm') o.r = .35;
        else if (type === 'bush') o.r = .6;
        else if (type === 'rock') { o.s = +(.8 + rng() * .9).toFixed(3); o.r = +(.55 * o.s).toFixed(3); }
        else if (type === 'ore') { o.s = +(1 + rng() * .5).toFixed(3); o.r = +(.6 * o.s).toFixed(3); }
        else if (type === 'dig') o.r = .45;
        Object.assign(o, extra);
        objects.push(o); count--;
      }
    }
    place('palm', 26, h => h > .45 && h < 1.7);
    place('tree', 22, h => h > 1.8 && h < 6.2);
    place('bush', 16, h => h > 1.1 && h < 5.5);
    place('rock', 20, h => h > .4 && h < 7.5);
    // Added later: ore rocks and dig patches. They use their own RNG stream and
    // come after the original 84 objects, so none of those moved or changed id.
    rng = mulberry32((seed ^ 0x51ED270B) >>> 0);
    place('ore', 8, h => h > 3.6 && h < 6.4, { ore: 'copper' });
    place('ore', 5, h => h > 5.4, { ore: 'iron' });
    place('dig', 18, h => h > .6 && h < 4.5);
    // Full-grown sizes and species come from a hash of the id, not from `rng`,
    // so adding them didn't move any object either.
    for (const o of objects) {
      if (RULES.FLORA[o.type]) o.maxScale = maxScaleFor(seed, o);
      o.species = speciesOf(seed, o);
    }
    return objects;
  }

  function hashOf(seed, id, salt) { return mulberry32((seed * 73856093) ^ (id * 19349663) ^ salt)(); }

  // Species depend on where things grow.
  function speciesOf(seed, o) {
    const h = heightAt(o.x, o.z), r = hashOf(seed, o.id, 0x2c1b3c6d);
    if (o.type === 'tree') return h > 3.1 ? 'pine' : r < .2 ? 'blossom' : 'oak';
    if (o.type === 'rock') return h < 1 ? 'pebble' : Math.hypot(o.x - SPRING.x, o.z - SPRING.z) < 12 || r < .25 ? 'mossy' : 'granite';
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
    RULES, ITEMS, RECIPES, FIRES, ISL, SPRING, HILL, SPAWN, recipeById,
    isNight, phaseName, hash2, vnoise, fbm, clamp, smooth, heightAt, mulberry32,
    generateObjects, defaultState, isDefaultState, growth, sizeOf, chopsFor, stepEnergy, speedMult,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorldGen;
  else root.WorldGen = WorldGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);

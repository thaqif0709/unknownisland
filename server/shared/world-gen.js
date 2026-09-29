// Shared between the server (Node) and the browser.
// Island shape, deterministic prop placement, and the survival tuning numbers.
// In the browser this file sets `window.WorldGen`; in Node it is `require`d.
(function (root) {
  'use strict';

  // ================= Tuning =================
  const RULES = {
    DAY_LEN: 240,            // real seconds per in-game day
    HUNGER_DRAIN: 0.28,      // per second
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
    ROCK_STONE: 2,
    CHOPS: 3,
    FIRE_WOOD: 4, FIRE_STONE: 3,
    FIRE_START_FUEL: 110, FIRE_ADD_FUEL: 55, FIRE_MAX_FUEL: 200,
    WARM_RADIUS: 5.5,
    TREE_REGROW_DAYS: 2,
    ROCK_REGROW_DAYS: 3,     // not in the original prototype; keeps a shared island from running out of stone
    WALK_SPEED: 4.6, WADE_SPEED: 2.6,
    REACH: 1.4,              // how close you must be to use an object (edge distance)
    SPRING_REACH: 3.4,
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
    const rng = mulberry32(seed);
    const objects = [];
    const blocked = (x, z, pad) => Math.hypot(x - SPRING.x, z - SPRING.z) < 4.2 + pad || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 3 + pad
      || objects.some(o => Math.hypot(o.x - x, o.z - z) < o.r + pad + .6);
    function place(type, count, test) {
      let tries = 0;
      while (count > 0 && tries++ < 4000) {
        const x = (rng() - .5) * ISL * 2.2, z = (rng() - .5) * ISL * 2.2, h = heightAt(x, z);
        if (!test(h) || blocked(x, z, .8)) continue;
        const o = { id: objects.length, type, x: +x.toFixed(3), z: +z.toFixed(3), r: .5 };
        if (type === 'palm') o.r = .35;
        else if (type === 'bush') o.r = .6;
        else if (type === 'rock') { o.s = +(.8 + rng() * .9).toFixed(3); o.r = +(.55 * o.s).toFixed(3); }
        objects.push(o); count--;
      }
    }
    place('palm', 26, h => h > .45 && h < 1.7);
    place('tree', 22, h => h > 1.8 && h < 6.2);
    place('bush', 16, h => h > 1.1 && h < 5.5);
    place('rock', 20, h => h > .4 && h < 7.5);
    return objects;
  }

  // Object state. Only states that differ from the default are stored in the database.
  function defaultState(type) {
    switch (type) {
      case 'palm': return { coconuts: RULES.COCONUTS, hits: 0 };
      case 'tree': return { hits: 0 };
      case 'bush': return { berries: true };
      case 'rock': return { left: RULES.ROCK_STONE };
    }
    return {};
  }
  function isDefaultState(type, s) {
    const d = defaultState(type);
    if (s.gone) return false;
    return Object.keys(d).every(k => s[k] === d[k]);
  }

  const WorldGen = {
    RULES, ISL, SPRING, HILL, SPAWN,
    isNight, phaseName, hash2, vnoise, fbm, clamp, smooth, heightAt, mulberry32,
    generateObjects, defaultState, isDefaultState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorldGen;
  else root.WorldGen = WorldGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);

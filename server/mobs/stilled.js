// The Stilled: pale figures in the fog. They spawn at night in fog near players, never
// enter light or clear air, and move only while no player is looking at them. When one
// reaches the player it has noticed, that player is knocked down and it is gone.
// (Moved here from systems/stilled.js unchanged; the helpers fogHere, watched, isAlone
// and knock are still island methods there.)
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;

module.exports = {
  kind: 'stilled',
  get hp() { return WG.feature('combat') ? RULES.COMBAT.STILLED_HP : 1; },   // with fighting (P6) they take a few blows
  radius: .3,
  start: 'stalk',
  weak: { light: 2, silver: 2 },   // (P6) blows carrying light, and silver, hit twice as hard

  // Once a tick for all of them: fade the ones whose fog has gone, and spawn new ones.
  tick(island, dt, { lights, players }) {
    players = players.filter(p => !p.under);   // they don't follow anyone into a cave (W9)
    const S = RULES.STILLED, mobs = island.mobs, st = mobs.stateOf('stilled');
    // fade: gone when their spot clears (dawn, a fire) or nobody is near
    for (const s of mobs.of('stilled')) {
      let keep;
      if (s.lingering) {   // left standing in daylight by the night: gone when someone walks up to it
        if (players.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 7)) keep = false;
        else { if (WG.nightFactor(island.time) > .6) s.lingering = false; keep = true; }
      } else keep = island.fogHere(s.x, s.z, lights) > .2 && players.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 90);
      if (!keep) mobs.remove(s);
    }
    // broken into fog by a fight (P6): they form again where they broke, if it's still a foggy night
    if (st.reform && st.reform.length) {
      const now = Date.now();
      for (const r of st.reform.filter(r => now >= r.at)) {
        st.reform.splice(st.reform.indexOf(r), 1);
        if (WG.nightFactor(island.time) >= .6 && island.fogHere(r.x, r.z, lights) > .2) mobs.spawn('stilled', r.x, r.z, { face: r.face });
      }
    }
    // spawn, a few times a second at most
    if ((st.timer = (st.timer || 0) - dt) <= 0) {
      st.timer = .5;
      let want = 0;
      for (const p of players) want += S.PER_PLAYER + (island.isAlone(p) ? S.ALONE_EXTRA : 0) + (p.dread > 70 ? S.DREAD_EXTRA : 0);
      if (WG.nightFactor(island.time) < .6) want = 0;
      want = Math.min(S.MAX, want * (island.env.drowning ? 2 : 1));
      if (mobs.of('stilled').length < want && players.length) {
        const p = players[(Math.random() * players.length) | 0];
        for (let tries = 0; tries < 8; tries++) {
          const a = Math.random() * Math.PI * 2, r = S.SPAWN_MIN + Math.random() * (S.SPAWN_MAX - S.SPAWN_MIN);
          const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
          if (heightAt(x, z) < .3 || island.fogHere(x, z, lights) < .6) continue;
          const face = Math.atan2(p.x - x, p.z - z);
          if (island.watched({ x, z })) continue;   // never appear in plain sight
          mobs.spawn('stilled', x, z, { face });
          break;
        }
      }
    }
  },

  states: {
    // move while unwatched towards the player it has noticed
    stalk(s, island, dt, { lights, players, now }) {
      players = players.filter(p => !p.under);   // nor reach anyone in one
      const S = RULES.STILLED;
      if (s.lingering || island.watched(s)) return;
      let best = null, bestScore = -1e9;
      for (const p of players) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        const notice = S.NOTICE + p.dread * S.NOTICE_PER_DREAD + (island.isAlone(p) ? S.NOTICE_ALONE : 0)
          + (island.has(p, 'firefly_jar') ? 10 : 0) + (island.has(p, 'silverfin_scale') ? 8 : 0);
        if (d > notice) continue;
        const score = p.dread / 100 + (island.isAlone(p) ? .5 : 0) - d / 60;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (!best) return;
      const dx = best.x - s.x, dz = best.z - s.z, d = Math.hypot(dx, dz);
      if (d < S.REACH) { module.exports.onTouch(island, s, best, now); return; }
      const slow = WG.feature('combat') && island.inLight && island.inLight(best) ? RULES.COMBAT.LIGHT_SLOW : 1;   // (P6) light slows them
      const step = Math.min(d, S.SPEED * dt * slow), base = Math.atan2(dx, dz);
      for (const off of [0, .6, -.6, 1.2, -1.2]) {   // go round clear patches if it can
        const nx = s.x + Math.sin(base + off) * step, nz = s.z + Math.cos(base + off) * step;
        if (island.fogHere(nx, nz, lights) >= S.FOG_MIN && heightAt(nx, nz) > .2) { s.x = nx; s.z = nz; s.face = base; break; }
      }
    },
  },

  // Broken by blows (P6): it scatters into fog, and forms again later that night (RULES.COMBAT.REFORM).
  onDeath(island, s, hit) {
    if (!WG.feature('combat')) return;
    const st = island.mobs.stateOf('stilled');
    (st.reform = st.reform || []).push({ x: s.x, z: s.z, face: s.face, at: Date.now() + RULES.COMBAT.REFORM * 1000 });
    island.broadcast({ t: 'fogburst', x: s.x, z: s.z });
    if (hit && hit.from) island.send(hit.from, { t: 'toast', msg: 'It breaks apart into fog. It won’t stay gone.' });
  },

  // Reaching you knocks you down (once per cooldown), and it is gone. Called by stalk, only
  // for the player it was after (so there's no `touch` radius for the engine to use).
  onTouch(island, s, p, now = Date.now()) {
    if (now - p.lastKnockAt > RULES.STILLED.KNOCK_COOLDOWN_MS) { p.lastKnockAt = now; island.knock(p); island.mobs.remove(s); }
  },
};

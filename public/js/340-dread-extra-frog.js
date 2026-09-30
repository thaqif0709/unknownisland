  // ================= Dread: the extra one at the fire =================
  // At camp with friends, warm, at night, with high dread: you count one frog
  // too many round the fire. No name over its head. Only you can see it.
  let extra = null, extraNext = 20;
  function updateExtra(dt) {
    const fire = [...fires.values()].find(f => f.fuel > 0 && Math.hypot(f.x - px, f.z - pz) < 6);
    const friends = fire ? [...remotes.values()].filter(r => { const q = r.remote.sample(); return !r.dead && Math.hypot(q.x - fire.x, q.z - fire.z) < 7; }) : [];
    const ok = state === 'play' && !Cut.on && fire && friends.length && stats.warm && isNight(t) && stats.dread >= 50;
    if (extra) {
      extra.life -= dt;
      const a = viewAngle(extra.x, groundAt(extra.x, extra.z) + 1, extra.z);
      if (a < .18) extra.stare += dt;
      if (!ok || extra.life <= 0 || extra.stare > 2.5 || Math.hypot(extra.x - px, extra.z - pz) < 1.6) { removeCastaway(extra.av); extra = null; extraNext = 25 + Math.random() * 40; }
      else poseCastaway(extra.av, extra.x, extra.z, Math.atan2(extra.f.x - extra.x, extra.f.z - extra.z), 0, false, dt, elapsed);
      return;
    }
    if (!ok || (extraNext -= dt) > 0) return;
    // a seat on the far side of the fire from you, between the others
    const a = Math.atan2(px - fire.x, pz - fire.z) + Math.PI + (Math.random() - .5) * 1.2, r = 1.8 + Math.random() * .6;
    const x = fire.x + Math.sin(a) * r, z = fire.z + Math.cos(a) * r;
    if (friends.some(f => { const q = f.remote.sample(); return Math.hypot(q.x - x, q.z - z) < 1; })) { extraNext = 3; return; }
    const used = new Set([me.id, ...remotes.keys()].map(colorFor)), free = CLOAKS.filter(c => !used.has(c));
    extra = { av: makeCastaway(free.length ? free[(Math.random() * free.length) | 0] : CLOAKS[0]), x, z, f: fire, life: 30 + Math.random() * 40, stare: 0 };
  }


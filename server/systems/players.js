// Players: joining and leaving, what others see, movement, survival, and small show-only messages.
const WG = require('../shared/world-gen');
const { RULES, FIRES, ITEMS, heightAt, SPAWN } = WG;
const { r2, num, cleanBuckets } = require('./util');

const methods = {
  // Watching the intro cutscene (held safe for at most two and a half minutes).
  watching(p) { return p.introAt && Date.now() - p.introAt < 150000; },

  // ================= Players =================
  async join(account, ws) {
    await this.refreshContent();
    const old = this.players.get(account.id);
    if (old) {
      this.send(old, { t: 'kicked', reason: 'You logged in somewhere else.' });
      old.ws.close(4000, 'replaced');
      await this.leave(account.id, old);
    }
    const m = await this.store.getMember(this.id, account.id);
    const patches = (await this.store.loadPatches(this.id, account.id)).filter(k => WG.PATCHES.some(x => x.key === k));
    if (ws.readyState !== ws.OPEN) return null;

    if (this.players.size === 0) this.start();

    const saved = m.inventory || {};
    const inv = { wood: m.wood, stone: m.stone };
    for (const k of Object.keys(ITEMS)) if (!(k in inv)) inv[k] = Math.max(0, saved[k] | 0);
    const p = {
      id: account.id, name: account.username, ws,
      x: m.x ?? SPAWN.x, z: m.z ?? SPAWN.z, face: m.face,
      health: m.health, hunger: m.hunger, thirst: m.thirst, inv,
      tools: (Array.isArray(saved.tools) ? saved.tools : []).filter(t => WG.recipeById(t)),
      buckets: cleanBuckets(saved.buckets),
      dead: m.health <= 0, cause: '', moving: false, warm: false,
      energy: 100, exhausted: false, rest: 0, wantSprint: false, running: false,
      dread: m.dread || 0, fog: 0, knockedUntil: 0, camYaw: null, lastKnockAt: 0, patches, hoodDown: !!saved.hoodDown,
      lastPosAt: Date.now(), nextActAt: 0,
    };
    this.players.set(p.id, p);

    this.send(p, {
      t: 'welcome',
      you: this.selfView(p),
      island: { id: this.id, name: this.name, day: this.day, time: this.time },
      // the layout comes from /api/world; here only what differs from default
      states: this.objects.filter(o => !WG.isDefaultState(o.type, o.state)).map(o => [o.id, o.state]),
      fires: this.fires.map(f => this.fireView(f)),
      drops: this.drops.map(d => ({ id: d.id, x: d.x, z: d.z, items: d.items })),
      lanterns: this.lanterns.map(l => this.lanternView(l)),
      washups: this.washups.map(w => this.washView(w)),
      bugs: this.bugs.map(b => [b.id, b.key, b.x, b.z]),
      journal: this.journalView(p),
      env: this.env, board: this.board, notes: this.notes, carvings: this.sleeperView(), chat: this.chatLog || [],
      firstArrival: m.x == null, seenIntro: !!m.seen_intro,
      players: [...this.players.values()].filter(q => q !== p).map(q => this.publicView(q)),
      rules: RULES,
      ...this.joinExtras(p),
    });
    this.broadcast({ t: 'join', player: this.publicView(p) }, p);
    console.log(`[island ${this.id}] ${p.name} joined (${this.players.size} online)`);
    return p;
  },

  async leave(playerId, which) {
    const p = this.players.get(playerId);
    if (!p || (which && p !== which)) return;
    this.players.delete(playerId);
    this.broadcast({ t: 'leave', id: playerId });
    console.log(`[island ${this.id}] ${p.name} left (${this.players.size} online)`);
    await this.save([p]);
    if (this.players.size === 0) this.stop();
  },

  selfView(p) {
    return { id: p.id, name: p.name, x: p.x, z: p.z, face: p.face, health: p.health, hunger: p.hunger,
      thirst: p.thirst, inv: p.inv, tools: p.tools, buckets: p.buckets, energy: p.energy, exhausted: p.exhausted, dread: p.dread, dead: p.dead, patches: p.patches, hoodDown: p.hoodDown };
  },
  publicView(p) { return { id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), face: r2(p.face), dead: p.dead, patches: p.patches, hoodDown: p.hoodDown, hold: p.hold || null, sit: !!p.sitting }; },

  sendMe(p) {
    this.send(p, { t: 'me', health: r2(p.health), hunger: r2(p.hunger), thirst: r2(p.thirst), inv: p.inv, tools: p.tools, buckets: p.buckets,
      energy: r2(p.energy), exhausted: p.exhausted, warm: p.warm, dead: p.dead, dread: r2(p.dread), fog: r2(p.fog),
      down: p.knockedUntil > Date.now() });
  },

  onPos(p, { x, z, face, moving, sprint, cam, stand }) {
    if (num(cam)) p.camYaw = cam;
    if (num(stand)) p.stand = Math.min(2.2, Math.max(0, stand));   // standing on a rock (just for show)
    if (p.dead || !num(x) || !num(z) || !num(face)) return;
    const now = Date.now();
    if (p.knockedUntil > now) { p.lastPosAt = now; p.moving = false; if (Math.hypot(x - p.x, z - p.z) > .3) this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }
    const dt = (now - p.lastPosAt) / 1000;
    p.lastPosAt = now;
    p.wantSprint = !!sprint;
    // Allow sprint speed only while the server agrees you have energy.
    const speed = RULES.WALK_SPEED * (p.wantSprint && !p.exhausted ? RULES.SPRINT_MULT : 1)
      + (now - (p.lastJumpAt || 0) < 1600 ? 4.5 : 0);   // a charged leap carries you forward faster than walking
    const maxStep = speed * 1.4 * Math.min(dt, 1) + 0.6;
    const d = Math.hypot(x - p.x, z - p.z);
    if (heightAt(x, z) <= -1) { this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }
    if (d > maxStep) {
      // Too fast: move as far as allowed and tell the client where it really is.
      p.x += (x - p.x) / d * maxStep; p.z += (z - p.z) / d * maxStep;
      this.send(p, { t: 'correct', x: p.x, z: p.z });
    } else { p.x = x; p.z = z; }
    p.face = face;
    p.moving = !!moving || d > 0.02;   // actually changing position counts, whatever the client says
  },

  onRespawn(p) {
    if (!p.dead) return;
    // You keep your tools; what you were carrying is lost.
    for (const k of Object.keys(p.inv)) p.inv[k] = 0;
    Object.assign(p, RULES.START, { x: SPAWN.x, z: SPAWN.z, face: Math.PI, dead: false, cause: '', lastPosAt: Date.now(),
      energy: 100, exhausted: false, rest: 0, dread: 10, knockedUntil: 0 });
    this.send(p, { t: 'respawned', you: this.selfView(p) });
  },

  // Survival and dread for everyone, once per tick.
  updatePlayers(dt, lights, night, nf) {
    const D = RULES.DREAD;
    for (const p of this.players.values()) {
      if (p.dead || this.watching(p)) continue;   // nothing happens to you while the intro plays
      const warmMul = this.env.lightMul * (this.has(p, 'silverfin_scale') ? 1.3 : 1);
      p.warm = this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - p.x, f.z - p.z) < FIRES[f.kind].warm * warmMul)
        || this.lanterns.some(l => l.lit && Math.hypot(l.x - p.x, l.z - p.z) < this.lanternRadius(l) * .6 * warmMul);
      if (this.env.rain) p.thirst = Math.min(100, p.thirst + RULES.WEATHER.RAIN_WATER * dt);
      // Dread: fog, darkness and being alone push it up; light, day and friends bring it down.
      p.fog = WG.fogAt(p.x, p.z, heightAt(p.x, p.z), this.time, lights, this.env);
      let alone = true;
      for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < D.FRIEND_RADIUS) { alone = false; break; }
      let dd = D.FOG * p.fog;
      if (nf > .5 && !p.warm) dd += D.DARK * nf * (this.has(p, 'violet_charm') ? 1.5 : 1);
      if (alone) dd += nf > .5 ? D.ALONE_NIGHT : D.ALONE_DAY;
      else dd += D.FRIENDS * (this.has(p, 'conch_charm') ? 2 : 1);
      if (p.warm) dd += D.LIGHT * (p.sitting ? 2 : 1);   // resting by the fire calms you faster
      if (nf < .5 && p.fog < .3) dd += D.DAY;
      if (this.stilled.some(s => Math.hypot(s.x - p.x, s.z - p.z) < RULES.STILLED.NEAR_RADIUS)) dd += RULES.STILLED.NEAR_DREAD;
      if (dd > 0 && this.has(p, 'moon_wing')) dd *= 1.3;
      p.dread = Math.max(0, Math.min(100, p.dread + dd * dt));
      p.running = WG.stepEnergy(p, dt, p.wantSprint && p.moving);
      // Hunger and thirst only go down while you're moving; standing still costs nothing.
      if (p.moving) {
        p.hunger = Math.max(0, p.hunger - (RULES.HUNGER_DRAIN * (this.has(p, 'conch_charm') ? 1.2 : 1) + (p.running ? RULES.SPRINT_HUNGER : 0)) * dt);
        p.thirst = Math.max(0, p.thirst - RULES.THIRST_DRAIN * dt);
      }
      let hurt = 0;
      if (p.hunger <= 0) { hurt += RULES.STARVE_DMG; p.cause = 'hunger'; }
      if (p.thirst <= 0) { hurt += RULES.STARVE_DMG; p.cause = 'thirst'; }
      if (night && !p.warm) { hurt += RULES.COLD_DMG; if (p.hunger > 0 && p.thirst > 0) p.cause = 'cold'; }
      if (hurt > 0) p.health -= hurt * dt;
      else if (p.hunger > RULES.REGEN_MIN && p.thirst > RULES.REGEN_MIN) p.health = Math.min(100, p.health + RULES.REGEN * dt);
      if (p.health <= 0) {
        p.health = 0; p.dead = true; p.moving = false;
        this.send(p, { t: 'died', cause: p.cause, day: this.day });
      }
    }
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  pos(p, msg) { return this.onPos(p, msg); },
  respawn(p) { return this.onRespawn(p); },
  jump(p, msg) {   // just for show: tell everyone else so they see the hop
    const now = Date.now();
    if (p.dead || p.exhausted || p.knockedUntil > now || now - (p.lastJumpAt || 0) < 400) return;
    p.lastJumpAt = now;
    const mul = Math.min(3, Math.max(1, +msg.mul || 1));
    WG.spendJump(p, mul);
    return this.broadcast({ t: 'jump', id: p.id, mul }, p);
  },
  hold(p, msg) {   // which item is in your hand (just for show; everyone sees it)
    p.hold = typeof msg.key === 'string' && (ITEMS[msg.key] || /^bucket:(wood|iron):(none|sea|clean)$/.test(msg.key)) ? msg.key : null;
    return this.broadcast({ t: 'hold', id: p.id, key: p.hold }, p);
  },
  charge(p, msg) {   // crouching to jump (just for show)
    return this.broadcast({ t: 'charge', id: p.id, on: !!msg.on && !p.dead }, p);
  },
  sit(p, msg) {   // sitting down; everyone sees it
    p.sitting = !!msg.on && !p.dead;
    return this.broadcast({ t: 'sit', id: p.id, on: p.sitting }, p);
  },
  hood(p, msg) {   // hood up or down; everyone sees it, and it's remembered
    p.hoodDown = !!msg.down;
    return this.broadcast({ t: 'hood', id: p.id, down: p.hoodDown });
  },
  intro(p) { p.introAt = Date.now(); },
  'intro-seen'(p) {
    p.introAt = 0;
    return this.store.setSeenIntro(p.id, true).catch(e => console.error('[island] intro flag not saved', e.message));
  },
  ping(p, msg) { return this.send(p, { t: 'pong', c: msg.c }); },
};

module.exports = { methods, messages };

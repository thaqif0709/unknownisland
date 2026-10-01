// Players: joining and leaving, what others see, movement, survival, and small show-only messages.
const WG = require('../shared/world-gen');
const { RULES, FIRES, ITEMS, heightAt, SPAWN } = WG;
const { r2, num } = require('./util');

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
    const { inv, tools, buckets, slots, over, slotsSaved } = this.loadInventory(m);
    const at = this.safeSpot(m.x ?? SPAWN.x, m.z ?? SPAWN.z);
    const p = {
      id: account.id, name: account.username, ws,
      x: at.x, z: at.z, face: m.face,
      health: m.health, hunger: m.hunger, thirst: m.thirst, inv,
      tools, buckets, slots, sel: -1, slotsOver: over, slotsSaved,
      dead: m.health <= 0, cause: '', moving: false, warm: false,
      energy: 100, exhausted: false, rest: 0, wantSprint: false, running: false,
      dread: m.dread || 0, fog: 0, knockedUntil: 0, camYaw: null, lastKnockAt: 0, patches, hoodDown: !!saved.hoodDown,
      lastPosAt: Date.now(), nextActAt: 0, checkpoint: m.checkpoint ?? null,
      lanternsSeen: Array.isArray(saved.lanternsSeen) ? saved.lanternsSeen.filter(Number.isInteger) : [],   // W10
    };
    this.players.set(p.id, p);

    this.send(p, {
      t: 'welcome',
      you: this.selfView(p),
      island: { id: this.id, name: this.name, day: this.day, time: this.time },
      // the layout comes from /api/world; here only what differs from default (the Landing's
      // objects; chunks of new land are sent as they load, task W2)
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
      features: WG.features(),
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

  // Where you come back: where you left, unless that isn't somewhere you can stand any more
  // (a feature was switched off, e.g. the big world, and it's open sea now; or it's behind the
  // Veil, or a cave's mouth). Then the Landing's beach, where everyone first arrives.
  safeSpot(x, z) {
    if (heightAt(x, z) > -1 && !this.veilAt(x, z) && !this.caveCut(x, z)) return { x, z };
    console.log(`[island ${this.id}] a saved spot (${r2(x)}, ${r2(z)}) is no longer walkable: back to the beach`);
    return { x: SPAWN.x, z: SPAWN.z };
  },

  // Creative mode on or off (admins only, for testing; not saved: it's off again after a rejoin).
  // Turning it off over the sea or behind the Veil puts you back on the beach.
  setCreative(p, on) {
    p.creative = !!on;
    if (!p.creative) {
      if (p.pose === 'fly') p.pose = null;
      const at = this.safeSpot(p.x, p.z);
      if (at.x !== p.x || at.z !== p.z) { p.x = at.x; p.z = at.z; this.send(p, { t: 'correct', x: p.x, z: p.z }); }
    }
    this.send(p, { t: 'mode', creative: p.creative });
  },

  selfView(p) {
    return { id: p.id, name: p.name, x: p.x, z: p.z, face: p.face, health: p.health, hunger: p.hunger,
      thirst: p.thirst, ...this.inventoryView(p), energy: p.energy, exhausted: p.exhausted, dread: p.dread, dead: p.dead, patches: p.patches, hoodDown: p.hoodDown };
  },
  publicView(p) { return { id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), under: p.under || 0, sleep: !!p.sleeping, face: r2(p.face), dead: p.dead, patches: p.patches, hoodDown: p.hoodDown, hold: p.hold || null, sit: !!p.sitting }; },

  sendMe(p) {
    this.send(p, { t: 'me', health: r2(p.health), hunger: r2(p.hunger), thirst: r2(p.thirst), ...this.inventoryView(p),
      energy: r2(p.energy), exhausted: p.exhausted, warm: p.warm, dead: p.dead, dread: r2(p.dread), fog: r2(p.fog),
      down: p.knockedUntil > Date.now(), bites: p.bites || 0 });
  },

  onPos(p, { x, z, face, moving, sprint, cam, stand, under, pose }) {
    if (num(cam)) p.camYaw = cam;
    if (this.rideHoldsPos(p, face)) return;   // on a raft or a zip line (P10): it moves you, and says how high
    // climbing a trunk or gliding (P9, flag travel): shown to everyone, and a glide drifts faster than walking;
    // flying, in creative mode (admins, for testing: /creative in chat)
    p.pose = p.dead ? null : p.creative && pose === 'fly' ? 'fly' : WG.feature('travel') && (pose === 'climb' || pose === 'glide') ? pose : null;
    const flying = p.pose === 'fly';
    if (num(stand)) p.stand = Math.min(flying ? RULES.CREATIVE.MAX_HEIGHT : p.pose ? RULES.TRAVEL.MAX_HEIGHT : 2.2, Math.max(0, stand));   // standing on a rock, up a trunk, in the air (just for show)
    if (p.dead || !num(x) || !num(z) || !num(face)) return;
    const now = Date.now();
    if (p.knockedUntil > now) { p.lastPosAt = now; p.moving = false; if (Math.hypot(x - p.x, z - p.z) > .3) this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }
    const dt = (now - p.lastPosAt) / 1000;
    p.lastPosAt = now;
    p.wantSprint = !!sprint;
    // Allow sprint speed only while the server agrees you have energy.
    let speed = RULES.WALK_SPEED * (p.wantSprint && !p.exhausted ? RULES.SPRINT_MULT : 1)
      + (now - (p.lastJumpAt || 0) < 1600 ? 4.5 : 0);   // a charged leap carries you forward faster than walking
    if (p.pose === 'glide' && !p.exhausted) speed = Math.max(speed, RULES.TRAVEL.GLIDE_SPEED);
    if (flying) speed = Math.max(speed, RULES.CREATIVE.FLY_SPEED);
    if (now < (p.dodgeUntil || 0) + 300) speed = Math.max(speed, RULES.COMBAT.DODGE.DIST / RULES.COMBAT.DODGE.TIME);   // a dodge roll (P6)
    const maxStep = speed * 1.4 * Math.min(dt, 1) + 0.6;
    const d = Math.hypot(x - p.x, z - p.z);
    const wasUnder = p.under || null;
    const cave = this.caveMove(p, x, z, under);   // in a cave (W9): its floor, not the ground, is what counts
    if (cave === 'block') { this.send(p, { t: 'correct', x: p.x, z: p.z, under: p.under || 0 }); return; }
    if (!cave && !flying && heightAt(x, z) <= -1) { this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }   // (flying: over the sea too)
    if (!cave && !flying && this.veilAt(x, z) && !this.veilAt(p.x, p.z)) {   // (and over the Veil)   // the Veil: you're turned around, not let through
      this.veilTurned(p);
      this.send(p, { t: 'veil' });
      this.send(p, { t: 'correct', x: p.x, z: p.z });
      return;
    }
    // Too fast: move as far as allowed and tell the client where it really is. Stepping into or
    // out of a cave (W9) gets some slack for a jerky connection, and is never done part-way
    // (that could land you in the rock): you stay where you were.
    const crossing = !!cave !== !!wasUnder;
    if (d > maxStep * (crossing ? 2 : 1)) {
      const qx = p.x + (x - p.x) / d * maxStep, qz = p.z + (z - p.z) / d * maxStep;
      if (crossing || (cave && !this.caveHitOf(p, qx, qz))) p.under = wasUnder;
      else { p.x = qx; p.z = qz; }
      this.send(p, { t: 'correct', x: p.x, z: p.z, under: p.under || 0 });
      if (crossing) return;
    } else { p.x = x; p.z = z; }
    p.face = face;
    p.moving = !!moving || d > 0.02;   // actually changing position counts, whatever the client says
  },

  onRespawn(p) {
    if (!p.dead) return;
    // You keep your tools; what you were carrying is lost.
    this.clearItems(p);
    const at = this.respawnPoint(p);
    p.under = null;
    Object.assign(p, RULES.START, { x: at.x, z: at.z, face: Math.PI, dead: false, cause: '', lastPosAt: Date.now(),
      energy: 100, exhausted: false, rest: 0, dread: 10 + (at.dread || 0), knockedUntil: 0 });
    this.send(p, { t: 'respawned', you: this.selfView(p) });
    if (at.say) this.send(p, { t: 'toast', msg: at.say });   // where you woke, and how (P4)
  },

  // Survival and dread for everyone, once per tick.
  updatePlayers(dt, lights, night, nf) {
    const D = RULES.DREAD;
    for (const p of this.players.values()) {
      if (p.dead || this.watching(p)) continue;   // nothing happens to you while the intro plays
      const warmMul = this.env.lightMul * (this.has(p, 'silverfin_scale') ? 1.3 : 1);
      p.warm = this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - p.x, f.z - p.z) < FIRES[f.kind].warm * warmMul)
        || this.lanterns.some(l => l.lit && Math.hypot(l.x - p.x, l.z - p.z) < this.lanternRadius(l) * .6 * warmMul)
        || (this.torchWarm ? this.torchWarm(p) : false);   // a torch (torches.js, flag torchlight)
      if (this.env.rain) p.thirst = Math.min(100, p.thirst + RULES.WEATHER.RAIN_WATER * dt);
      // Dread: fog, darkness and being alone push it up; light, day and friends bring it down.
      p.fog = p.under ? 0 : WG.fogAt(p.x, p.z, heightAt(p.x, p.z), this.time, lights, this.env);   // no fog underground
      let alone = true;
      for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < D.FRIEND_RADIUS) { alone = false; break; }
      let dd = D.FOG * p.fog;
      if (p.under) dd += this.caveDark(p);   // underground, the Dark instead of the night (W9)
      else if (nf > .5 && !p.warm) dd += D.DARK * nf * (this.has(p, 'violet_charm') ? 1.5 : 1);
      if (alone) dd += nf > .5 ? D.ALONE_NIGHT : D.ALONE_DAY;
      else dd += D.FRIENDS * (this.has(p, 'conch_charm') ? 2 : 1);
      if (p.warm) dd += D.LIGHT * (p.sitting ? 2 : 1);   // resting by the fire calms you faster
      if (nf < .5 && p.fog < .3 && !p.under) dd += D.DAY;
      if (this.mobs.of('stilled').some(s => Math.hypot(s.x - p.x, s.z - p.z) < RULES.STILLED.NEAR_RADIUS)) dd += RULES.STILLED.NEAR_DREAD;
      if (dd > 0 && this.has(p, 'moon_wing')) dd *= 1.3;
      p.dread = Math.max(0, Math.min(100, p.dread + dd * dt));
      const T = RULES.TRAVEL, drain = p.pose === 'glide' ? T.GLIDE_ENERGY : p.pose === 'climb' ? (p.moving ? T.CLIMB_ENERGY : T.HANG_ENERGY) : 0;
      p.running = WG.stepEnergy(p, dt, p.wantSprint && p.moving, drain);
      // Hunger and thirst only go down while you're moving; standing still costs nothing.
      if (p.moving) {
        p.hunger = Math.max(0, p.hunger - (RULES.HUNGER_DRAIN * (this.has(p, 'conch_charm') ? 1.2 : 1) + (p.running ? RULES.SPRINT_HUNGER : 0)) * dt);
        p.thirst = Math.max(0, p.thirst - RULES.THIRST_DRAIN * dt);
      }
      let hurt = 0;
      if (p.hunger <= 0) { hurt += RULES.STARVE_DMG; p.cause = 'hunger'; }
      if (p.thirst <= 0) { hurt += RULES.STARVE_DMG; p.cause = 'thirst'; }
      if (night && !p.warm && !p.under) { hurt += RULES.COLD_DMG; if (p.hunger > 0 && p.thirst > 0) p.cause = 'cold'; }
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

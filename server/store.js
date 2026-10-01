// Storage. Uses Postgres (Neon) when DATABASE_URL is set, otherwise an
// in-memory store so the game can be tried locally without a database
// (everything is forgotten when the server stops).

function createPgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
  });
  pool.on('error', err => console.error('[db] idle client error', err.message));
  const q = (text, params) => pool.query(text, params);

  // Default journal, tide and Sleeper content: inserted only where missing, on every start,
  // so new entries in server/content/ appear and edits made in Neon are kept.
  async function seedContent() {
    const C = require('./content');
    for (const r of C.SLEEPER) await q(`INSERT INTO sleeper_requests (request_key, text, conditions, reward, penalty, min_day, days, stone, done_text, fail_text, in_pool)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
      [r.key, r.text, r.conditions, JSON.stringify(r.reward || []), JSON.stringify(r.penalty || []), r.minDay || 1, r.days || 3, r.stone || null, r.doneText || null, r.failText || null, r.pool !== false]);
    for (const e of C.JOURNAL) await q(`INSERT INTO journal_entries (entry_key, category, name, description, rarity) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [e.key, e.category, e.name, e.description, e.rarity]);
    for (const t of C.TIDE) await q(`INSERT INTO tide_table (item_key, weight, min_day, conditions, kind, label, gives, entry_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [t.key, t.weight, t.minDay || 1, t.conditions || {}, t.kind, t.label, t.gives || {}, t.entry || null]);
    for (const t of C.TRIVIA) await q(`INSERT INTO fishing_trivia (question_key, question, answers, topic) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [t.key, t.q, JSON.stringify(t.answers), t.topic || null]);
  }

  return {
    kind: 'postgres',
    // Numbered migrations from server/migrations/, each run once (see migrations/index.js),
    // then the default content is added where it's missing.
    async migrate() {
      const { listMigrations } = require('./migrations');
      const list = listMigrations();
      // Each migration runs in its own transaction holding a transaction-level lock, so two
      // servers starting together can't both run one (and it works through Neon's pooler).
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(727001)');
        await c.query('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT now())');
        await c.query('COMMIT');
        for (const m of list) {
          await c.query('BEGIN');
          try {
            await c.query('SELECT pg_advisory_xact_lock(727001)');
            if ((await c.query('SELECT 1 FROM migrations WHERE name = $1', [m.name])).rowCount) { await c.query('COMMIT'); continue; }
            if (m.sql) await c.query(m.sql);
            else await m.up((text, params) => c.query(text, params));
            await c.query('INSERT INTO migrations (name) VALUES ($1)', [m.name]);
            await c.query('COMMIT');
            console.log(`[db] migration ${m.name} applied`);
          } catch (e) {
            await c.query('ROLLBACK').catch(() => {});
            throw new Error(`migration ${m.name} failed: ${e.message}`);
          }
        }
      } finally {
        c.release();
      }
      await seedContent();
    },
    async findPlayerByName(name) {
      const r = await q('SELECT id, username, pass_hash FROM players WHERE lower(username) = lower($1)', [name]);
      return r.rows[0] || null;
    },
    async createPlayer(name, passHash) {
      const r = await q('INSERT INTO players (username, pass_hash) VALUES ($1, $2) RETURNING id, username', [name, passHash]);
      return r.rows[0];
    },
    async createSession(tokenHash, playerId, expiresAt) {
      await q('INSERT INTO sessions (token, player_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, playerId, expiresAt]);
    },
    async getSession(tokenHash) {
      const r = await q(`SELECT p.id, p.username FROM sessions s JOIN players p ON p.id = s.player_id
                         WHERE s.token = $1 AND s.expires_at > now()`, [tokenHash]);
      return r.rows[0] || null;
    },
    async deleteSession(tokenHash) { await q('DELETE FROM sessions WHERE token = $1', [tokenHash]); },
    async pruneSessions() { await q('DELETE FROM sessions WHERE expires_at <= now()'); },

    async loadIsland(id) {
      const r = await q('SELECT id, name, seed, day, time_of_day, last_tick_at, weather, chains, seen, rides FROM islands WHERE id = $1', [id]);
      const row = r.rows[0];
      if (!row) return null;
      const objs = await q('SELECT obj_id, state FROM world_objects WHERE island_id = $1 AND obj_id < $2', [id, require('./shared/world-gen').CHUNK_ID_BASE]);   // chunk objects load with their chunk
      const fires = await q('SELECT id, x, z, fuel, kind, built_by, pot FROM fires WHERE island_id = $1 ORDER BY id', [id]);
      const drops = await q('SELECT id, x, z, items FROM drops WHERE island_id = $1 ORDER BY id', [id]);
      const lanterns = await q('SELECT lantern_id, lit, fuel, offerings, cleared_since, reclaim_progress FROM lanterns WHERE island_id = $1', [id]);
      return {
        id: row.id, name: row.name, seed: row.seed, day: row.day, time: row.time_of_day, weather: row.weather, chains: row.chains || {}, rides: row.rides || {}, seen: row.seen || null,
        lastTickAt: new Date(row.last_tick_at).getTime(),
        objects: objs.rows.map(o => ({ id: o.obj_id, state: o.state })),
        fires: fires.rows.map(f => ({ id: f.id, x: f.x, z: f.z, fuel: f.fuel, kind: f.kind, builtBy: f.built_by, pot: f.pot || null })),
        drops: drops.rows.map(d => ({ id: d.id, x: d.x, z: d.z, items: d.items })),
        lanterns: lanterns.rows.map(l => ({ id: l.lantern_id, lit: l.lit, fuel: l.fuel, offerings: l.offerings,
          clearedSince: l.cleared_since ? new Date(l.cleared_since).getTime() : null, reclaim: l.reclaim_progress })),
      };
    },
    // Regions the Veil has opened (or will open at dawn): [{ region, openedDay, liftedDay }].
    async loadRegions(islandId) {
      const r = await q('SELECT region, opened_day, lifted_day FROM regions_open WHERE island_id = $1', [islandId]);
      return r.rows.map(x => ({ region: x.region, openedDay: x.opened_day, liftedDay: x.lifted_day }));
    },
    async saveRegion(islandId, reg) {
      await q(`INSERT INTO regions_open (island_id, region, opened_day, lifted_day) VALUES ($1, $2, $3, $4)
               ON CONFLICT (island_id, region) DO UPDATE SET opened_day = EXCLUDED.opened_day, lifted_day = EXCLUDED.lifted_day`,
      [islandId, reg.region, reg.openedDay, reg.liftedDay ?? null]);
    },
    // Bosses (C0): where each fight stands, so a restart resumes it.
    async loadBosses(islandId) {
      const r = await q('SELECT boss_id, state, health, phase, defeated_at, data FROM bosses WHERE island_id = $1', [islandId]);
      return r.rows.map(x => ({ id: x.boss_id, state: x.state, hp: x.health, phase: x.phase, defeatedAt: x.defeated_at ? new Date(x.defeated_at).getTime() : null, data: x.data || {} }));
    },
    async saveBoss(islandId, b) {
      await q(`INSERT INTO bosses (island_id, boss_id, state, health, phase, defeated_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (island_id, boss_id) DO UPDATE SET state = EXCLUDED.state, health = EXCLUDED.health, phase = EXCLUDED.phase,
               defeated_at = EXCLUDED.defeated_at, data = EXCLUDED.data`,
      [islandId, b.id, b.state, b.hp, b.phase, b.defeatedAt ? new Date(b.defeatedAt) : null, JSON.stringify(b.data || {})]);
    },
    // The island day a chunk was last saved on, or null.
    async loadChunkDay(islandId, chunk) {
      const r = await q('SELECT day FROM chunk_days WHERE island_id = $1 AND chunk = $2', [islandId, chunk]);
      return r.rows.length ? r.rows[0].day : null;
    },
    // Saved changes to the objects of one chunk ("cx,cz"): [{ id, state }].
    async loadChunkStates(islandId, chunk) {
      const r = await q('SELECT obj_id, state FROM world_objects WHERE island_id = $1 AND chunk = $2', [islandId, chunk]);
      return r.rows.map(o => ({ id: o.obj_id, state: o.state }));
    },
    async getMember(islandId, playerId) {
      await q(`INSERT INTO island_members (island_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [islandId, playerId]);
      const r = await q(`SELECT m.x, m.z, m.face, m.health, m.hunger, m.thirst, m.wood, m.stone, m.inventory, m.dread, m.checkpoint, p.seen_intro
                         FROM island_members m JOIN players p ON p.id = m.player_id WHERE m.island_id = $1 AND m.player_id = $2`, [islandId, playerId]);
      return r.rows[0];
    },
    // One transaction per save so the island, objects, fires and players stay consistent.
    async saveIsland(snap) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('UPDATE islands SET day = $2, time_of_day = $3, last_tick_at = $4, moon_day = $5, weather = $6, chains = $7, rides = $8 WHERE id = $1',
          [snap.id, snap.day, snap.time, new Date(snap.lastTickAt), snap.moonDay, snap.weather, JSON.stringify(snap.chains || {}), JSON.stringify(snap.rides || {})]);
        for (const o of snap.objects) {
          if (o.state) {
            await c.query(`INSERT INTO world_objects (island_id, obj_id, state, chunk) VALUES ($1, $2, $3, $4)
                           ON CONFLICT (island_id, obj_id) DO UPDATE SET state = EXCLUDED.state, chunk = EXCLUDED.chunk`, [snap.id, o.id, o.state, o.chunk || null]);
          } else {
            await c.query('DELETE FROM world_objects WHERE island_id = $1 AND obj_id = $2', [snap.id, o.id]);
          }
        }
        for (const f of snap.fires) await c.query('UPDATE fires SET fuel = $2, pot = $3 WHERE id = $1', [f.id, f.fuel, f.pot ? JSON.stringify(f.pot) : null]);
        if (snap.seen) await c.query('UPDATE islands SET seen = $2 WHERE id = $1', [snap.id, snap.seen]);
        for (const [chunk, day] of snap.chunkDays || []) {
          await c.query(`INSERT INTO chunk_days (island_id, chunk, day) VALUES ($1, $2, $3)
                         ON CONFLICT (island_id, chunk) DO UPDATE SET day = EXCLUDED.day`, [snap.id, chunk, day]);
        }
        for (const l of snap.lanterns || []) {
          await c.query(`INSERT INTO lanterns (island_id, lantern_id, lit, fuel, offerings, lit_by, lit_at, cleared_since, reclaim_progress)
                         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $3 THEN now() END, $7, $8)
                         ON CONFLICT (island_id, lantern_id) DO UPDATE SET lit = EXCLUDED.lit, fuel = EXCLUDED.fuel, offerings = EXCLUDED.offerings,
                         lit_by = COALESCE(EXCLUDED.lit_by, lanterns.lit_by), lit_at = COALESCE(lanterns.lit_at, EXCLUDED.lit_at),
                         cleared_since = EXCLUDED.cleared_since, reclaim_progress = EXCLUDED.reclaim_progress`,
            [snap.id, l.id, l.lit, l.fuel, JSON.stringify(l.offerings), l.litBy || null,
             l.clearedSince ? new Date(l.clearedSince) : null, l.reclaim]);
        }
        for (const m of snap.members) {
          await c.query(`UPDATE island_members SET x = $3, z = $4, face = $5, health = $6, hunger = $7, thirst = $8,
                           wood = $9, stone = $10, inventory = $11, dread = $12, checkpoint = $13, last_seen = now() WHERE island_id = $1 AND player_id = $2`,
            [snap.id, m.playerId, m.x, m.z, m.face, m.health, m.hunger, m.thirst, m.wood, m.stone, m.inventory, m.dread, m.checkpoint ?? null]);
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    async insertDrop(islandId, x, z, items) {
      const r = await q('INSERT INTO drops (island_id, x, z, items) VALUES ($1, $2, $3, $4) RETURNING id', [islandId, x, z, items]);
      return r.rows[0].id;
    },
    async deleteDrop(id) { await q('DELETE FROM drops WHERE id = $1', [id]); },
    async moveDrop(id, x, z) { await q('UPDATE drops SET x = $2, z = $3 WHERE id = $1', [id, x, z]); },
    async updateDrop(id, items) { await q('UPDATE drops SET items = $2 WHERE id = $1', [id, items]); },
    // content (editable tables) and collections
    async loadContent() {
      const j = await q('SELECT entry_key, category, name, description, rarity FROM journal_entries ORDER BY category, entry_key');
      const t = await q('SELECT item_key, weight, min_day, conditions, kind, label, gives, entry_key FROM tide_table');
      const sl = await q('SELECT request_key, text, conditions, reward, penalty, min_day, weight, days, stone, done_text, fail_text, in_pool FROM sleeper_requests WHERE enabled');
      const tv = await q('SELECT question_key, question, answers, topic FROM fishing_trivia WHERE enabled');
      return {
        trivia: tv.rows.map(r => ({ key: r.question_key, q: r.question, answers: r.answers, topic: r.topic })),
        sleeper: sl.rows.map(r => ({ key: r.request_key, text: r.text, conditions: r.conditions, reward: r.reward, penalty: r.penalty, minDay: r.min_day,
          weight: r.weight, days: r.days, stone: r.stone, doneText: r.done_text, failText: r.fail_text, inPool: r.in_pool })),
        journal: j.rows.map(r => ({ key: r.entry_key, category: r.category, name: r.name, description: r.description, rarity: r.rarity })),
        tide: t.rows.map(r => ({ key: r.item_key, weight: r.weight, minDay: r.min_day, conditions: r.conditions, kind: r.kind, label: r.label, gives: r.gives, entry: r.entry_key })),
      };
    },
    async loadDiscoveries(islandId) {
      const r = await q(`SELECT d.player_id, p.username, d.entry_key, d.first_on_island, d.count, d.found_at FROM discoveries d
                         JOIN players p ON p.id = d.player_id WHERE d.island_id = $1`, [islandId]);
      return r.rows.map(x => ({ playerId: x.player_id, name: x.username, key: x.entry_key, first: x.first_on_island, count: x.count, foundAt: new Date(x.found_at).getTime() }));
    },
    async recordDiscovery(islandId, playerId, key, first) {
      await q(`INSERT INTO discoveries (island_id, player_id, entry_key, first_on_island) VALUES ($1, $2, $3, $4)
               ON CONFLICT (island_id, player_id, entry_key) DO UPDATE SET count = discoveries.count + 1`, [islandId, playerId, key, first]);
    },
    async loadWashups(islandId) {
      const r = await q('SELECT id, item_key, x, z, data, day FROM washups WHERE island_id = $1', [islandId]);
      return r.rows.map(w => ({ id: w.id, key: w.item_key, x: w.x, z: w.z, data: w.data, day: w.day }));
    },
    async insertWashup(islandId, w) {
      const r = await q('INSERT INTO washups (island_id, item_key, x, z, data, day) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [islandId, w.key, w.x, w.z, w.data || {}, w.day]);
      return r.rows[0].id;
    },
    async deleteWashup(id) { await q('DELETE FROM washups WHERE id = $1', [id]); },
    async clearWashups(islandId) { await q(`DELETE FROM washups WHERE island_id = $1 AND NOT (data ? 'sleeper')`, [islandId]); },
    async loadNotes(islandId) {
      const r = await q(`SELECT n.id, n.text, n.note_key, n.pinned_at, p.username FROM board_notes n LEFT JOIN players p ON p.id = n.pinned_by
                         WHERE n.island_id = $1 ORDER BY n.id DESC LIMIT 40`, [islandId]);
      return r.rows.reverse().map(n => ({ id: n.id, text: n.text, key: n.note_key, by: n.username || null, at: new Date(n.pinned_at).getTime() }));
    },
    async pinNote(islandId, text, playerId, key) {
      const r = await q('INSERT INTO board_notes (island_id, text, pinned_by, note_key) VALUES ($1, $2, $3, $4) RETURNING id, pinned_at', [islandId, text, playerId, key || null]);
      await q(`DELETE FROM board_notes WHERE island_id = $1 AND id NOT IN (SELECT id FROM board_notes WHERE island_id = $1 ORDER BY id DESC LIMIT 40)`, [islandId]);
      return { id: r.rows[0].id, at: new Date(r.rows[0].pinned_at).getTime() };
    },
    async setSeenIntro(playerId, seen) { await q('UPDATE players SET seen_intro = $2 WHERE id = $1', [playerId, !!seen]); },
    async loadEvents(islandId) {
      const r = await q('SELECT id, event_key, state, ends_at FROM island_events WHERE island_id = $1 ORDER BY id DESC LIMIT 60', [islandId]);
      return r.rows.reverse().map(e => ({ id: e.id, key: e.event_key, state: e.state, ended: !!e.ends_at }));
    },
    async insertEvent(islandId, key, state) {
      const r = await q('INSERT INTO island_events (island_id, event_key, state) VALUES ($1, $2, $3) RETURNING id', [islandId, key, state]);
      return r.rows[0].id;
    },
    async updateEvent(id, state, ended) {
      await q('UPDATE island_events SET state = $2, ends_at = CASE WHEN $3 THEN COALESCE(ends_at, now()) END WHERE id = $1', [id, state, !!ended]);
    },
    async loadPatches(islandId, playerId) {
      const r = await q('SELECT item_key FROM cloak_items WHERE island_id = $1 AND player_id = $2 ORDER BY slot', [islandId, playerId]);
      return r.rows.map(x => x.item_key);
    },
    async savePatches(islandId, playerId, keys) {
      // upsert by slot, then drop the slots past the end (safe if two saves overlap)
      if (keys.length) await q(`INSERT INTO cloak_items (island_id, player_id, item_key, slot)
        SELECT $1, $2, k, i - 1 FROM unnest($3::text[]) WITH ORDINALITY AS t(k, i)
        ON CONFLICT (island_id, player_id, slot) DO UPDATE SET item_key = EXCLUDED.item_key`, [islandId, playerId, keys]);
      await q('DELETE FROM cloak_items WHERE island_id = $1 AND player_id = $2 AND slot >= $3', [islandId, playerId, keys.length]);
    },
    async deleteFire(id) { await q('DELETE FROM fires WHERE id = $1', [id]); },
    async insertFire(islandId, x, z, fuel, builtBy, kind) {
      const r = await q('INSERT INTO fires (island_id, x, z, fuel, built_by, kind) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [islandId, x, z, fuel, builtBy, kind]);
      return r.rows[0].id;
    },
    async close() { await pool.end(); },
  };
}

function createMemoryStore() {
  let nextPlayer = 1, nextFire = 1, nextDrop = 1, nextWashup = 1;
  const events = []; let nextEvent = 1;
  const discoveries = []; let washups = []; const notes = []; const patches = new Map(); let nextNote = 1;
  const players = new Map(), sessions = new Map(), members = new Map();
  const islands = new Map([
    [1, { id: 1, name: 'Unknown Island', seed: 7, day: 1, time: 0.26, lastTickAt: Date.now(), objects: new Map(), fires: [], drops: [], lanterns: new Map() }],
    [2, { id: 2, name: 'Unknown Island', seed: 11, day: 1, time: 0.26, lastTickAt: Date.now(), objects: new Map(), fires: [], drops: [], lanterns: new Map() }],
  ]);
  const clone = v => JSON.parse(JSON.stringify(v));

  return {
    kind: 'memory',
    async migrate() {},
    async findPlayerByName(name) {
      for (const p of players.values()) if (p.username.toLowerCase() === name.toLowerCase()) return p;
      return null;
    },
    async createPlayer(name, passHash) {
      if (await this.findPlayerByName(name)) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
      const p = { id: nextPlayer++, username: name, pass_hash: passHash };
      players.set(p.id, p);
      return { id: p.id, username: p.username };
    },
    async createSession(tokenHash, playerId, expiresAt) { sessions.set(tokenHash, { playerId, expiresAt }); },
    async getSession(tokenHash) {
      const s = sessions.get(tokenHash);
      if (!s || s.expiresAt <= new Date()) return null;
      const p = players.get(s.playerId);
      return p ? { id: p.id, username: p.username } : null;
    },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); },
    async pruneSessions() {},

    async loadIsland(id) {
      const i = islands.get(id);
      if (!i) return null;
      return {
        id: i.id, name: i.name, seed: i.seed, day: i.day, time: i.time, lastTickAt: i.lastTickAt, weather: i.weather || 'clear', chains: clone(i.chains || {}), rides: clone(i.rides || {}), seen: i.seen ? Buffer.from(i.seen) : null,
        objects: [...i.objects].filter(([oid]) => oid < require('./shared/world-gen').CHUNK_ID_BASE).map(([oid, state]) => ({ id: oid, state: clone(state) })),
        fires: clone(i.fires),
        drops: clone(i.drops),
        lanterns: [...i.lanterns.values()].map(clone),
      };
    },
    async loadRegions(islandId) { return clone([...((islands.get(islandId).regions || new Map()).values())]); },
    async saveRegion(islandId, reg) { const i = islands.get(islandId); i.regions = i.regions || new Map(); i.regions.set(reg.region, clone(reg)); },
    async loadBosses(islandId) { return clone([...((islands.get(islandId).bosses || new Map()).values())]); },
    async saveBoss(islandId, b) { const i = islands.get(islandId); i.bosses = i.bosses || new Map(); i.bosses.set(b.id, clone(b)); },
    async loadChunkDay(islandId, chunk) { const d = (islands.get(islandId).chunkDays || new Map()).get(chunk); return d == null ? null : d; },
    async loadChunkStates(islandId, chunk) {
      const i = islands.get(islandId), m = i.chunkOf || new Map();
      return [...i.objects].filter(([oid]) => m.get(oid) === chunk).map(([oid, state]) => ({ id: oid, state: clone(state) }));
    },
    async getMember(islandId, playerId) {
      const key = islandId + ':' + playerId;
      if (!members.has(key)) members.set(key, { x: null, z: null, face: 3.14159, health: 100, hunger: 80, thirst: 70, wood: 0, stone: 0, inventory: {}, dread: 0 });
      return { ...clone(members.get(key)), seen_intro: !!(players.get(playerId) || {}).seenIntro };
    },
    async saveIsland(snap) {
      const i = islands.get(snap.id);
      Object.assign(i, { day: snap.day, time: snap.time, lastTickAt: snap.lastTickAt, weather: snap.weather, chains: clone(snap.chains || {}), rides: clone(snap.rides || {}) });
      i.chunkOf = i.chunkOf || new Map();
      i.chunkDays = i.chunkDays || new Map();
      if (snap.seen) i.seen = Buffer.from(snap.seen);
      for (const [chunk, day] of snap.chunkDays || []) i.chunkDays.set(chunk, day);
      for (const o of snap.objects) { if (o.state) { i.objects.set(o.id, clone(o.state)); i.chunkOf.set(o.id, o.chunk); } else i.objects.delete(o.id); }
      for (const f of snap.fires) { const x = i.fires.find(y => y.id === f.id); if (x) { x.fuel = f.fuel; x.pot = f.pot ? clone(f.pot) : null; } }
      for (const l of snap.lanterns || []) i.lanterns.set(l.id, clone({ id: l.id, lit: l.lit, fuel: l.fuel, offerings: l.offerings,
        clearedSince: l.clearedSince, reclaim: l.reclaim }));
      for (const m of snap.members) {
        const { playerId, ...rest } = m;
        members.set(snap.id + ':' + playerId, clone(rest));
      }
    },
    async insertDrop(islandId, x, z, items) {
      const id = nextDrop++;
      islands.get(islandId).drops.push({ id, x, z, items: clone(items) });
      return id;
    },
    async deleteDrop(id) { for (const i of islands.values()) i.drops = i.drops.filter(d => d.id !== id); },
    async moveDrop(id, x, z) { for (const i of islands.values()) for (const d of i.drops) if (d.id === id) Object.assign(d, { x, z }); },
    async updateDrop(id, items) { for (const i of islands.values()) for (const d of i.drops) if (d.id === id) d.items = clone(items); },
    async loadContent() {
      const C = require('./content');
      return { trivia: clone(C.TRIVIA), journal: clone(C.JOURNAL), tide: C.TIDE.map(t => ({ minDay: 1, gives: {}, conditions: {}, ...clone(t) })),
        sleeper: C.SLEEPER.map(({ pool, ...r }) => ({ minDay: 1, weight: 1, days: 3, stone: null, reward: [], penalty: [], ...clone(r), inPool: pool !== false })) };
    },
    async setSeenIntro(playerId, seen) { const p = players.get(playerId); if (p) p.seenIntro = !!seen; },
    async loadEvents(islandId) { return clone(events.filter(e => e.islandId === islandId).slice(-60)); },
    async insertEvent(islandId, key, state) { const id = nextEvent++; events.push({ id, islandId, key, state: clone(state), ended: false }); return id; },
    async updateEvent(id, state, ended) { const e = events.find(e => e.id === id); if (e) { e.state = clone(state); e.ended = e.ended || !!ended; } },
    async loadDiscoveries(islandId) { return clone(discoveries.filter(d => d.islandId === islandId)); },
    async recordDiscovery(islandId, playerId, key, first) {
      const d = discoveries.find(d => d.islandId === islandId && d.playerId === playerId && d.key === key);
      if (d) d.count++;
      else discoveries.push({ islandId, playerId, name: (players.get(playerId) || {}).username, key, first, count: 1, foundAt: Date.now() });
    },
    async loadWashups(islandId) { return clone(washups.filter(w => w.islandId === islandId)); },
    async insertWashup(islandId, w) { const id = nextWashup++; washups.push({ ...clone(w), id, islandId }); return id; },
    async deleteWashup(id) { washups = washups.filter(w => w.id !== id); },
    async clearWashups(islandId) { washups = washups.filter(w => w.islandId !== islandId || (w.data && w.data.sleeper)); },
    async loadNotes(islandId) { return clone(notes.filter(n => n.islandId === islandId).slice(-40)); },
    async pinNote(islandId, text, playerId, key) {
      const n = { id: nextNote++, islandId, text, key: key || null, by: playerId ? (players.get(playerId) || {}).username : null, at: Date.now() };
      notes.push(n); return { id: n.id, at: n.at };
    },
    async loadPatches(islandId, playerId) { return clone(patches.get(islandId + ':' + playerId) || []); },
    async savePatches(islandId, playerId, keys) { patches.set(islandId + ':' + playerId, clone(keys)); },
    async deleteFire(id) { for (const i of islands.values()) i.fires = i.fires.filter(f => f.id !== id); },
    async insertFire(islandId, x, z, fuel, builtBy, kind) {
      const id = nextFire++;
      islands.get(islandId).fires.push({ id, x, z, fuel, builtBy, kind });
      return id;
    },
    async close() {},
  };
}

function createStore() {
  const url = process.env.DATABASE_URL;
  return url ? createPgStore(url) : createMemoryStore();
}

module.exports = { createStore };

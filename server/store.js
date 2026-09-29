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

  return {
    kind: 'postgres',
    // Small additive migrations, safe to run on every start.
    async migrate() {
      await q(`ALTER TABLE island_members ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '{}'`);
      await q(`ALTER TABLE fires ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'campfire'`);
      // Island 2: the big island (island 1 was the small original; its data is kept).
      await q(`INSERT INTO islands (id, name, seed) VALUES (2, 'Unknown Island', 11) ON CONFLICT (id) DO NOTHING`);
      await q(`ALTER TABLE island_members ADD COLUMN IF NOT EXISTS dread REAL NOT NULL DEFAULT 0`);
      await q(`CREATE TABLE IF NOT EXISTS lanterns (
        island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
        lantern_id INT NOT NULL,
        lit BOOLEAN NOT NULL DEFAULT false,
        fuel REAL NOT NULL DEFAULT 0,
        offerings JSONB NOT NULL DEFAULT '[]',
        lit_by INT REFERENCES players(id) ON DELETE SET NULL,
        lit_at TIMESTAMPTZ,
        PRIMARY KEY (island_id, lantern_id))`);
      await q(`ALTER TABLE lanterns ADD COLUMN IF NOT EXISTS cleared_since TIMESTAMPTZ`);
      // Phase 4: collections and tides. The two content tables can be edited in
      // Neon without redeploying; defaults are inserted only if missing.
      await q(`CREATE TABLE IF NOT EXISTS journal_entries (
        entry_key TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
        description TEXT NOT NULL, rarity TEXT NOT NULL DEFAULT 'common')`);
      await q(`CREATE TABLE IF NOT EXISTS tide_table (
        item_key TEXT PRIMARY KEY, weight REAL NOT NULL, min_day INT NOT NULL DEFAULT 1,
        conditions JSONB NOT NULL DEFAULT '{}', kind TEXT NOT NULL DEFAULT 'resource',
        label TEXT NOT NULL, gives JSONB NOT NULL DEFAULT '{}', entry_key TEXT)`);
      await q(`CREATE TABLE IF NOT EXISTS discoveries (
        island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
        player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        entry_key TEXT NOT NULL, found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        first_on_island BOOLEAN NOT NULL DEFAULT false, count INT NOT NULL DEFAULT 1,
        PRIMARY KEY (island_id, player_id, entry_key))`);
      await q(`CREATE TABLE IF NOT EXISTS washups (
        id SERIAL PRIMARY KEY, island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL, x REAL NOT NULL, z REAL NOT NULL, data JSONB NOT NULL DEFAULT '{}', day INT NOT NULL)`);
      const C = require('./content');
      for (const e of C.JOURNAL) await q(`INSERT INTO journal_entries (entry_key, category, name, description, rarity) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [e.key, e.category, e.name, e.description, e.rarity]);
      for (const t of C.TIDE) await q(`INSERT INTO tide_table (item_key, weight, min_day, conditions, kind, label, gives, entry_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [t.key, t.weight, t.minDay || 1, t.conditions || {}, t.kind, t.label, t.gives || {}, t.entry || null]);
      await q(`ALTER TABLE lanterns ADD COLUMN IF NOT EXISTS reclaim_progress REAL NOT NULL DEFAULT 1`);
      await q(`CREATE TABLE IF NOT EXISTS drops (
        id SERIAL PRIMARY KEY,
        island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
        x REAL NOT NULL, z REAL NOT NULL,
        items JSONB NOT NULL,
        dropped_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await q(`SELECT setval(pg_get_serial_sequence('islands', 'id'), GREATEST((SELECT MAX(id) FROM islands), 1))`);
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
      const r = await q('SELECT id, name, seed, day, time_of_day, last_tick_at FROM islands WHERE id = $1', [id]);
      const row = r.rows[0];
      if (!row) return null;
      const objs = await q('SELECT obj_id, state FROM world_objects WHERE island_id = $1', [id]);
      const fires = await q('SELECT id, x, z, fuel, kind, built_by FROM fires WHERE island_id = $1 ORDER BY id', [id]);
      const drops = await q('SELECT id, x, z, items FROM drops WHERE island_id = $1 ORDER BY id', [id]);
      const lanterns = await q('SELECT lantern_id, lit, fuel, offerings, cleared_since, reclaim_progress FROM lanterns WHERE island_id = $1', [id]);
      return {
        id: row.id, name: row.name, seed: row.seed, day: row.day, time: row.time_of_day,
        lastTickAt: new Date(row.last_tick_at).getTime(),
        objects: objs.rows.map(o => ({ id: o.obj_id, state: o.state })),
        fires: fires.rows.map(f => ({ id: f.id, x: f.x, z: f.z, fuel: f.fuel, kind: f.kind, builtBy: f.built_by })),
        drops: drops.rows.map(d => ({ id: d.id, x: d.x, z: d.z, items: d.items })),
        lanterns: lanterns.rows.map(l => ({ id: l.lantern_id, lit: l.lit, fuel: l.fuel, offerings: l.offerings,
          clearedSince: l.cleared_since ? new Date(l.cleared_since).getTime() : null, reclaim: l.reclaim_progress })),
      };
    },
    async getMember(islandId, playerId) {
      await q(`INSERT INTO island_members (island_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [islandId, playerId]);
      const r = await q(`SELECT x, z, face, health, hunger, thirst, wood, stone, inventory, dread FROM island_members
                         WHERE island_id = $1 AND player_id = $2`, [islandId, playerId]);
      return r.rows[0];
    },
    // One transaction per save so the island, objects, fires and players stay consistent.
    async saveIsland(snap) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('UPDATE islands SET day = $2, time_of_day = $3, last_tick_at = $4 WHERE id = $1',
          [snap.id, snap.day, snap.time, new Date(snap.lastTickAt)]);
        for (const o of snap.objects) {
          if (o.state) {
            await c.query(`INSERT INTO world_objects (island_id, obj_id, state) VALUES ($1, $2, $3)
                           ON CONFLICT (island_id, obj_id) DO UPDATE SET state = EXCLUDED.state`, [snap.id, o.id, o.state]);
          } else {
            await c.query('DELETE FROM world_objects WHERE island_id = $1 AND obj_id = $2', [snap.id, o.id]);
          }
        }
        for (const f of snap.fires) await c.query('UPDATE fires SET fuel = $2 WHERE id = $1', [f.id, f.fuel]);
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
                           wood = $9, stone = $10, inventory = $11, dread = $12, last_seen = now() WHERE island_id = $1 AND player_id = $2`,
            [snap.id, m.playerId, m.x, m.z, m.face, m.health, m.hunger, m.thirst, m.wood, m.stone, m.inventory, m.dread]);
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
    // content (editable tables) and collections
    async loadContent() {
      const j = await q('SELECT entry_key, category, name, description, rarity FROM journal_entries ORDER BY category, entry_key');
      const t = await q('SELECT item_key, weight, min_day, conditions, kind, label, gives, entry_key FROM tide_table');
      return {
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
    async clearWashups(islandId) { await q('DELETE FROM washups WHERE island_id = $1', [islandId]); },
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
  const discoveries = []; let washups = [];
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
        id: i.id, name: i.name, seed: i.seed, day: i.day, time: i.time, lastTickAt: i.lastTickAt,
        objects: [...i.objects].map(([oid, state]) => ({ id: oid, state: clone(state) })),
        fires: clone(i.fires),
        drops: clone(i.drops),
        lanterns: [...i.lanterns.values()].map(clone),
      };
    },
    async getMember(islandId, playerId) {
      const key = islandId + ':' + playerId;
      if (!members.has(key)) members.set(key, { x: null, z: null, face: 3.14159, health: 100, hunger: 80, thirst: 70, wood: 0, stone: 0, inventory: {}, dread: 0 });
      return clone(members.get(key));
    },
    async saveIsland(snap) {
      const i = islands.get(snap.id);
      Object.assign(i, { day: snap.day, time: snap.time, lastTickAt: snap.lastTickAt });
      for (const o of snap.objects) o.state ? i.objects.set(o.id, clone(o.state)) : i.objects.delete(o.id);
      for (const f of snap.fires) { const x = i.fires.find(y => y.id === f.id); if (x) x.fuel = f.fuel; }
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
    async loadContent() {
      const C = require('./content');
      return { journal: clone(C.JOURNAL), tide: C.TIDE.map(t => ({ minDay: 1, gives: {}, conditions: {}, ...clone(t) })) };
    },
    async loadDiscoveries(islandId) { return clone(discoveries.filter(d => d.islandId === islandId)); },
    async recordDiscovery(islandId, playerId, key, first) {
      const d = discoveries.find(d => d.islandId === islandId && d.playerId === playerId && d.key === key);
      if (d) d.count++;
      else discoveries.push({ islandId, playerId, name: (players.get(playerId) || {}).username, key, first, count: 1, foundAt: Date.now() });
    },
    async loadWashups(islandId) { return clone(washups.filter(w => w.islandId === islandId)); },
    async insertWashup(islandId, w) { const id = nextWashup++; washups.push({ ...clone(w), id, islandId }); return id; },
    async deleteWashup(id) { washups = washups.filter(w => w.id !== id); },
    async clearWashups(islandId) { washups = washups.filter(w => w.islandId !== islandId); },
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

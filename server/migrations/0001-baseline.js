// Everything the old migrate() did, as the first numbered migration. Every statement is
// idempotent (IF NOT EXISTS / ON CONFLICT), so it is safe on the live database, which
// already has all of it, and on a fresh one set up from db/schema.sql.
module.exports = {
  async up(q) {
    await q(`ALTER TABLE island_members ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '{}'`);
    await q(`ALTER TABLE fires ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'campfire'`);
    await q(`ALTER TABLE fires ADD COLUMN IF NOT EXISTS pot JSONB`);   // a bucket boiling on it
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
    // Phase 5: moon, weather, board and cloak patches
    await q(`ALTER TABLE islands ADD COLUMN IF NOT EXISTS moon_day INT`);
    await q(`ALTER TABLE islands ADD COLUMN IF NOT EXISTS weather TEXT NOT NULL DEFAULT 'clear'`);
    await q(`CREATE TABLE IF NOT EXISTS board_notes (
      id SERIAL PRIMARY KEY, island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
      note_key TEXT, text TEXT NOT NULL, pinned_by INT REFERENCES players(id) ON DELETE SET NULL,
      pinned_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS cloak_items (
      island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
      player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      item_key TEXT NOT NULL, slot INT NOT NULL,
      PRIMARY KEY (island_id, player_id, slot))`);
    // The Sleeper: editable requests, and a log of what happened on each island
    await q(`CREATE TABLE IF NOT EXISTS sleeper_requests (
      request_key TEXT PRIMARY KEY, text TEXT NOT NULL, conditions JSONB NOT NULL, reward JSONB NOT NULL DEFAULT '[]',
      penalty JSONB NOT NULL DEFAULT '[]', min_day INT NOT NULL DEFAULT 1, weight REAL NOT NULL DEFAULT 1,
      days INT NOT NULL DEFAULT 3, stone TEXT, done_text TEXT, fail_text TEXT, enabled BOOLEAN NOT NULL DEFAULT true)`);
    await q(`CREATE TABLE IF NOT EXISTS island_events (
      id SERIAL PRIMARY KEY, island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL DEFAULT now(), ends_at TIMESTAMPTZ, state JSONB NOT NULL DEFAULT '{}')`);
    await q(`ALTER TABLE players ADD COLUMN IF NOT EXISTS seen_intro BOOLEAN NOT NULL DEFAULT false`);
    await q(`ALTER TABLE lanterns ADD COLUMN IF NOT EXISTS reclaim_progress REAL NOT NULL DEFAULT 1`);
    await q(`CREATE TABLE IF NOT EXISTS drops (
      id SERIAL PRIMARY KEY,
      island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
      x REAL NOT NULL, z REAL NOT NULL,
      items JSONB NOT NULL,
      dropped_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`SELECT setval(pg_get_serial_sequence('islands', 'id'), GREATEST((SELECT MAX(id) FROM islands), 1))`);
  },
};

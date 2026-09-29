-- Unknown Island database schema.
-- This has ALREADY been applied to the Neon database; it's here for reference
-- and for setting up a fresh database (for example a local test copy).

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX players_username_lower ON players (lower(username));

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE islands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  seed INT NOT NULL,
  day INT NOT NULL DEFAULT 1,
  time_of_day REAL NOT NULL DEFAULT 0.26,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE island_members (
  island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  x REAL, z REAL, face REAL NOT NULL DEFAULT 3.14159,
  health REAL NOT NULL DEFAULT 100,
  hunger REAL NOT NULL DEFAULT 80,
  thirst REAL NOT NULL DEFAULT 70,
  wood INT NOT NULL DEFAULT 0,
  stone INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ,
  PRIMARY KEY (island_id, player_id)
);

CREATE TABLE world_objects (
  island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
  obj_id INT NOT NULL,
  state JSONB NOT NULL,
  PRIMARY KEY (island_id, obj_id)
);

CREATE TABLE fires (
  id SERIAL PRIMARY KEY,
  island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  z REAL NOT NULL,
  fuel REAL NOT NULL,
  built_by INT REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO islands (name, seed) VALUES ('Unknown Island', 7);

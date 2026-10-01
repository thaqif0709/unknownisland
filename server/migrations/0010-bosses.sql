-- C0: each boss's fight on an island, so a restart resumes it. state: waiting (called, not yet
-- come), fighting, or beaten. data: { x, z, frogs, earned: [player ids with its trophy], returnAt, maxHp }.
CREATE TABLE IF NOT EXISTS bosses (
  island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
  boss_id TEXT NOT NULL,
  state TEXT NOT NULL,
  health REAL NOT NULL DEFAULT 0,
  phase INT NOT NULL DEFAULT 0,
  defeated_at TIMESTAMPTZ,
  data JSONB,
  PRIMARY KEY (island_id, boss_id)
);

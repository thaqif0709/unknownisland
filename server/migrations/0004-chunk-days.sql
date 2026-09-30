-- W2: the island day each chunk was last saved on, so a chunk that wakes up again after a
-- dawn has passed regrows (and one that wakes up the same day doesn't regrow twice).
CREATE TABLE IF NOT EXISTS chunk_days (
  island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
  chunk TEXT NOT NULL,
  day INT NOT NULL,
  PRIMARY KEY (island_id, chunk)
);

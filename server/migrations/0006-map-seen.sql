-- W7: the shared chart. One bit per 32 m chunk of the world (320 x 320 chunks), set once
-- anyone has walked near it; the map shows unexplored land as blank parchment.
ALTER TABLE islands ADD COLUMN IF NOT EXISTS seen BYTEA;

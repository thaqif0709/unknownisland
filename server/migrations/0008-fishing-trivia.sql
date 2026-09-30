-- P8: island trivia for the fishing minigames. Editable in Neon: answers is a JSON array of
-- strings with the right one first (the game shuffles them); set enabled = false to retire one.
-- The defaults in server/content/trivia.js are added where missing on every start.
CREATE TABLE IF NOT EXISTS fishing_trivia (
  question_key TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answers JSONB NOT NULL,
  topic TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true
);

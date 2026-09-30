-- P4: hearth checkpoints. The fire (a clay hearth) each player last slept beside on this
-- island; they wake there when knocked down or after dying. NULL: none (the Landing's beach).
ALTER TABLE island_members ADD COLUMN IF NOT EXISTS checkpoint INTEGER;

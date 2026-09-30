-- W8: Sleeper request chains.
-- islands.chains: progress through each region's chain, e.g. {"landing": {"done": 3}}.
-- sleeper_requests.in_pool: false for requests that only appear as a step of a chain
-- (never picked at random). Existing requests stay in the random pool.
ALTER TABLE islands ADD COLUMN IF NOT EXISTS chains JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sleeper_requests ADD COLUMN IF NOT EXISTS in_pool BOOLEAN NOT NULL DEFAULT true;

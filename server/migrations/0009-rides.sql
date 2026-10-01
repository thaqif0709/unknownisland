-- P10: rafts and zip lines, kept with the island: { rafts: [{ id, x, z, a, made }], zips: [{ id, ax, ay, az, bx, by, bz, byName }] }.
ALTER TABLE islands ADD COLUMN IF NOT EXISTS rides JSONB;

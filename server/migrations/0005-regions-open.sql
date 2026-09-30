-- W5: which regions the Veil has lifted from. A region is opened (opened_day) when its
-- way is earned, and the Veil lifts at the next dawn (lifted_day). The Landing is always open.
CREATE TABLE IF NOT EXISTS regions_open (
  island_id INT NOT NULL REFERENCES islands(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  opened_day INT NOT NULL,
  lifted_day INT,
  PRIMARY KEY (island_id, region)
);

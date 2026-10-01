-- Observation effort per 5-degree cell: total detections of all species from all sources.
-- Used as the denominator for effort-corrected measures (a species' share of all detections in a cell).
CREATE TABLE IF NOT EXISTS effort_daily (
  day        date NOT NULL,
  cell_lat   smallint NOT NULL,
  cell_lon   smallint NOT NULL,
  detections integer NOT NULL,
  species    integer NOT NULL,
  PRIMARY KEY (day, cell_lat, cell_lon)
);
CREATE TABLE IF NOT EXISTS effort_weekly (
  week       date NOT NULL,
  cell_lat   smallint NOT NULL,
  cell_lon   smallint NOT NULL,
  detections integer NOT NULL,
  species    integer NOT NULL,
  PRIMARY KEY (week, cell_lat, cell_lon)
);
INSERT INTO effort_daily
  SELECT day, cell_lat, cell_lon, SUM(count), COUNT(DISTINCT scientific_name) FROM species_daily GROUP BY 1, 2, 3
  ON CONFLICT (day, cell_lat, cell_lon) DO UPDATE SET detections = EXCLUDED.detections, species = EXCLUDED.species;
INSERT INTO effort_weekly
  SELECT week, cell_lat, cell_lon, SUM(count), COUNT(DISTINCT scientific_name) FROM species_weekly GROUP BY 1, 2, 3
  ON CONFLICT (week, cell_lat, cell_lon) DO UPDATE SET detections = EXCLUDED.detections, species = EXCLUDED.species;

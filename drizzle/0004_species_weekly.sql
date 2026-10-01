-- Weekly rollup for long-range movement playback: one row per species per 5-degree cell per ISO week (week = Monday).
CREATE TABLE IF NOT EXISTS species_weekly (
  week            date NOT NULL,
  source_system   text NOT NULL,
  scientific_name text NOT NULL,
  vernacular_name text,
  cell_lat        smallint NOT NULL,
  cell_lon        smallint NOT NULL,
  count           integer NOT NULL,
  high_conf_count integer,
  PRIMARY KEY (week, source_system, scientific_name, cell_lat, cell_lon)
);
CREATE INDEX IF NOT EXISTS species_weekly_species_idx ON species_weekly (scientific_name, week);

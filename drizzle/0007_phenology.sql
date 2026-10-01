-- Seasonal timing per species and 5-degree cell, derived from the weekly effort-corrected series.
-- arrival_week: first week the species reaches 10% of its peak share after at least 6 weeks below it.
CREATE TABLE IF NOT EXISTS phenology (
  scientific_name text NOT NULL,
  vernacular_name text,
  cell_lat        smallint NOT NULL,
  cell_lon        smallint NOT NULL,
  arrival_week    date NOT NULL,
  departure_week  date,
  peak_week       date NOT NULL,
  peak_index      real NOT NULL,       -- per 1,000 detections
  total_n         integer NOT NULL,
  weeks_observed  smallint NOT NULL,
  absent_weeks    smallint NOT NULL,   -- length of the absence run before arrival
  methods_version text NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scientific_name, cell_lat, cell_lon)
);
CREATE INDEX IF NOT EXISTS phenology_arrival_idx ON phenology (arrival_week DESC);

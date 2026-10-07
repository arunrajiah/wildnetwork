-- Daily rollup: one row per species per 5-degree cell per day per source.
-- Backfilled from BirdWeather aggregates (no raw events) and rolled up from events for other sources.
CREATE TABLE IF NOT EXISTS species_daily (
  day             date NOT NULL,
  source_system   text NOT NULL,
  scientific_name text NOT NULL,
  vernacular_name text,
  cell_lat        smallint NOT NULL,   -- SW corner of 5-degree cell
  cell_lon        smallint NOT NULL,
  count           integer NOT NULL,
  high_conf_count integer,             -- BirdWeather veryLikely+almostCertain, or confidence>=0.85
  sites           integer,             -- distinct deployments (null when unknown)
  PRIMARY KEY (day, source_system, scientific_name, cell_lat, cell_lon)
);
CREATE INDEX IF NOT EXISTS species_daily_day_idx ON species_daily (day);

-- Hourly weather per 1-degree cell (Open-Meteo), joined to events by cell + hour.
CREATE TABLE IF NOT EXISTS weather_hourly (
  cell_lat    smallint NOT NULL,
  cell_lon    smallint NOT NULL,
  ts          timestamptz NOT NULL,
  temp_c      real,
  precip_mm   real,
  wind_kmh    real,
  wind_dir    smallint,
  pressure_hpa real,
  cloud_pct   smallint,
  PRIMARY KEY (cell_lat, cell_lon, ts)
);

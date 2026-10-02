-- Cached weather context per species: the temperature in each cell during its arrival week (Open-Meteo ERA5).
CREATE TABLE IF NOT EXISTS species_climate (
  scientific_name   text PRIMARY KEY,
  arrival_cells     integer NOT NULL,
  arrival_tmax_p25  real,
  arrival_tmax_med  real,
  arrival_tmax_p75  real,
  lat_span          real,            -- latitude range of the cells used
  methods_version   text NOT NULL,
  computed_at       timestamptz NOT NULL DEFAULT now()
);

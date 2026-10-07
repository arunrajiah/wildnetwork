-- Range check (methods 0.11). GBIF species keys for the names in the data (from GBIF's name matcher, birds only).
CREATE TABLE IF NOT EXISTS gbif_name_match (
  scientific_name text PRIMARY KEY,
  species_key     integer,
  matched_at      timestamptz NOT NULL DEFAULT now()
);
-- 5 degree cells already checked, with the number of GBIF bird records (all licences, since 2000) in the cell and its neighbours.
CREATE TABLE IF NOT EXISTS range_cells (
  cell_lat   smallint NOT NULL,
  cell_lon   smallint NOT NULL,
  records    bigint NOT NULL,
  species    integer NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell_lat, cell_lon)
);
-- Species that GBIF has almost never recorded around a well surveyed cell: left out of arrival dates there.
CREATE TABLE IF NOT EXISTS range_outliers (
  scientific_name text NOT NULL,
  cell_lat        smallint NOT NULL,
  cell_lon        smallint NOT NULL,
  gbif_records    integer NOT NULL,
  PRIMARY KEY (scientific_name, cell_lat, cell_lon)
);

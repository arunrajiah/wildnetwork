-- GBIF (gbif.org): occurrence records whose publishers chose CC0 or CC BY, so they may be shown and redistributed with attribution.
-- Taxon cache: GBIF facets return species keys, this maps them to names and classes without a lookup per row.
CREATE TABLE IF NOT EXISTS gbif_taxa (
  species_key     integer PRIMARY KEY,
  scientific_name text NOT NULL,
  vernacular_name text,
  grp             text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);
-- 5 degree cells that had any CC0 / CC BY records recently; the weekly rollup only queries these.
CREATE TABLE IF NOT EXISTS gbif_cells (
  cell_lat   smallint NOT NULL,
  cell_lon   smallint NOT NULL,
  n          integer NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell_lat, cell_lon)
);
-- Publishers whose records appear on the site, for the credits (GBIF asks that every dataset is cited by DOI).
CREATE TABLE IF NOT EXISTS gbif_datasets (
  dataset_key text PRIMARY KEY,
  title       text NOT NULL,
  doi         text,
  license     text,
  publisher   text,
  n           integer NOT NULL DEFAULT 0,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

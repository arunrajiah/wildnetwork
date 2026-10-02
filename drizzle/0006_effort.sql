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
-- The initial backfill that lived here was removed: effort is keyed by class since 0008 and is rebuilt by
-- `pnpm classify` (classifyAll) and kept current by refreshDerived(). Migrations must stay safe to re-run.

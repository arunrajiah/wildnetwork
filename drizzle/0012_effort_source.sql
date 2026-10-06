-- Observation effort per source: all detections or records of a class in a cell and week, kept apart by source
-- so acoustic detections and human records can be compared on equal terms (methods 0.9).
CREATE TABLE IF NOT EXISTS effort_weekly_source (
  week          date NOT NULL,
  cell_lat      smallint NOT NULL,
  cell_lon      smallint NOT NULL,
  grp           text NOT NULL,
  source_system text NOT NULL,
  detections    integer NOT NULL,
  species       integer NOT NULL,
  PRIMARY KEY (week, cell_lat, cell_lon, grp, source_system)
);

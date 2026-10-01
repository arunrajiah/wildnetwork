CREATE EXTENSION IF NOT EXISTS postgis;

-- A sensor location (station, camera trap, GPS tag, observer). Keyed by source + deployment id.
CREATE TABLE IF NOT EXISTS deployments (
  id                 text PRIMARY KEY,                -- "<source_system>:<deployment_id>"
  source_system      text NOT NULL,
  deployment_id      text NOT NULL,
  name               text,
  sensor_type        text NOT NULL,                   -- acoustic-recorder | camera-trap | other
  sensor_model       text,
  latitude           double precision NOT NULL,
  longitude          double precision NOT NULL,
  coord_uncertainty_m double precision,
  timezone           text,
  geom               geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  first_seen         timestamptz NOT NULL DEFAULT now(),
  last_seen          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployments_geom_idx ON deployments USING gist (geom);
CREATE INDEX IF NOT EXISTS deployments_source_idx ON deployments (source_system);

-- One WDX detection event. Columns are denormalised from the WDX JSON for fast map queries; raw keeps the full event.
CREATE TABLE IF NOT EXISTS events (
  event_id           text PRIMARY KEY,
  deployment_id      text NOT NULL REFERENCES deployments(id),
  source_system      text NOT NULL,
  source_record_id   text,
  event_start        timestamptz NOT NULL,
  event_end          timestamptz,
  scientific_name    text,
  vernacular_name    text,
  taxon_rank         text,
  taxon_id           text,
  confidence         double precision NOT NULL,
  classifier_name    text NOT NULL,
  classifier_version text NOT NULL,
  media_type         text,
  media_url          text,
  review_status      text NOT NULL DEFAULT 'unreviewed',
  license            text,
  latitude           double precision NOT NULL,
  longitude          double precision NOT NULL,
  geom               geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  raw                jsonb NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_start_idx ON events (event_start DESC);
CREATE INDEX IF NOT EXISTS events_species_start_idx ON events (scientific_name, event_start DESC);
CREATE INDEX IF NOT EXISTS events_geom_idx ON events USING gist (geom);
CREATE INDEX IF NOT EXISTS events_source_idx ON events (source_system, event_start DESC);

-- API keys for producers pushing WDX events.
CREATE TABLE IF NOT EXISTS api_keys (
  id            serial PRIMARY KEY,
  key_hash      text NOT NULL UNIQUE,                 -- sha256 hex of the raw key
  name          text NOT NULL,
  source_system text,                                 -- if set, key may only push events for this source
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Cursor/state for pull connectors.
CREATE TABLE IF NOT EXISTS pull_state (
  connector   text PRIMARY KEY,
  cursor      text,
  last_run_at timestamptz,
  last_count  integer,
  last_error  text
);

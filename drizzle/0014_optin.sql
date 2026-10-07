-- BirdWeather stations whose owners opted in (Tim's suggested model, October 2026).
-- The station token is stored encrypted (AES-256-GCM) because it also allows posting to the station.
CREATE TABLE IF NOT EXISTS bw_optin (
  station_id      integer PRIMARY KEY,
  token_enc       text,
  display_name    text,                        -- null: shown as an anonymous station
  station_type    text,
  lat             double precision,
  lon             double precision,
  precision_km    smallint NOT NULL DEFAULT 10, -- coordinates are rounded to this before anything is published
  license         text NOT NULL DEFAULT 'CC-BY-4.0',
  in_releases     boolean NOT NULL DEFAULT true,
  contact         text,
  status          text NOT NULL DEFAULT 'active', -- active | withdrawn
  history_from    date,                        -- earliest day pulled so far (history is filled backwards)
  last_pull_at    timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_ip_hash text
);
-- Daily species counts per opted-in station: small, and what the open releases use.
CREATE TABLE IF NOT EXISTS bw_optin_daily (
  station_id      integer NOT NULL,
  day             date NOT NULL,
  scientific_name text NOT NULL,
  common_name     text,
  classification  text,
  count           integer NOT NULL,
  almost_certain  integer,
  PRIMARY KEY (station_id, day, scientific_name)
);

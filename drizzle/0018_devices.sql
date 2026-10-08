-- Device registry (Phase 0 of the WildNetwork Base). A device gets its own push key; health reports (WDX device status) are kept 30 days.
CREATE TABLE IF NOT EXISTS devices (
  id              text PRIMARY KEY,                    -- wnd_<random>, also the key's device_id
  name            text NOT NULL,
  model           text NOT NULL,                       -- wildnetwork-base, birdnet-pi, audiomoth, ...
  source_system   text NOT NULL,
  hardware_id     text,                                -- never shown publicly
  contact         text,
  created_ip_hash text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_status     jsonb,
  last_status_at  timestamptz
);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS device_id text;
CREATE INDEX IF NOT EXISTS api_keys_device_idx ON api_keys (device_id);
CREATE TABLE IF NOT EXISTS device_status (
  device_id   text NOT NULL,
  at          timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status      jsonb NOT NULL,
  PRIMARY KEY (device_id, at)
);

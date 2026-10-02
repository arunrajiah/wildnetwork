-- Questions asked through the Ask box: used for rate limiting, a short answer cache, and reviewing answer quality.
-- The asker is stored only as a salted hash of the IP address.
CREATE TABLE IF NOT EXISTS ask_log (
  id          bigserial PRIMARY KEY,
  ip_hash     text NOT NULL,
  question    text NOT NULL,
  q_norm      text NOT NULL,
  answer      text,
  species     jsonb,
  tools       jsonb,
  model       text,
  tokens      integer,
  ms          integer,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_log_ip_idx ON ask_log (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS ask_log_q_idx ON ask_log (q_norm, created_at DESC);

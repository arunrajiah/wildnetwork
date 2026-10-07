-- Every opt-in form submission, so failed tokens count against the per-address daily limit. Rows older than a day are deleted on the next submission.
CREATE TABLE IF NOT EXISTS optin_attempts (
  ip_hash text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS optin_attempts_ip_idx ON optin_attempts (ip_hash, at);

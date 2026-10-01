-- Self-serve device keys: remember a hash of the registering IP to rate limit, and an optional contact.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_ip_hash text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS contact text;
CREATE INDEX IF NOT EXISTS api_keys_ip_idx ON api_keys (created_ip_hash, created_at);

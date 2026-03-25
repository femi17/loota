-- ============================================================================
-- Idempotency for purchase (and other) flows – avoid double credit / double purchase
-- ============================================================================
-- Run after database_schema.sql. Used by POST /api/inventory/purchase when
-- client sends idempotency_key; same key within 24h returns cached response.
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_requests (
  idempotency_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (idempotency_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_requests_created ON idempotency_requests(created_at);

ALTER TABLE idempotency_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own idempotency rows"
  ON idempotency_requests FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own idempotency row"
  ON idempotency_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Optional: periodic cleanup of old rows (e.g. via cron or manual delete where created_at < now() - interval '24 hours')

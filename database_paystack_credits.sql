-- ============================================================================
-- Paystack credits idempotency (prevent double-credit for same transaction)
-- ============================================================================
-- Run in Supabase SQL Editor after database_schema.sql.
-- Tracks which Paystack transaction references have already been credited so
-- both the webhook and add-coins(reference) can credit exactly once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_coins INTEGER NOT NULL CHECK (amount_coins > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_credits_reference ON payment_credits(reference);
CREATE INDEX IF NOT EXISTS idx_payment_credits_player ON payment_credits(player_id);

ALTER TABLE payment_credits ENABLE ROW LEVEL SECURITY;

-- add-coins route (authenticated user) inserts with player_id = auth.uid(). Webhook uses service role client (bypasses RLS).
CREATE POLICY "Users can insert own payment_credit record"
  ON payment_credits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Users can read own payment_credit records"
  ON payment_credits FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

-- Service role (used by webhook) bypasses RLS, so no policy needed for webhook.

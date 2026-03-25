-- ============================================================================
-- Referral validation: token-based links + pending referrals (server-validated)
-- ============================================================================
-- Run after database_hunt_referrals.sql.
-- Ensures credit-invite-reward only credits when the referrer was validated
-- (user landed via a referral link: either token created by referrer or legacy ref).
-- ============================================================================

-- Tokens created when referrer copies invite link; ref in URL is this id (not referrer's user id).
CREATE TABLE IF NOT EXISTS referral_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_tokens_hunt ON referral_tokens(hunt_id);
CREATE INDEX IF NOT EXISTS idx_referral_tokens_referrer ON referral_tokens(referrer_id);
ALTER TABLE referral_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own referral tokens"
  ON referral_tokens FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Authenticated can read any referral token (to resolve ref=token to referrer_id)"
  ON referral_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own referral token"
  ON referral_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);

-- Pending referral: recorded when referred user lands on /lobby?ref=TOKEN_OR_LEGACY_REF.
-- credit-invite-reward only credits if this row exists (referrer_id came from token or legacy ref).
CREATE TABLE IF NOT EXISTS pending_hunt_referrals (
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hunt_id, referred_id)
);
CREATE INDEX IF NOT EXISTS idx_pending_hunt_referrals_referrer ON pending_hunt_referrals(referrer_id);
ALTER TABLE pending_hunt_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own pending referral"
  ON pending_hunt_referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "Users can insert pending referral (referred user recording their ref)"
  ON pending_hunt_referrals FOR INSERT TO authenticated WITH CHECK (auth.uid() = referred_id);

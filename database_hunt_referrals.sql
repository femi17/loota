-- Hunt referral tracking: who invited whom to which hunt (for 500-coin invite reward)
-- Run after database_schema.sql

-- Table: one row per referred user per hunt (so we only credit referrer once per friend per hunt)
CREATE TABLE IF NOT EXISTS hunt_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hunt_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_hunt_referrals_hunt ON hunt_referrals(hunt_id);
CREATE INDEX IF NOT EXISTS idx_hunt_referrals_referrer ON hunt_referrals(referrer_id);

ALTER TABLE hunt_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own referral rows"
  ON hunt_referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Service role / API will insert; allow authenticated insert for credit-invite-reward API
CREATE POLICY "Authenticated can insert referral"
  ON hunt_referrals FOR INSERT TO authenticated
  WITH CHECK (true);

-- Add 'referral_bonus' to transactions transaction_type enum (recreate CHECK)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN (
    'purchase', 'rental', 'refuel', 'maintenance', 'rest', 'rejuvenate',
    'question_reward', 'hunt_completion', 'signup_bonus', 'refund',
    'referral_bonus'
  ));

-- RPC: credit referrer 500 coins when referred user has just joined the active hunt.
-- Callable by the referred user only (auth.uid() = p_referred_id). Runs with definer rights to update referrer's credits.
CREATE OR REPLACE FUNCTION credit_invite_reward(p_referrer_id UUID, p_referred_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hunt_id UUID;
  v_referrer_credits NUMERIC;
  v_invite_reward CONSTANT NUMERIC := 500;
BEGIN
  -- Only the referred user can call this for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_referred_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;
  IF p_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid referrer');
  END IF;

  -- Get active hunt
  SELECT id INTO v_hunt_id FROM hunts WHERE status = 'active' ORDER BY start_date ASC LIMIT 1;
  IF v_hunt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No active hunt');
  END IF;

  -- Referred must be registered for this hunt
  IF NOT EXISTS (SELECT 1 FROM hunt_registrations WHERE hunt_id = v_hunt_id AND player_id = p_referred_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not registered for hunt');
  END IF;

  -- Already credited for this referred user in this hunt
  IF EXISTS (SELECT 1 FROM hunt_referrals WHERE hunt_id = v_hunt_id AND referred_id = p_referred_id) THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Already credited');
  END IF;

  INSERT INTO hunt_referrals (hunt_id, referrer_id, referred_id) VALUES (v_hunt_id, p_referrer_id, p_referred_id);

  SELECT credits INTO v_referrer_credits FROM player_profiles WHERE user_id = p_referrer_id FOR UPDATE;
  IF v_referrer_credits IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Referrer profile not found');
  END IF;

  UPDATE player_profiles SET credits = credits + v_invite_reward, updated_at = NOW() WHERE user_id = p_referrer_id;

  INSERT INTO transactions (player_id, hunt_id, transaction_type, amount, description)
  VALUES (p_referrer_id, v_hunt_id, 'referral_bonus', v_invite_reward, 'Invite reward: friend joined hunt');

  RETURN jsonb_build_object('ok', true, 'credited', v_invite_reward);
END;
$$;

GRANT EXECUTE ON FUNCTION credit_invite_reward(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION credit_invite_reward(UUID, UUID) TO service_role;

-- Fix: deduct_credits used to RAISE 'Not registered for this hunt' before debiting the wallet,
-- which surfaced as HTTP 403 on POST /api/hunt/deduct-credits whenever hunt_id was sent
-- but hunt_registrations had no row yet (race) or drifted.
--
-- Replace the function with the version in database_atomic_credits.sql (wallet debit first;
-- total_spent only updates when a matching hunt_registrations row exists).
--
-- Run in Supabase → SQL Editor once.

CREATE OR REPLACE FUNCTION deduct_credits(
  p_amount NUMERIC,
  p_hunt_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new_credits NUMERIC;
  v_row_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> TRUNC(p_amount, 2) THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  UPDATE player_profiles
  SET credits = credits - p_amount,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND credits >= p_amount;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  SELECT credits INTO v_new_credits FROM player_profiles WHERE user_id = v_user_id;

  IF p_hunt_id IS NOT NULL THEN
    UPDATE hunt_registrations
    SET total_spent = COALESCE(total_spent, 0) + p_amount
    WHERE hunt_id = p_hunt_id AND player_id = v_user_id;
  END IF;

  RETURN jsonb_build_object('new_credits', v_new_credits);
END;
$$;

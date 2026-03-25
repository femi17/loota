-- ============================================================================
-- Atomic credit operations (deduct and purchase) – avoid race conditions
-- ============================================================================
-- Run in Supabase SQL Editor after database_schema.sql.
-- RPCs run with SECURITY DEFINER so they can update profiles/inventory/transactions
-- while still enforcing auth.uid() so callers only affect their own data.
-- ============================================================================

-- Deduct credits atomically. Optionally add to hunt_registrations.total_spent when a row exists.
-- Returns JSON { "new_credits": number }. Raises on insufficient balance or invalid input.
-- (Does not block the debit if p_hunt_id is set but the user has no registration row — total_spent
--  update simply affects 0 rows; avoids 403 when client sends hunt_id before registration sync.)
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

-- Purchase a travel mode atomically: deduct credits, upsert inventory, insert transaction.
-- p_item_id must be one of 'bicycle','motorbike','car'. p_cost must match server expectations.
CREATE OR REPLACE FUNCTION purchase_travel_mode(
  p_item_id TEXT,
  p_cost INTEGER
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
  v_allowed TEXT[] := ARRAY['bicycle','motorbike','car'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_item_id IS NULL OR NOT (p_item_id = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Invalid item_id';
  END IF;
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'Invalid cost';
  END IF;

  UPDATE player_profiles
  SET credits = credits - p_cost,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND credits >= p_cost;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  SELECT credits INTO v_new_credits FROM player_profiles WHERE user_id = v_user_id;

  INSERT INTO player_inventory (
    player_id, item_type, item_id, owned, purchased_at, health_percentage, fuel_percentage, updated_at
  ) VALUES (
    v_user_id, 'travel_mode', p_item_id, true, NOW(), 100, 100, NOW()
  )
  ON CONFLICT (player_id, item_type, item_id)
  DO UPDATE SET
    owned = true,
    purchased_at = NOW(),
    health_percentage = 100,
    fuel_percentage = 100,
    updated_at = NOW();

  INSERT INTO transactions (player_id, hunt_id, transaction_type, amount, description, item_id, metadata)
  VALUES (v_user_id, NULL, 'purchase', -p_cost, 'Travel mode purchase', p_item_id, NULL);

  RETURN jsonb_build_object('new_credits', v_new_credits);
END;
$$;

-- Grant execute to authenticated users (RPCs use auth.uid() so they only affect own data)
GRANT EXECUTE ON FUNCTION deduct_credits(NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION purchase_travel_mode(TEXT, INTEGER) TO authenticated;

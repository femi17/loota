-- ============================================================================
-- Create claim_hunt_session RPC (fixes PGRST202 "function not found")
-- ============================================================================
-- If you see 404 / PGRST202 for claim_hunt_session, run this entire file
-- in Supabase SQL Editor. Then reload the app so the map and hunt work.
-- ============================================================================

-- Ensure columns exist on player_positions
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS active_client_id TEXT,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_competing_client_id TEXT,
  ADD COLUMN IF NOT EXISTS last_competing_at TIMESTAMP WITH TIME ZONE;

-- Create the RPC the app calls with 5 params
CREATE OR REPLACE FUNCTION public.claim_hunt_session(
  p_hunt_id UUID,
  p_player_id TEXT,
  p_client_id TEXT,
  p_stale_ms INTEGER DEFAULT 5000,
  p_competing_window_ms INTEGER DEFAULT 10000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row player_positions%ROWTYPE;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_stale TIMESTAMP WITH TIME ZONE := v_now - (p_stale_ms || ' milliseconds')::INTERVAL;
  v_competing_stale TIMESTAMP WITH TIME ZONE := v_now - (p_competing_window_ms || ' milliseconds')::INTERVAL;
  v_another_seen BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_row
  FROM player_positions
  WHERE hunt_id = p_hunt_id AND player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', FALSE);
  END IF;

  IF v_row.active_client_id = p_client_id THEN
    IF v_row.last_competing_at IS NOT NULL
       AND v_row.last_competing_at > v_competing_stale
       AND (v_row.last_competing_client_id IS NULL OR v_row.last_competing_client_id <> p_client_id) THEN
      v_another_seen := TRUE;
    END IF;
    UPDATE player_positions
    SET last_active_at = v_now, active_client_id = p_client_id
    WHERE hunt_id = p_hunt_id AND player_id = p_player_id;
    RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', v_another_seen);
  END IF;

  IF v_row.last_active_at IS NOT NULL AND v_row.last_active_at >= v_stale THEN
    UPDATE player_positions
    SET last_competing_client_id = p_client_id, last_competing_at = v_now
    WHERE hunt_id = p_hunt_id AND player_id = p_player_id;
    RETURN jsonb_build_object('claimed', FALSE, 'another_device_seen', FALSE);
  END IF;

  UPDATE player_positions
  SET last_active_at = v_now, active_client_id = p_client_id
  WHERE hunt_id = p_hunt_id AND player_id = p_player_id;
  RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', FALSE);
END;
$$;

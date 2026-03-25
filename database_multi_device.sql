-- ============================================================================
-- MULTI-DEVICE: single active client per hunt session
-- ============================================================================
-- Run this in your Supabase SQL Editor after player_positions exists.
-- Adds active_client_id and last_active_at so only one tab/device can "own"
-- the session at a time. Use claim_hunt_session() from the app to heartbeat.
--
-- Client ID is per browser (localStorage), so multiple tabs in the same browser
-- share one ID and both can travel. Only a different browser/device (different
-- client_id) triggers "You are travelling already" / "Close the other device".
-- ============================================================================

-- Add columns to player_positions
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS active_client_id TEXT,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_competing_client_id TEXT,
  ADD COLUMN IF NOT EXISTS last_competing_at TIMESTAMP WITH TIME ZONE;

-- RPC: claim or refresh the hunt session for this client.
-- Returns JSON: { "claimed": boolean, "another_device_seen": boolean }.
-- claimed: this client now owns (or kept) the session.
-- another_device_seen: (only when claimed) another tab/device tried to claim recently; owner should stop and show "Close the other device".
-- When a client fails to claim, we record it so the owner's next heartbeat sees another_device_seen.
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

  -- Already this client: refresh and check if another device tried to claim recently
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

  -- Another client is active: record that this client tried (so owner sees another_device_seen)
  IF v_row.last_active_at IS NOT NULL AND v_row.last_active_at >= v_stale THEN
    UPDATE player_positions
    SET last_competing_client_id = p_client_id, last_competing_at = v_now
    WHERE hunt_id = p_hunt_id AND player_id = p_player_id;
    RETURN jsonb_build_object('claimed', FALSE, 'another_device_seen', FALSE);
  END IF;

  -- Previous owner stale; this client takes over
  UPDATE player_positions
  SET last_active_at = v_now, active_client_id = p_client_id
  WHERE hunt_id = p_hunt_id AND player_id = p_player_id;
  RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', FALSE);
END;
$$;

-- ============================================================================
-- MULTI-BROWSER LOGIN: detect when same user is signed in on 2+ browsers
-- ============================================================================
-- One row per user. Heartbeat from each browser (client_id). Only one client
-- is "active"; others get claimed=false. When another device tries, we set
-- last_competing_* so the active client sees another_device_seen and we show
-- "Multiple logins detected. Please close one of your sessions."
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_active_sessions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_client_id TEXT,
  last_active_at TIMESTAMP WITH TIME ZONE,
  last_competing_client_id TEXT,
  last_competing_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE user_active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own session"
  ON user_active_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own session"
  ON user_active_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session"
  ON user_active_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- RPC: claim or refresh the login session for this client (browser).
-- Returns JSON: { "claimed": boolean, "another_device_seen": boolean }.
-- claimed: this client is the single active session (or took over after stale).
-- another_device_seen: another browser tried to claim recently; show "close one".
CREATE OR REPLACE FUNCTION public.claim_user_session(
  p_user_id UUID,
  p_client_id TEXT,
  p_stale_ms INTEGER DEFAULT 15000,
  p_competing_window_ms INTEGER DEFAULT 20000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row user_active_sessions%ROWTYPE;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_stale TIMESTAMP WITH TIME ZONE := v_now - (p_stale_ms || ' milliseconds')::INTERVAL;
  v_competing_stale TIMESTAMP WITH TIME ZONE := v_now - (p_competing_window_ms || ' milliseconds')::INTERVAL;
  v_another_seen BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_row
  FROM user_active_sessions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO user_active_sessions (user_id, active_client_id, last_active_at)
    VALUES (p_user_id, p_client_id, v_now);
    RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', FALSE);
  END IF;

  -- Already this client: refresh and check if another device tried recently
  IF v_row.active_client_id = p_client_id THEN
    IF v_row.last_competing_at IS NOT NULL
       AND v_row.last_competing_at > v_competing_stale
       AND (v_row.last_competing_client_id IS NULL OR v_row.last_competing_client_id <> p_client_id) THEN
      v_another_seen := TRUE;
    END IF;
    UPDATE user_active_sessions
    SET last_active_at = v_now, active_client_id = p_client_id
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', v_another_seen);
  END IF;

  -- Another client is active: record that this client tried (so owner sees another_device_seen)
  IF v_row.last_active_at IS NOT NULL AND v_row.last_active_at >= v_stale THEN
    UPDATE user_active_sessions
    SET last_competing_client_id = p_client_id, last_competing_at = v_now
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('claimed', FALSE, 'another_device_seen', FALSE);
  END IF;

  -- Previous owner stale; this client takes over
  UPDATE user_active_sessions
  SET last_active_at = v_now, active_client_id = p_client_id
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object('claimed', TRUE, 'another_device_seen', FALSE);
END;
$$;

-- Narrator state: rich game-state blob for the broadcast narrator dashboard.
-- Updated by the hunt page every 1.5s during travel and every 4s via heartbeat.

ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS narrator_state JSONB;

COMMENT ON COLUMN player_positions.narrator_state IS
  'Rich game-state for broadcast narrator: distance, fuel, thresholds, decisions, vehicle health.';

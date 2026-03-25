-- Broadcast travel: store active travel route so the broadcast channel can animate
-- avatars along the same path as the hunts page (Go / Rent / Board).
-- Run in Supabase SQL Editor after player_positions exists.

ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS travel_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS travel_route_coords JSONB,
  ADD COLUMN IF NOT EXISTS travel_duration_ms INTEGER;

COMMENT ON COLUMN player_positions.travel_started_at IS 'When this player started moving along travel_route_coords (for broadcast animation).';
COMMENT ON COLUMN player_positions.travel_route_coords IS 'Route geometry [[lng,lat], ...] for broadcast to animate avatar along road.';
COMMENT ON COLUMN player_positions.travel_duration_ms IS 'Duration in ms to traverse the route (matches hunts page simulation).';

CREATE INDEX IF NOT EXISTS idx_player_positions_travel_started
  ON player_positions(hunt_id, player_id)
  WHERE travel_started_at IS NOT NULL;

-- Add constraint_state column to player_positions to persist stop/constraint state across page reloads.
-- This prevents users from cheating by reloading to clear the constraint.
-- Run this in Supabase SQL Editor after the main schema.

ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS constraint_state JSONB;

COMMENT ON COLUMN player_positions.constraint_state IS 'Stores active stop/constraint state (refuel/rest/rejuvenate) so it persists across page reloads. Format: { status: "to_stop", kind: "refuel"|"rest"|"rejuvenate", ... }';

CREATE INDEX IF NOT EXISTS idx_player_positions_constraint_state
  ON player_positions(hunt_id, player_id)
  WHERE constraint_state IS NOT NULL;

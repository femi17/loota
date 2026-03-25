-- Add default travel mode to player_profiles (used by Inventory "default" picker and Hunts travel modal).
-- Run in Supabase SQL Editor.

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS default_travel_mode TEXT DEFAULT 'walk';

COMMENT ON COLUMN player_profiles.default_travel_mode IS 'Preferred travel mode for hunts: walk, bicycle, motorbike, car, bus, or plane.';

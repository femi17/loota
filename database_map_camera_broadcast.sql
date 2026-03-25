-- Broadcast camera match: store hunts player's map zoom + container width.
-- Run in Supabase SQL Editor once.
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS map_zoom REAL,
  ADD COLUMN IF NOT EXISTS map_width_px INTEGER,
  ADD COLUMN IF NOT EXISTS map_center_lng REAL,
  ADD COLUMN IF NOT EXISTS map_center_lat REAL,
  ADD COLUMN IF NOT EXISTS map_bearing REAL,
  ADD COLUMN IF NOT EXISTS map_pitch REAL;

COMMENT ON COLUMN player_positions.map_zoom IS 'Last Mapbox zoom from hunts client (broadcast matches view)';
COMMENT ON COLUMN player_positions.map_width_px IS 'Hunts map container width in px (for zoom compensation)';
COMMENT ON COLUMN player_positions.map_center_lng IS 'Last Mapbox camera center lng from hunts client';
COMMENT ON COLUMN player_positions.map_center_lat IS 'Last Mapbox camera center lat from hunts client';
COMMENT ON COLUMN player_positions.map_bearing IS 'Last Mapbox camera bearing from hunts client';
COMMENT ON COLUMN player_positions.map_pitch IS 'Last Mapbox camera pitch from hunts client';

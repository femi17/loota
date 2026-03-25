-- Hunt location scope: host choice (state or Nationwide).
-- First waypoint = first quiz location; remove redundant start_lng/start_lat.
-- Run after database_hunt_locations.sql (or after schema that has waypoints).
--
-- Quick fix for existing projects: prefer database_migrations/sync_hunts_admin_create_columns.sql
-- (adds hunt_location + region_name + waypoints in one go).

-- Store host's location choice (state name or "Nationwide")
ALTER TABLE hunts
  ADD COLUMN IF NOT EXISTS hunt_location TEXT;

COMMENT ON COLUMN hunts.hunt_location IS 'Host choice: state name (e.g. Rivers, Lagos) or "Nationwide".';

-- Remove redundant start columns; first waypoint in waypoints[] is the first quiz location
ALTER TABLE hunts
  DROP COLUMN IF EXISTS start_lng,
  DROP COLUMN IF EXISTS start_lat;

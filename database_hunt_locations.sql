-- Hunt location/region: where the hunt takes place (AI-derived from target spend).
-- Run after database_schema.sql. Adds columns to hunts for start coords and waypoints.

-- Start location (center of play area; players start here)
ALTER TABLE hunts
  ADD COLUMN IF NOT EXISTS start_lng NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS start_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region_name TEXT,
  ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hunts.start_lng IS 'Longitude of hunt start / spawn point';
COMMENT ON COLUMN hunts.start_lat IS 'Latitude of hunt start / spawn point';
COMMENT ON COLUMN hunts.region_name IS 'Human-readable region/city name (e.g. Lagos, Abuja)';
COMMENT ON COLUMN hunts.waypoints IS 'Ordered clue locations: [{ "label": string, "lng": number, "lat": number }, ...]. Length = number_of_hunts.';

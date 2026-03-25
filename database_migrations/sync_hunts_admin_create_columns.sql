-- Fix: "Could not find the 'hunt_location' column of 'hunts' in the schema cache"
-- (and related missing columns used by Admin → Create Hunt.)
--
-- Run once in Supabase: Dashboard → SQL → New query → Run.
-- PostgREST refreshes the schema cache automatically after DDL.

ALTER TABLE hunts
  ADD COLUMN IF NOT EXISTS hunt_location TEXT;

ALTER TABLE hunts
  ADD COLUMN IF NOT EXISTS region_name TEXT;

ALTER TABLE hunts
  ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hunts.hunt_location IS 'Host choice: state name (e.g. Rivers, Lagos) or "Nationwide".';
COMMENT ON COLUMN hunts.region_name IS 'Human-readable region/city name (e.g. Lagos, Abuja)';
COMMENT ON COLUMN hunts.waypoints IS 'Ordered clue locations: [{ "label", "lng", "lat" }, ...].';

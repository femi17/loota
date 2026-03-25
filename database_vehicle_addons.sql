-- ============================================================================
-- VEHICLE ADD-ONS & NON-WINNER DISCOUNT
-- ============================================================================
-- Run in Supabase SQL Editor. Requires: auth.users, player_profiles, hunts, hunt_registrations.
-- ============================================================================

-- Optional: extend player_profiles to cache "has non-winner discount" for current hunt period
-- (Alternatively, compute from hunt_registrations: player not in top N for last completed hunt.)
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS non_winner_discount_until TIMESTAMPTZ;

COMMENT ON COLUMN player_profiles.non_winner_discount_until IS 'If set, player gets 30% off vehicle purchase until this time (set when hunt ends and they are not a prize winner).';

-- Player vehicle add-ons (upsells): helmet, lights, insurance, registration, license
CREATE TABLE IF NOT EXISTS player_vehicle_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL CHECK (vehicle_id IN ('bicycle', 'motorbike', 'car')),
  addon_type TEXT NOT NULL CHECK (addon_type IN ('helmet', 'lights', 'insurance', 'registration', 'license')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(player_id, vehicle_id, addon_type)
);

COMMENT ON TABLE player_vehicle_addons IS 'Upsell add-ons per vehicle. license, insurance, registration are renewable (expires_at set).';
COMMENT ON COLUMN player_vehicle_addons.expires_at IS 'For renewable add-ons (license, insurance, registration); NULL for one-time (helmet, lights).';

CREATE INDEX IF NOT EXISTS idx_player_vehicle_addons_player ON player_vehicle_addons(player_id);
CREATE INDEX IF NOT EXISTS idx_player_vehicle_addons_expires ON player_vehicle_addons(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE player_vehicle_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vehicle addons"
  ON player_vehicle_addons FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

CREATE POLICY "Users can insert own vehicle addon"
  ON player_vehicle_addons FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Users can update own vehicle addon"
  ON player_vehicle_addons FOR UPDATE TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

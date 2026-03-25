-- Hunt winners table (one winner row per hunt + player), for admin reporting and payout workflows.

CREATE TABLE IF NOT EXISTS hunt_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keys_earned INTEGER,
  keys_required INTEGER,
  won_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hunt_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_hunt_winners_hunt_id ON hunt_winners(hunt_id);
CREATE INDEX IF NOT EXISTS idx_hunt_winners_player_id ON hunt_winners(player_id);
CREATE INDEX IF NOT EXISTS idx_hunt_winners_won_at ON hunt_winners(won_at DESC);

ALTER TABLE hunt_winners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hunt_winners' AND policyname = 'Players can read own winner rows'
  ) THEN
    CREATE POLICY "Players can read own winner rows"
      ON hunt_winners FOR SELECT
      USING (auth.uid() = player_id);
  END IF;
END $$;

-- Tight security: clients cannot insert winner rows directly.
-- Winners are written by trusted server code (service role) after key verification.
DROP POLICY IF EXISTS "Players can upsert own winner rows" ON hunt_winners;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hunt_winners' AND policyname = 'Admins can read all hunt winners'
  ) THEN
    CREATE POLICY "Admins can read all hunt winners"
      ON hunt_winners FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_profiles a WHERE a.user_id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_hunt_winners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_hunt_winners_updated_at ON hunt_winners;
CREATE TRIGGER update_hunt_winners_updated_at
  BEFORE UPDATE ON hunt_winners
  FOR EACH ROW
  EXECUTE FUNCTION update_hunt_winners_updated_at();

-- ============================================================================
-- Broadcast: hunt_player_actions for live action feed
-- ============================================================================
-- Keys are awarded by the client when a quiz is passed (onUnlockTaskCorrect /
-- onPublicTaskCorrect) and saved to player_positions. Do NOT add a trigger on
-- question_responses to increment keys — that caused double count (first quiz
-- showed 2 keys instead of 1). See database_keys_single_source.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hunt_player_actions: one row per action for broadcast feed
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hunt_player_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'constraint_entered',  -- stopped (refuel/rest/rejuvenate)
    'constraint_exited',   -- left stop
    'quiz_started',       -- opened quiz at waypoint
    'quiz_answered',       -- submitted answer (payload: correct, keys_earned)
    'key_earned'           -- got a key (from quiz or explicit event)
  )),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE hunt_player_actions IS 'Live action stream for broadcast: who stopped, who is at quiz, who passed/failed, who got a key.';
CREATE INDEX IF NOT EXISTS idx_hunt_player_actions_hunt_created
  ON hunt_player_actions(hunt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hunt_player_actions_player
  ON hunt_player_actions(hunt_id, player_id);

ALTER TABLE hunt_player_actions ENABLE ROW LEVEL SECURITY;

-- Broadcast page and admin need to read; only backend/hunt page insert
DROP POLICY IF EXISTS "Anyone can read hunt_player_actions for active hunts (broadcast)" ON hunt_player_actions;
CREATE POLICY "Anyone can read hunt_player_actions for active hunts (broadcast)"
  ON hunt_player_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hunts
      WHERE hunts.id = hunt_player_actions.hunt_id
        AND hunts.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert own hunt_player_actions" ON hunt_player_actions;
CREATE POLICY "Authenticated users can insert own hunt_player_actions"
  ON hunt_player_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

-- ----------------------------------------------------------------------------
-- Realtime: broadcast page subscribes to hunt_player_actions
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'hunt_player_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hunt_player_actions;
  END IF;
END $$;

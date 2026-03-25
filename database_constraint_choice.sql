-- Add constraint_choice to hunt_player_actions so we record "Go to this stop" vs "I'll keep going".
-- Run in Supabase SQL Editor after database_broadcast_actions.sql.
-- If DROP fails (wrong constraint name), run: SELECT conname FROM pg_constraint WHERE conrelid = 'hunt_player_actions'::regclass AND contype = 'c';

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'hunt_player_actions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%action_type%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hunt_player_actions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE hunt_player_actions
  ADD CONSTRAINT hunt_player_actions_action_type_check
  CHECK (action_type IN (
    'constraint_entered',
    'constraint_exited',
    'constraint_choice',  -- payload: { choice: 'go_to_stop' | 'keep_going', kind?: 'refuel'|'rest'|'rejuvenate' }
    'quiz_started',
    'quiz_answered',
    'key_earned'
  ));

COMMENT ON TABLE hunt_player_actions IS 'Live action stream for broadcast: who stopped, who chose go/keep going, who is at quiz, who passed/failed, who got a key.';

-- Broadcast Challenge Feed: ensure question_responses exists and allow public read for active hunts.
-- Run in Supabase SQL Editor.
-- If question_responses already exists (from main schema), only the policy is added.

-- 1. Create table if missing (matches database_schema.sql)
CREATE TABLE IF NOT EXISTS question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID REFERENCES hunts(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT NOT NULL,
  question_text TEXT,
  question_location TEXT,
  answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_taken_seconds INTEGER,
  credits_earned NUMERIC(15, 2) DEFAULT 0,
  keys_earned INTEGER DEFAULT 0
);

-- 2. Indexes (ignore errors if they exist)
CREATE INDEX IF NOT EXISTS idx_question_responses_hunt ON question_responses(hunt_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_player ON question_responses(player_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_answered ON question_responses(answered_at);

-- 3. RLS
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;

-- 4. Policies (idempotent: drop then create)
-- Broadcast: anon can read responses for active hunts (Challenge Feed)
DROP POLICY IF EXISTS "Anyone can read question responses for active hunts (broadcast)" ON question_responses;
CREATE POLICY "Anyone can read question responses for active hunts (broadcast)"
  ON question_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hunts
      WHERE hunts.id = question_responses.hunt_id
        AND hunts.status = 'active'
    )
  );

-- If this is a fresh table, add app policies so players and admins work:
DROP POLICY IF EXISTS "Players can read own responses" ON question_responses;
CREATE POLICY "Players can read own responses"
  ON question_responses FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Players can insert own response" ON question_responses;
CREATE POLICY "Players can insert own response"
  ON question_responses FOR INSERT
  WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "Admins can read all responses" ON question_responses;
CREATE POLICY "Admins can read all responses"
  ON question_responses FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_profiles WHERE user_id = auth.uid())
  );

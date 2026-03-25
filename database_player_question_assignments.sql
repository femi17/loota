-- Per-player question assignment: so each player gets a different question per step (reduces cheating).
-- When hunt has no pre-generated questions, AI generates one here (question_text, correct_answer, options).
-- Run this in Supabase SQL Editor after the main schema.

DROP TABLE IF EXISTS player_question_assignments CASCADE;

CREATE TABLE player_question_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL, -- 0 = public task, 1+ = unlock steps
  question_index INTEGER, -- index into hunts.questions (null when AI-generated)
  question_text TEXT, -- AI-generated question (when hunt.questions is empty)
  correct_answer TEXT,
  options JSONB, -- array of strings for multiple choice
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hunt_id, player_id, step_index)
);

CREATE INDEX idx_player_question_assignments_lookup
  ON player_question_assignments(hunt_id, player_id, step_index);

ALTER TABLE player_question_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own question assignments"
  ON player_question_assignments FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

CREATE POLICY "Users can insert own question assignments"
  ON player_question_assignments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Users can update own question assignments"
  ON player_question_assignments FOR UPDATE TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

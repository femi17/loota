-- Append-only log of every quiz question served to a player.
-- Purpose: prevent repeating questions that were previously served (even if answered wrong or timed out).
-- Run this in Supabase SQL Editor after the main schema.

CREATE TABLE IF NOT EXISTS player_question_serves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  served_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hunt_id, player_id, step_index, question_text)
);

CREATE INDEX IF NOT EXISTS idx_player_question_serves_hunt
  ON player_question_serves(hunt_id);

CREATE INDEX IF NOT EXISTS idx_player_question_serves_player
  ON player_question_serves(player_id);

ALTER TABLE player_question_serves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own question serves"
  ON player_question_serves FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

CREATE POLICY "Users can insert own question serves"
  ON player_question_serves FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);


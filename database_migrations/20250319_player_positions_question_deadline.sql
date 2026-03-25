-- Run on Supabase SQL editor (or your migration runner) if the column is missing.
-- Stores when the active quiz timer ends so the broadcast page can show a live countdown.

ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS question_deadline_at TIMESTAMPTZ;

COMMENT ON COLUMN player_positions.question_deadline_at IS 'When the current quiz timer expires (set when question is served; cleared on answer/timeout).';

-- Add tables to Supabase Realtime publication (postgres_changes).
-- Recommended for /broadcast/[huntId]: live player_positions updates keep Show all aligned with hunts (otherwise polling only).
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor).
-- Verify: Dashboard → Database → Publications → supabase_realtime.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'player_positions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_positions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'question_responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE question_responses;
  END IF;
END $$;

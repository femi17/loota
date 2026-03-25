-- ============================================================================
-- LOBBY CHAT
-- ============================================================================
-- Run this in Supabase SQL Editor to add lobby chat support.
-- Requires: hunts, auth.users (Supabase default)
-- ============================================================================

-- Lobby messages: one channel per hunt (hunt_id). Sender from auth + player_profiles for display.
CREATE TABLE IF NOT EXISTS lobby_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_username TEXT,
  sender_avatar_url TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lobby_messages_body_length CHECK (char_length(body) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_lobby_messages_hunt_created ON lobby_messages(hunt_id, created_at DESC);

ALTER TABLE lobby_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all messages for any hunt (lobby is public to signed-in users)
CREATE POLICY "Authenticated users can read lobby messages"
  ON lobby_messages FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert messages as themselves
CREATE POLICY "Users can insert own lobby message"
  ON lobby_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Lobby chat uses polling (every few seconds) in the app; no Realtime/Replication needed.

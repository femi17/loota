-- ============================================================================
-- Fix: Keys awarded only by client when quiz is passed (single source of truth)
-- ============================================================================
-- The client awards keys via onUnlockTaskCorrect/onPublicTaskCorrect and saves
-- to player_positions. The sync_player_keys_on_response trigger was ALSO
-- incrementing keys when question_responses was inserted, causing double count
-- (first quiz showed 2 keys instead of 1).
-- Drop the trigger so keys are awarded only when the user passes a quiz.
-- Run in Supabase SQL Editor.
-- ============================================================================

DROP TRIGGER IF EXISTS sync_player_keys_on_response ON question_responses;

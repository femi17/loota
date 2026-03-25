-- ============================================================================
-- DROP TABLES THAT ARE NOT USED IN THE APP
-- ============================================================================
-- Run this in Supabase SQL Editor. Each DROP is IF EXISTS so missing tables
-- are skipped. CASCADE drops dependent views, triggers, policies, etc.
--
-- Tables we KEEP (used in app):
--   admin_profiles, hunt_referrals, hunt_registrations, hunts, lobby_messages,
--   player_inventory, player_positions, player_profiles, player_question_assignments,
--   transactions, user_active_sessions
--
-- Tables we DROP (not referenced anywhere in the Loota app):
--   challenge_attempts, messages, room_members, wallet_ledger, wallets,
--   player_hunt_runs, question_responses, player_vehicle_addons
-- ============================================================================

-- Tables that are not part of Loota app (from other projects or experiments)
DROP TABLE IF EXISTS challenge_attempts CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS room_members CASCADE;
DROP TABLE IF EXISTS wallet_ledger CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;

-- Not used in app (no .from("player_hunt_runs") or RPC references)
DROP TABLE IF EXISTS player_hunt_runs CASCADE;

-- Optional vehicle add-ons: never used in app
DROP TABLE IF EXISTS player_vehicle_addons CASCADE;

-- Legacy question table: app uses player_question_assignments instead
DROP TABLE IF EXISTS question_responses CASCADE;

-- ============================================================================
-- "UNRESTRICTED" in Supabase = RLS (Row Level Security) is disabled on that
-- table. Dropping the table removes it; no need to enable RLS first.
-- Do NOT drop player_question_assignments (we use it for hunt questions).
-- ============================================================================

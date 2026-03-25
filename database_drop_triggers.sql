-- ============================================================================
-- DROP TRIGGERS (for clean re-run or to disable triggers on tables not in use)
-- ============================================================================
-- Run in Supabase SQL Editor when you need to:
-- - Re-run database_schema.sql / database_triggers.sql without conflicts, or
-- - Remove triggers from tables you do not use.
--
-- Tables that have triggers (all are core tables):
--   hunts, player_profiles, player_positions, player_inventory, auth.users
-- Optional tables with NO triggers (safe to drop table if unused):
--   player_vehicle_addons, user_active_sessions, hunt_referrals, player_question_assignments
-- ============================================================================

-- Triggers from database_schema.sql (updated_at)
DROP TRIGGER IF EXISTS update_hunts_updated_at ON hunts;
DROP TRIGGER IF EXISTS update_player_profiles_updated_at ON player_profiles;
DROP TRIGGER IF EXISTS update_player_positions_updated_at ON player_positions;
DROP TRIGGER IF EXISTS update_player_inventory_updated_at ON player_inventory;

-- Trigger from database_triggers.sql (auto-create player_profiles on signup)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ============================================================================
-- Optional: drop triggers only for tables you do NOT use
-- ============================================================================
-- If you do not use player_inventory (vehicle ownership/rentals), run:
--   DROP TRIGGER IF EXISTS update_player_inventory_updated_at ON player_inventory;
--
-- If you do not use player_positions (live hunt map), run:
--   DROP TRIGGER IF EXISTS update_player_positions_updated_at ON player_positions;
--
-- Do NOT drop on_auth_user_created unless you create profiles another way.
-- ============================================================================

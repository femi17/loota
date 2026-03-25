-- ============================================================================
-- Fix PGRST203: remove overloaded claim_hunt_session so only one version exists
-- ============================================================================
-- Run in Supabase SQL Editor if you see "Could not choose the best candidate
-- function" when calling claim_hunt_session. Then re-run database_multi_device.sql
-- (or the CREATE OR REPLACE FUNCTION claim_hunt_session block) to recreate it.
-- ============================================================================

DROP FUNCTION IF EXISTS public.claim_hunt_session(uuid, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.claim_hunt_session(uuid, uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.claim_hunt_session(uuid, text, text);
DROP FUNCTION IF EXISTS public.claim_hunt_session(uuid, uuid, text);

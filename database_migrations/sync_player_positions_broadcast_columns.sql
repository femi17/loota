-- Keep `player_positions` in sync with the app. If ANY column below is missing on
-- Supabase, PostgREST returns 400 with proxy_status `error=PGRST204` (unknown column
-- in the upsert body). Hunts heartbeats send: active_client_id, last_active_at,
-- narrator_state, travel_*, constraint_state, and full map camera fields.
--
-- Run once in Supabase → SQL Editor (safe to re-run: IF NOT EXISTS).

-- Travel animation (database_broadcast_travel.sql)
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS travel_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS travel_route_coords JSONB,
  ADD COLUMN IF NOT EXISTS travel_duration_ms INTEGER;

-- Quiz countdown (database_migrations/20250319_player_positions_question_deadline.sql)
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS question_deadline_at TIMESTAMPTZ;

-- Multi-device session (database_multi_device.sql) — required on every Hunts upsert
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS active_client_id TEXT,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_competing_client_id TEXT,
  ADD COLUMN IF NOT EXISTS last_competing_at TIMESTAMPTZ;

-- Stop / refuel flow (database_constraint_state.sql)
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS constraint_state JSONB;

-- Narrator card (database_narrator_state.sql)
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS narrator_state JSONB;

-- Map camera (database_map_camera_broadcast.sql) — Hunts spreads all of these via getHuntsMapCameraDbFields()
ALTER TABLE player_positions
  ADD COLUMN IF NOT EXISTS map_zoom DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS map_width_px INTEGER,
  ADD COLUMN IF NOT EXISTS map_center_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS map_center_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS map_bearing DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS map_pitch DOUBLE PRECISION;

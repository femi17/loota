-- ============================================================================
-- LOOTA DATABASE SCHEMA
-- ============================================================================
-- This file contains the complete database schema for the Loota treasure hunt platform.
-- Run this script in your Supabase SQL Editor to set up all tables and policies.
-- ============================================================================

-- ============================================================================
-- DROP EXISTING TABLES (Run this section first to start fresh)
-- ============================================================================
-- Note: Dropping tables with CASCADE will automatically drop all associated
-- policies, triggers, and dependent objects. No need to drop policies separately.

-- Drop tables (in reverse dependency order to handle foreign keys)
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS question_responses CASCADE;
DROP TABLE IF EXISTS player_inventory CASCADE;
DROP TABLE IF EXISTS lobby_messages CASCADE;
DROP TABLE IF EXISTS hunt_registrations CASCADE;
DROP TABLE IF EXISTS player_positions CASCADE;
DROP TABLE IF EXISTS player_profiles CASCADE;
DROP TABLE IF EXISTS hunts CASCADE;
DROP TABLE IF EXISTS admin_profiles CASCADE;

-- Drop functions (if they exist)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================================
-- CREATE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADMIN PROFILES
-- ----------------------------------------------------------------------------
-- Stores admin user profiles
CREATE TABLE admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. HUNTS
-- ----------------------------------------------------------------------------
-- Stores treasure hunt configurations and data
CREATE TABLE hunts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  prize TEXT NOT NULL,
  prize_pool NUMERIC(15, 2) NOT NULL,
  number_of_winners INTEGER NOT NULL,
  target_spend_per_user NUMERIC(15, 2) NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  entry_requirement INTEGER DEFAULT 0, -- Minimum level required
  image_url TEXT,
  number_of_hunts INTEGER NOT NULL, -- Number of clue locations
  keys_to_win INTEGER NOT NULL, -- Keys needed to win
  hunt_location TEXT, -- State name or "Nationwide" (admin create form)
  region_name TEXT, -- Display region (e.g. Lagos)
  waypoints JSONB DEFAULT '[]'::jsonb, -- Ordered clue locations
  pricing_config JSONB NOT NULL, -- Travel costs, refuel costs, etc.
  question_categories JSONB NOT NULL, -- Categories for questions
  difficulty_distribution JSONB NOT NULL, -- Distribution of question difficulties
  briefing TEXT NOT NULL, -- Hunt briefing text
  questions JSONB NOT NULL, -- Array of question objects
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. PLAYER PROFILES
-- ----------------------------------------------------------------------------
-- Stores player/user profile information
CREATE TABLE player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  username TEXT NOT NULL,
  credits NUMERIC(15, 2) DEFAULT 1000, -- Starting credits
  level INTEGER DEFAULT 1,
  total_keys_earned INTEGER DEFAULT 0,
  hunts_completed INTEGER DEFAULT 0,
  avatar_url TEXT, -- DiceBear or custom avatar URL
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. HUNT REGISTRATIONS
-- ----------------------------------------------------------------------------
-- Tracks which players have registered/joined which hunts
CREATE TABLE hunt_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID REFERENCES hunts(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE, -- When player actually started
  completed_at TIMESTAMP WITH TIME ZONE, -- When player completed the hunt
  keys_earned INTEGER DEFAULT 0, -- Keys earned in this hunt
  total_spent NUMERIC(15, 2) DEFAULT 0, -- Total credits spent in this hunt
  UNIQUE(hunt_id, player_id)
);

-- ----------------------------------------------------------------------------
-- 4b. LOBBY MESSAGES
-- ----------------------------------------------------------------------------
-- Chat messages per hunt lobby (one channel per hunt)
CREATE TABLE lobby_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_username TEXT,
  sender_avatar_url TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lobby_messages_body_length CHECK (char_length(body) <= 500)
);
CREATE INDEX idx_lobby_messages_hunt_created ON lobby_messages(hunt_id, created_at DESC);
ALTER TABLE lobby_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read lobby messages"
  ON lobby_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own lobby message"
  ON lobby_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- ----------------------------------------------------------------------------
-- 5. PLAYER POSITIONS
-- ----------------------------------------------------------------------------
-- Tracks player locations and state during active hunts
-- (Existing Supabase DBs: run database_migrations/sync_player_positions_broadcast_columns.sql if any column is missing — PostgREST PGRST204 on upsert.)
CREATE TABLE player_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID REFERENCES hunts(id) ON DELETE CASCADE NOT NULL,
  player_id TEXT NOT NULL, -- UUID as text for compatibility
  player_name TEXT NOT NULL,
  lng NUMERIC(10, 7) NOT NULL, -- Longitude
  lat NUMERIC(10, 7) NOT NULL, -- Latitude
  keys INTEGER DEFAULT 0, -- Keys earned in this hunt
  current_question TEXT, -- Current question ID or location
  answering_question BOOLEAN DEFAULT FALSE,
  question_deadline_at TIMESTAMPTZ, -- Quiz countdown end (broadcast); set when question served
  travel_mode TEXT, -- Current travel mode: walk, bicycle, motorbike, car, bus, plane
  travel_started_at TIMESTAMPTZ,
  travel_route_coords JSONB,
  travel_duration_ms INTEGER,
  active_client_id TEXT,
  last_active_at TIMESTAMPTZ,
  last_competing_client_id TEXT,
  last_competing_at TIMESTAMPTZ,
  constraint_state JSONB,
  narrator_state JSONB,
  map_zoom DOUBLE PRECISION,
  map_width_px INTEGER,
  map_center_lng DOUBLE PRECISION,
  map_center_lat DOUBLE PRECISION,
  map_bearing DOUBLE PRECISION,
  map_pitch DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hunt_id, player_id)
);

-- ----------------------------------------------------------------------------
-- 6. PLAYER INVENTORY
-- ----------------------------------------------------------------------------
-- Tracks player-owned travel modes and their state
CREATE TABLE player_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('travel_mode', 'other')), -- For future expansion
  item_id TEXT NOT NULL, -- travel_mode: walk, bicycle, motorbike, car, bus_pass, air_taxi
  owned BOOLEAN DEFAULT FALSE, -- True if purchased, false if only rented
  health_percentage NUMERIC(5, 2) DEFAULT 100.00, -- For vehicles: 0-100%
  fuel_percentage NUMERIC(5, 2) DEFAULT 100.00, -- For vehicles: 0-100%
  purchased_at TIMESTAMP WITH TIME ZONE,
  last_maintained_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(player_id, item_type, item_id)
);

-- ----------------------------------------------------------------------------
-- 7. QUESTION RESPONSES
-- ----------------------------------------------------------------------------
-- Tracks player answers to hunt questions
CREATE TABLE question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID REFERENCES hunts(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT NOT NULL, -- Reference to question in hunts.questions JSONB
  question_location TEXT, -- Location/clue where question was answered
  answer TEXT NOT NULL, -- Player's answer
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_taken_seconds INTEGER, -- Time taken to answer
  credits_earned NUMERIC(15, 2) DEFAULT 0, -- Credits earned for correct answer
  keys_earned INTEGER DEFAULT 0 -- Keys earned for correct answer
);

-- ----------------------------------------------------------------------------
-- 8. TRANSACTIONS
-- ----------------------------------------------------------------------------
-- Tracks all credit transactions (purchases, earnings, etc.)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hunt_id UUID REFERENCES hunts(id) ON DELETE SET NULL, -- NULL for non-hunt transactions
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'purchase', -- Buying travel mode
    'rental', -- Renting travel mode
    'refuel', -- Refueling vehicle
    'maintenance', -- Vehicle maintenance
    'rest', -- Rest action
    'rejuvenate', -- Rejuvenate action
    'question_reward', -- Reward for answering question
    'hunt_completion', -- Reward for completing hunt
    'signup_bonus', -- Initial signup bonus
    'refund' -- Refund for any reason
  )),
  amount NUMERIC(15, 2) NOT NULL, -- Positive for earnings, negative for spending
  description TEXT,
  item_id TEXT, -- Related item (travel_mode, question_id, etc.)
  metadata JSONB, -- Additional transaction data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Hunt indexes
CREATE INDEX idx_hunts_status ON hunts(status);
CREATE INDEX idx_hunts_dates ON hunts(start_date, end_date);
CREATE INDEX idx_hunts_entry_requirement ON hunts(entry_requirement);

-- Player profile indexes
CREATE INDEX idx_player_profiles_user ON player_profiles(user_id);
CREATE INDEX idx_player_profiles_level ON player_profiles(level);
CREATE INDEX idx_player_profiles_username ON player_profiles(username);

-- Hunt registration indexes
CREATE INDEX idx_hunt_registrations_hunt ON hunt_registrations(hunt_id);
CREATE INDEX idx_hunt_registrations_player ON hunt_registrations(player_id);
CREATE INDEX idx_hunt_registrations_started ON hunt_registrations(started_at);

-- Player position indexes
CREATE INDEX idx_player_positions_hunt ON player_positions(hunt_id);
CREATE INDEX idx_player_positions_player ON player_positions(player_id);
CREATE INDEX idx_player_positions_updated ON player_positions(updated_at);

-- Player inventory indexes
CREATE INDEX idx_player_inventory_player ON player_inventory(player_id);
CREATE INDEX idx_player_inventory_item ON player_inventory(item_type, item_id);

-- Question response indexes
CREATE INDEX idx_question_responses_hunt ON question_responses(hunt_id);
CREATE INDEX idx_question_responses_player ON question_responses(player_id);
CREATE INDEX idx_question_responses_answered ON question_responses(answered_at);

-- Transaction indexes
CREATE INDEX idx_transactions_player ON transactions(player_id);
CREATE INDEX idx_transactions_hunt ON transactions(hunt_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_created ON transactions(created_at);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunts ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE RLS POLICIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ADMIN PROFILES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Admins can read own profile"
  ON admin_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- HUNTS POLICIES
-- ----------------------------------------------------------------------------
-- Anyone can read active hunts
CREATE POLICY "Anyone can read active hunts"
  ON hunts FOR SELECT
  USING (status = 'active');

-- Admins can manage all hunts
CREATE POLICY "Admins can manage hunts"
  ON hunts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- PLAYER PROFILES POLICIES
-- ----------------------------------------------------------------------------
-- Players can read their own profile
CREATE POLICY "Players can read own profile"
  ON player_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Players can insert their own profile
CREATE POLICY "Players can insert own profile"
  ON player_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Players can update their own profile
CREATE POLICY "Players can update own profile"
  ON player_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Anyone can read profiles (for leaderboards, etc.)
CREATE POLICY "Anyone can read profiles"
  ON player_profiles FOR SELECT
  USING (true);

-- ----------------------------------------------------------------------------
-- HUNT REGISTRATIONS POLICIES
-- ----------------------------------------------------------------------------
-- Players can read their own registrations
CREATE POLICY "Players can read own registrations"
  ON hunt_registrations FOR SELECT
  USING (auth.uid() = player_id);

-- Players can register for hunts
CREATE POLICY "Players can insert own registration"
  ON hunt_registrations FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- Players can update their own registration (e.g. total_spent)
CREATE POLICY "Players can update own registration"
  ON hunt_registrations FOR UPDATE
  USING (auth.uid() = player_id);

-- Anyone can read registrations (for hunt stats)
CREATE POLICY "Anyone can read registrations"
  ON hunt_registrations FOR SELECT
  USING (true);

-- ----------------------------------------------------------------------------
-- PLAYER POSITIONS POLICIES
-- ----------------------------------------------------------------------------
-- Anyone can read player positions (for live tracking)
CREATE POLICY "Anyone can read player positions"
  ON player_positions FOR SELECT
  USING (true);

-- Players can update their own positions
CREATE POLICY "Players can update own position"
  ON player_positions FOR UPDATE
  USING (player_id = auth.uid()::text);

-- Players can insert their own positions
CREATE POLICY "Players can insert own position"
  ON player_positions FOR INSERT
  WITH CHECK (player_id = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- PLAYER INVENTORY POLICIES
-- ----------------------------------------------------------------------------
-- Players can read their own inventory
CREATE POLICY "Players can read own inventory"
  ON player_inventory FOR SELECT
  USING (auth.uid() = player_id);

-- Players can insert their own inventory items
CREATE POLICY "Players can insert own inventory"
  ON player_inventory FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- Players can update their own inventory
CREATE POLICY "Players can update own inventory"
  ON player_inventory FOR UPDATE
  USING (auth.uid() = player_id);

-- ----------------------------------------------------------------------------
-- QUESTION RESPONSES POLICIES
-- ----------------------------------------------------------------------------
-- Players can read their own responses
CREATE POLICY "Players can read own responses"
  ON question_responses FOR SELECT
  USING (auth.uid() = player_id);

-- Players can submit their own responses
CREATE POLICY "Players can insert own response"
  ON question_responses FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- Admins can read all responses
CREATE POLICY "Admins can read all responses"
  ON question_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- TRANSACTIONS POLICIES
-- ----------------------------------------------------------------------------
-- Players can read their own transactions
CREATE POLICY "Players can read own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = player_id);

-- Players can insert their own transactions (for purchases, etc.)
CREATE POLICY "Players can insert own transaction"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- ============================================================================
-- CREATE FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_hunts_updated_at
  BEFORE UPDATE ON hunts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_profiles_updated_at
  BEFORE UPDATE ON player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_positions_updated_at
  BEFORE UPDATE ON player_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_inventory_updated_at
  BEFORE UPDATE ON player_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA SETUP (Optional)
-- ----------------------------------------------------------------------------
-- You can add default travel modes to player_inventory here if needed
-- ============================================================================

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. All timestamps use TIMESTAMP WITH TIME ZONE for proper timezone handling
-- 2. Credits use NUMERIC(15, 2) for precise decimal calculations
-- 3. RLS policies ensure data security at the database level
-- 4. Indexes are created for common query patterns
-- 5. Triggers automatically update updated_at timestamps
-- 6. Foreign keys use ON DELETE CASCADE to maintain referential integrity
-- ============================================================================

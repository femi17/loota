# Supabase Database Setup Guide

This guide will help you set up the required database tables in Supabase for the Loota admin system.

## Required Tables

### 1. `admin_profiles` Table

```sql
CREATE TABLE admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read their own profile
CREATE POLICY "Admins can read own profile"
  ON admin_profiles FOR SELECT
  USING (auth.uid() = user_id);
```

### 2. `hunts` Table

```sql
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
  entry_requirement INTEGER DEFAULT 0,
  image_url TEXT,
  number_of_hunts INTEGER NOT NULL,
  keys_to_win INTEGER NOT NULL,
  hunt_location TEXT,
  region_name TEXT,
  waypoints JSONB DEFAULT '[]'::jsonb,
  pricing_config JSONB NOT NULL,
  question_categories JSONB NOT NULL,
  difficulty_distribution JSONB NOT NULL,
  briefing TEXT NOT NULL,
  questions JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE hunts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active hunts
CREATE POLICY "Anyone can read active hunts"
  ON hunts FOR SELECT
  USING (status = 'active');

-- Policy: Admins can manage all hunts
CREATE POLICY "Admins can manage hunts"
  ON hunts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE user_id = auth.uid()
    )
  );
```

### 3. `player_profiles` Table

```sql
CREATE TABLE player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  username TEXT NOT NULL,
  credits NUMERIC(15, 2) DEFAULT 1000,
  level INTEGER DEFAULT 1,
  total_keys_earned INTEGER DEFAULT 0,
  hunts_completed INTEGER DEFAULT 0,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Players can read their own profile
CREATE POLICY "Players can read own profile"
  ON player_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Players can insert their own profile
CREATE POLICY "Players can insert own profile"
  ON player_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Players can update their own profile
CREATE POLICY "Players can update own profile"
  ON player_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Anyone can read profiles (for leaderboards, etc.)
CREATE POLICY "Anyone can read profiles"
  ON player_profiles FOR SELECT
  USING (true);
```

### 4. `player_positions` Table

```sql
CREATE TABLE player_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id UUID REFERENCES hunts(id) ON DELETE CASCADE NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  lng NUMERIC(10, 7) NOT NULL,
  lat NUMERIC(10, 7) NOT NULL,
  keys INTEGER DEFAULT 0,
  current_question TEXT,
  answering_question BOOLEAN DEFAULT FALSE,
  question_deadline_at TIMESTAMPTZ,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hunt_id, player_id)
);

-- Enable RLS
ALTER TABLE player_positions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read player positions
CREATE POLICY "Anyone can read player positions"
  ON player_positions FOR SELECT
  USING (true);

-- Policy: Players can update their own positions
CREATE POLICY "Players can update own position"
  ON player_positions FOR UPDATE
  USING (player_id = auth.uid()::text);

-- Policy: Players can insert their own positions
CREATE POLICY "Players can insert own position"
  ON player_positions FOR INSERT
  WITH CHECK (player_id = auth.uid()::text);
```

### 5. Create Indexes

```sql
-- Index for faster hunt lookups
CREATE INDEX idx_hunts_status ON hunts(status);
CREATE INDEX idx_hunts_dates ON hunts(start_date, end_date);

-- Index for player position queries
CREATE INDEX idx_player_positions_hunt ON player_positions(hunt_id);
CREATE INDEX idx_player_positions_player ON player_positions(player_id);
CREATE INDEX idx_player_positions_updated ON player_positions(updated_at);
```

-- Index for player profiles
CREATE INDEX idx_player_profiles_user ON player_profiles(user_id);
CREATE INDEX idx_player_profiles_level ON player_profiles(level);

### 6. Enable Realtime

In Supabase Dashboard:
1. Go to **Database** → **Replication** (or Table Editor → select table → **Enable Realtime**)
2. Enable replication for **`player_positions`** — for real-time updates in the broadcast view
3. Enable replication for **`player_profiles`** — so the wallet/credits in the menu update immediately when credits are deducted (e.g. rent, bus, hospital), and stay in sync across tabs

## Environment Variables

Add these to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

## Creating Your First Admin User

1. Sign up a user in Supabase Auth
2. Get the user's UUID from the auth.users table
3. Insert into admin_profiles:

```sql
INSERT INTO admin_profiles (user_id)
VALUES ('your-user-uuid-here');
```

## Optional: Per-player question assignments (anti-cheat)

To give each player a **different** question per step (so they can’t share answers), run the script `database_player_question_assignments.sql` in the Supabase SQL Editor. This creates the `player_question_assignments` table used by `GET /api/hunt/get-question`.

## OpenAI usage

- **Admin**: Hunt config and questions are generated with OpenAI when creating a hunt (`OPENAI_API_KEY` required).
- **Player**: Quiz answers can be graded by OpenAI via `POST /api/hunt/validate-answer` (accepts synonyms and phrasing). See **`docs/OPENAI_USAGE.md`** for where OpenAI is used and how to wire get-question for per-player questions.

## Live broadcast (avatars moving on map)

For the **public broadcast** (`/broadcast/[huntId]`) and **admin broadcast** to receive live position updates, the tables must be in Supabase’s Realtime publication. Run **`database_realtime_broadcast.sql`** in the Supabase SQL Editor once. See **`docs/BROADCAST_LIVE.md`** for what’s implemented and what was fixed.

## Notes

- The `pricing_config` field stores JSON with all the calculated pricing
- Player positions are updated in real-time via Supabase Realtime (after running `database_realtime_broadcast.sql`)
- The broadcast view subscribes to changes in `player_positions` table
- Questions are generated using OpenAI API when creating hunts

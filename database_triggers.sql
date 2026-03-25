-- ============================================================================
-- DATABASE TRIGGERS FOR AUTOMATIC PROFILE CREATION
-- ============================================================================
-- This trigger automatically creates a player profile when a new user signs up.
-- Run this in your Supabase SQL Editor after creating the tables.
-- ============================================================================

-- Compact number suffix for default usernames: 1000 → 1k, 1001 → 1k1, 1e6 → 1m, etc.
CREATE OR REPLACE FUNCTION public.format_loota_number_suffix(n bigint)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k bigint;
  m bigint;
  r bigint;
BEGIN
  IF n < 1000 THEN
    RETURN n::text;
  END IF;
  IF n < 1000000 THEN
    k := n / 1000;
    r := n % 1000;
    IF r = 0 THEN
      RETURN k::text || 'k';
    END IF;
    RETURN k::text || 'k' || r::text;
  END IF;
  m := n / 1000000;
  r := n % 1000000;
  IF r = 0 THEN
    RETURN m::text || 'm';
  END IF;
  RETURN m::text || 'm' || public.format_loota_number_suffix(r);
END;
$$;

-- Random integer in [1, 999999999] formatted for Loota_<suffix> usernames
CREATE OR REPLACE FUNCTION public.random_loota_username_suffix()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT public.format_loota_number_suffix((1 + floor(random() * 999999999::double precision))::bigint);
$$;

-- Function to automatically create player profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  avatar_url TEXT;
  username TEXT;
  meta_user text;
BEGIN
  -- Generate avatar URL using DiceBear API (deterministic based on user ID)
  -- URL encode the user ID for the seed
  avatar_url := 'https://api.dicebear.com/8.x/thumbs/svg?seed=' || 
    replace(replace(replace(NEW.id::text, '-', ''), '{', ''), '}', '');
  
  meta_user := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');

  -- Get username from user metadata or generate Loota_<random compact number>
  username := COALESCE(
    meta_user,
    'Loota_' || public.random_loota_username_suffix()
  );

  -- Insert into player_profiles
  -- Use SECURITY DEFINER to bypass RLS policies
  INSERT INTO public.player_profiles (user_id, username, credits, level, avatar_url)
  VALUES (
    NEW.id,
    username,
    1000, -- Starting credits
    1,    -- Starting level
    avatar_url
  )
  ON CONFLICT (user_id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url,
    credits = GREATEST(player_profiles.credits, 1000); -- Keep existing credits if higher

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function after a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- NOTES
-- ============================================================================
-- This trigger will automatically create a player profile whenever a new user
-- is created in auth.users, regardless of whether email confirmation is
-- enabled or not.
--
-- The function uses SECURITY DEFINER to bypass RLS policies, allowing it to
-- insert into player_profiles even if the user doesn't have direct INSERT
-- permissions yet.
--
-- The ON CONFLICT clause prevents errors if the profile already exists.
-- ============================================================================

-- Increment player_profiles.level when a hunt is won (row inserted into hunt_winners).
-- NOT on lobby registration. Replaces the old hunt_registrations trigger if you ran it before.
--
-- Run in Supabase SQL Editor.

-- Remove previous migration (registration-based level bump), if present
DROP TRIGGER IF EXISTS on_hunt_registration_increment_level ON public.hunt_registrations;
DROP FUNCTION IF EXISTS public.increment_player_level_on_hunt_registration();

CREATE OR REPLACE FUNCTION public.increment_player_level_on_hunt_win()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.player_profiles
  SET level = COALESCE(level, 1) + 1
  WHERE user_id = NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_hunt_winners_increment_level ON public.hunt_winners;
CREATE TRIGGER on_hunt_winners_increment_level
  AFTER INSERT ON public.hunt_winners
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_player_level_on_hunt_win();

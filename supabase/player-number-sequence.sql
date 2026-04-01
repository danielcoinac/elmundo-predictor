-- ============================================================================
-- El Mundo Predictor — Atomic Player Number Assignment
-- ============================================================================
-- Replaces the unsafe MAX(player_number)+1 pattern in registration.
-- Uses a PostgreSQL sequence so concurrent registrations can never collide.
-- Run in Supabase SQL Editor.
-- ============================================================================

-- Create a dedicated sequence for player numbers (starts at 1, no gaps are guaranteed)
CREATE SEQUENCE IF NOT EXISTS player_number_seq START 1;

-- Backfill: advance the sequence past the current max to avoid collisions
DO $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(player_number), 0) INTO v_max FROM profiles;
  IF v_max > 0 THEN
    PERFORM setval('player_number_seq', v_max);
  END IF;
END;
$$;

-- Function called during registration — returns the next unique player number
CREATE OR REPLACE FUNCTION next_player_number()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT nextval('player_number_seq')::integer;
$$;

GRANT EXECUTE ON FUNCTION next_player_number() TO authenticated;

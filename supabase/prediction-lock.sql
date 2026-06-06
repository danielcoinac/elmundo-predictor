-- Prediction Locking via RLS
-- Prevents prediction changes after the global lock deadline.
-- This makes cheating impossible regardless of frontend manipulation.
-- Apply this in Supabase SQL Editor.

-- Step 1: Create a helper function that checks if predictions are still open.
-- Predictions lock 1 hour before the first match starts.
CREATE OR REPLACE FUNCTION predictions_open()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    now() < (
      SELECT MIN(
        (m.match_date || ' ' || COALESCE(m.match_time, '23:59'))::timestamptz - interval '1 hour'
      )
      FROM matches m
      WHERE m.status != 'finished'
    ),
    false
  );
$$;

-- Step 2: Add RLS policy that blocks inserts/updates after deadline.
-- Users can only modify their own predictions, and only while predictions_open() is true.

-- Drop existing permissive policies if they exist (from rls-policies.sql)
DROP POLICY IF EXISTS "predictions_user_insert" ON predictions;
DROP POLICY IF EXISTS "predictions_user_update" ON predictions;

CREATE POLICY "predictions_user_insert" ON predictions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND predictions_open()
  );

CREATE POLICY "predictions_user_update" ON predictions
  FOR UPDATE USING (
    auth.uid() = user_id
    AND predictions_open()
  );

-- Server-side time function for prediction deadline enforcement.
-- Prevents users from submitting predictions after deadline by changing device clock.
-- Apply this in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT now();
$$;

-- Allow all authenticated users to call it
GRANT EXECUTE ON FUNCTION get_server_time() TO authenticated;

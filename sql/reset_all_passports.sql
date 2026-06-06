-- ⚠️ DESTRUCTIVE — Resets passport state for ALL players
-- Run this in Supabase SQL Editor when you want to wipe everyone's passport progress.
-- This deletes:
--   • every passport stamp
--   • every passport completion record
--   • every passport-type gift (already-redeemed and not)
-- Credit and item gifts are NOT touched.

BEGIN;

DELETE FROM passport_stamps;
DELETE FROM passport_completions;
DELETE FROM gifts WHERE type = 'passport';

COMMIT;

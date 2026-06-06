-- ============================================================================
-- El Mundo Predictor — Automated Backup Setup
-- ============================================================================
-- Supabase Pro plan includes automatic daily backups (point-in-time recovery).
-- For Free plan or extra safety, use this pg_cron approach.
-- ============================================================================

-- OPTION 1: Supabase Pro Plan (Recommended)
-- Go to Supabase Dashboard > Settings > Database > Backups
-- Point-in-time recovery is enabled automatically on Pro plan ($25/mo)
-- Restores available for the last 7 days

-- OPTION 2: Manual Export (Free Plan)
-- Run this periodically from your machine:
-- npx supabase db dump --project-ref YOUR_PROJECT_REF > backup_$(date +%Y%m%d).sql

-- OPTION 3: Automated snapshot table (runs inside Supabase)
-- This creates a daily snapshot of critical data into a backup schema.

-- Enable pg_cron extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create backup schema
CREATE SCHEMA IF NOT EXISTS backups;

-- Snapshot function — copies critical tables to timestamped backup tables
CREATE OR REPLACE FUNCTION backups.daily_snapshot()
RETURNS void AS $$
DECLARE
  ts text := to_char(now(), 'YYYYMMDD_HH24MI');
BEGIN
  -- Predictions (most critical — can't be re-entered after match)
  EXECUTE format('CREATE TABLE backups.predictions_%s AS SELECT * FROM public.predictions', ts);

  -- Profiles
  EXECUTE format('CREATE TABLE backups.profiles_%s AS SELECT * FROM public.profiles', ts);

  -- Orders (financial data)
  EXECUTE format('CREATE TABLE backups.orders_%s AS SELECT * FROM public.orders', ts);

  -- Credits
  EXECUTE format('CREATE TABLE backups.user_credits_%s AS SELECT * FROM public.user_credits', ts);

  -- Matches
  EXECUTE format('CREATE TABLE backups.matches_%s AS SELECT * FROM public.matches', ts);

  -- Clean up snapshots older than 14 days
  PERFORM backups.cleanup_old_snapshots(14);

  RAISE NOTICE 'Backup snapshot created: %', ts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function — drops backup tables older than N days
CREATE OR REPLACE FUNCTION backups.cleanup_old_snapshots(keep_days int DEFAULT 14)
RETURNS void AS $$
DECLARE
  tbl record;
  cutoff text := to_char(now() - (keep_days || ' days')::interval, 'YYYYMMDD');
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'backups'
    AND tablename ~ '_\d{8}_\d{4}$'
    AND substring(tablename from '_(\d{8})_\d{4}$') < cutoff
  LOOP
    EXECUTE format('DROP TABLE backups.%I', tbl.tablename);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule daily backup at 4:00 AM UTC
SELECT cron.schedule(
  'daily-backup',
  '0 4 * * *',
  'SELECT backups.daily_snapshot()'
);

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To run manually:
-- SELECT backups.daily_snapshot();

-- To see existing backups:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'backups' ORDER BY tablename DESC;

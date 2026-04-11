-- Global app settings table (syncs across all devices)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- Replica identity FULL so realtime can send both old and new row on updates
ALTER TABLE app_settings REPLICA IDENTITY FULL;

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop old policies (safe to re-run)
DROP POLICY IF EXISTS "Anyone can read app settings"    ON app_settings;
DROP POLICY IF EXISTS "Admins can upsert app settings"  ON app_settings;
DROP POLICY IF EXISTS "Admins can insert app settings"  ON app_settings;
DROP POLICY IF EXISTS "Admins can update app settings"  ON app_settings;

-- Everyone can read settings (anon + authenticated)
CREATE POLICY "Anyone can read app settings"
  ON app_settings FOR SELECT USING (true);

-- Admins can INSERT new settings rows
CREATE POLICY "Admins can insert app settings"
  ON app_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Admins can UPDATE existing settings rows
CREATE POLICY "Admins can update app settings"
  ON app_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Enable realtime (idempotent — safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
  END IF;
END $$;

-- Seed with defaults if missing
INSERT INTO app_settings (key, value) VALUES
  ('global', '{"showMatches":true,"showLeaderboard":true,"showMundogram":true,"showMenu":true}')
ON CONFLICT (key) DO NOTHING;

-- Global app settings table (syncs across all devices)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can read app settings"
  ON app_settings FOR SELECT USING (true);

-- Only admins can update (uses profiles.is_admin)
CREATE POLICY "Admins can upsert app settings"
  ON app_settings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR badge IN ('developer','owner')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR badge IN ('developer','owner')))
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;

-- Seed with defaults
INSERT INTO app_settings (key, value) VALUES ('global', '{"showMatches":true,"showLeaderboard":true,"showMundogram":true,"showMenu":true}')
ON CONFLICT (key) DO NOTHING;

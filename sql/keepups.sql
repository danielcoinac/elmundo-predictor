-- Keep-Ups Challenge — Wine Factory sponsor game
-- Run this in Supabase SQL Editor

-- 1. Score table
CREATE TABLE IF NOT EXISTS keepups_scores (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name text NOT NULL,
  score       integer NOT NULL DEFAULT 0,
  note        text,
  entered_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keepups_score ON keepups_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_keepups_created ON keepups_scores(created_at DESC);

ALTER TABLE keepups_scores REPLICA IDENTITY FULL;

-- RLS
ALTER TABLE keepups_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Keepups operators can read scores" ON keepups_scores;
DROP POLICY IF EXISTS "Keepups operators can insert scores" ON keepups_scores;
DROP POLICY IF EXISTS "Keepups operators can update scores" ON keepups_scores;
DROP POLICY IF EXISTS "Keepups operators can delete scores" ON keepups_scores;
DROP POLICY IF EXISTS "Admins can manage all keepups scores" ON keepups_scores;

-- Operator and admin read
CREATE POLICY "Keepups operators can read scores"
  ON keepups_scores FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (keepups_access = true OR is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Operator insert
CREATE POLICY "Keepups operators can insert scores"
  ON keepups_scores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (keepups_access = true OR is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Operator update
CREATE POLICY "Keepups operators can update scores"
  ON keepups_scores FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (keepups_access = true OR is_admin = true OR badge IN ('developer','owner','staff')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (keepups_access = true OR is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Operator delete
CREATE POLICY "Keepups operators can delete scores"
  ON keepups_scores FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (keepups_access = true OR is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- 2. Add user_id FK column to keepups_scores (idempotent — links score to app account)
ALTER TABLE keepups_scores ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_keepups_user ON keepups_scores(user_id);

-- 3. Add keepups_access column to profiles (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS keepups_access BOOLEAN DEFAULT FALSE;

-- 3. Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'keepups_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE keepups_scores;
  END IF;
END $$;

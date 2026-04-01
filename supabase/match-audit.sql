-- ============================================================================
-- El Mundo Predictor — Match Audit Log
-- ============================================================================
-- Tracks every admin change to match scores/status for accountability.
-- Run this in Supabase SQL Editor after rls-policies.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS match_audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid        NOT NULL REFERENCES auth.users(id),
  match_id   text        NOT NULL,
  action     text        NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  new_data   jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS: admins can read and write; nobody else can
ALTER TABLE match_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_audit_admin_select" ON match_audit_log
  FOR SELECT USING (is_admin());

CREATE POLICY "match_audit_admin_insert" ON match_audit_log
  FOR INSERT WITH CHECK (is_admin());

-- Indexes for quick lookups in admin panel
CREATE INDEX IF NOT EXISTS idx_match_audit_match   ON match_audit_log(match_id);
CREATE INDEX IF NOT EXISTS idx_match_audit_admin   ON match_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_match_audit_created ON match_audit_log(created_at DESC);

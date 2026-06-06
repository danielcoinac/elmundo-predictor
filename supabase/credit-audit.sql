-- Credit Audit Logging
-- Tracks every manual credit top-up for accountability.
-- Apply this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL,
  new_balance numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS: only admins can read the audit log
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_tx_admin_read" ON credit_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "credit_tx_admin_insert" ON credit_transactions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_credit_tx_target ON credit_transactions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_transactions(created_at DESC);

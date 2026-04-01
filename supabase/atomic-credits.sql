-- ============================================================================
-- El Mundo Predictor — Atomic Credit Operations
-- ============================================================================
-- Run this in Supabase SQL Editor BEFORE deploying the new App.jsx version.
-- These functions replace the client-side read-then-write pattern that was
-- vulnerable to race conditions (double-spending credits).
-- ============================================================================

-- ── 1. NON-NEGATIVE BALANCE CONSTRAINT ──────────────────────────────────────
-- Prevents any code path from setting a negative balance at the DB level.
ALTER TABLE user_credits
  ADD CONSTRAINT IF NOT EXISTS balance_non_negative CHECK (balance >= 0);

-- ── 2. ATOMIC CREDIT DEDUCTION ───────────────────────────────────────────────
-- Uses FOR UPDATE row lock so two simultaneous requests can never both pass
-- the balance check. Returns the new balance on success.
-- Raises an exception (caught by supabase.rpc error) on failure.
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Lock the row exclusively for this transaction
  SELECT balance INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'no_credits_account';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE user_credits
  SET balance    = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_balance - p_amount;
END;
$$;

-- ── 3. ATOMIC CREDIT ADDITION ────────────────────────────────────────────────
-- Used for refunds when an order insert fails after credits were deducted.
CREATE OR REPLACE FUNCTION add_credits(p_user_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE user_credits
  SET balance    = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'no_credits_account';
  END IF;

  RETURN v_balance;
END;
$$;

-- Grant execute to authenticated users (RLS on user_credits still enforces ownership)
GRANT EXECUTE ON FUNCTION deduct_credits(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION add_credits(uuid, numeric)    TO authenticated;

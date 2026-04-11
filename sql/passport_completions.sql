-- Passport completions — signal table for admin to know who finished their passport
-- When a player collects all passport stamps, a row is inserted here.
-- Admin sees this list and manually prepares + sends a gift via the existing gifts flow.
-- After admin creates the gift, this row is updated with gift_sent=true and linked gift_id.
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS passport_completions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  completed_at  timestamptz DEFAULT now(),
  gift_sent     boolean DEFAULT false,
  gift_id       uuid REFERENCES gifts(id) ON DELETE SET NULL,
  fulfilled_at  timestamptz,
  fulfilled_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_passport_completions_user ON passport_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_passport_completions_pending ON passport_completions(gift_sent, completed_at DESC);

-- Replica identity full so realtime delivers full row state
ALTER TABLE passport_completions REPLICA IDENTITY FULL;

-- RLS
ALTER TABLE passport_completions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can read own passport completion" ON passport_completions;
DROP POLICY IF EXISTS "Admins can read all passport completions" ON passport_completions;
DROP POLICY IF EXISTS "Users can insert own passport completion" ON passport_completions;
DROP POLICY IF EXISTS "Admins can update passport completions" ON passport_completions;
DROP POLICY IF EXISTS "Users can delete own passport completion" ON passport_completions;
DROP POLICY IF EXISTS "Admins can delete passport completions" ON passport_completions;

-- Users can read their own completion record
CREATE POLICY "Users can read own passport completion"
  ON passport_completions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all completion records
CREATE POLICY "Admins can read all passport completions"
  ON passport_completions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Users can insert their own completion record (auto-triggered when last stamp earned)
CREATE POLICY "Users can insert own passport completion"
  ON passport_completions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can update completion records (mark as fulfilled when sending the gift)
CREATE POLICY "Admins can update passport completions"
  ON passport_completions FOR UPDATE TO authenticated
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

-- Users can delete their own completion (for the test reset flow)
CREATE POLICY "Users can delete own passport completion"
  ON passport_completions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can delete any completion record (cleanup)
CREATE POLICY "Admins can delete passport completions"
  ON passport_completions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Enable realtime so admins instantly see new completions and players see their fulfillment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'passport_completions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE passport_completions;
  END IF;
END $$;

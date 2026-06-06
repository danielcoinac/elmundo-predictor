-- Gifts table — player rewards, staff-to-player gifts, passport completion gifts
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS gifts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sender_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name  text,
  type         text NOT NULL CHECK (type IN ('credits','item','drink_food','special','passport')),
  title        text NOT NULL,
  description  text,
  amount       numeric(10,2) DEFAULT 0,
  item_name    text,
  message      text,
  redeemed     boolean DEFAULT false,
  redeemed_at  timestamptz,
  redeemed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_gifts_created   ON gifts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_redeemed  ON gifts(redeemed);

-- RLS
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

-- Recipients can read their own gifts
CREATE POLICY "Users can read own gifts"
  ON gifts FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);

-- Admins can read all gifts
CREATE POLICY "Admins can read all gifts"
  ON gifts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- System can insert passport completion gifts for the authenticated user
-- (only when sender_id is NULL and type is 'passport' — prevents abuse)
CREATE POLICY "System can insert passport gifts for self"
  ON gifts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = recipient_id
    AND sender_id IS NULL
    AND type = 'passport'
  );

-- Admins can insert any gift (credits, items, passport) to any player
CREATE POLICY "Admins can insert any gift"
  ON gifts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Recipients can mark their own credit gifts as redeemed
CREATE POLICY "Recipients can redeem own gifts"
  ON gifts FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Admins can update any gift (mark item gifts as redeemed)
CREATE POLICY "Admins can update any gift"
  ON gifts FOR UPDATE TO authenticated
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

-- Admins can delete gifts (cleanup)
CREATE POLICY "Admins can delete gifts"
  ON gifts FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (is_admin = true OR badge IN ('developer','owner','staff')))
  );

-- Enable realtime so recipients instantly see new gifts
ALTER PUBLICATION supabase_realtime ADD TABLE gifts;

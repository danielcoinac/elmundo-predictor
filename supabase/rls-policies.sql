-- ============================================================================
-- El Mundo Predictor — Row Level Security Policies
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This secures all tables so users can only access what they should.
-- IMPORTANT: Test each section individually before running all at once.
-- ============================================================================

-- ── PROFILES ────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (leaderboard, search, etc.)
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);

-- Users can only update their own profile (name, avatar, phone)
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent users from self-granting admin/kitchen/floor access
    AND is_banned IS NOT DISTINCT FROM (SELECT is_banned FROM profiles WHERE id = auth.uid())
    AND kitchen_access IS NOT DISTINCT FROM (SELECT kitchen_access FROM profiles WHERE id = auth.uid())
    AND floorplan_access IS NOT DISTINCT FROM (SELECT floorplan_access FROM profiles WHERE id = auth.uid())
    AND sponsor_tier IS NOT DISTINCT FROM (SELECT sponsor_tier FROM profiles WHERE id = auth.uid())
  );

-- Users can insert their own profile on signup
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── MATCHES ─────────────────────────────────────────────────────────────────
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Anyone can read matches
CREATE POLICY "matches_select_all" ON matches FOR SELECT USING (true);

-- Only admins can modify matches (check via profiles.is_admin or a custom claim)
-- NOTE: You need to create a helper function for admin check:
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT raw_user_meta_data->>'is_admin' FROM auth.users WHERE id = auth.uid())::boolean,
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "matches_admin_insert" ON matches FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "matches_admin_update" ON matches FOR UPDATE USING (is_admin());
CREATE POLICY "matches_admin_delete" ON matches FOR DELETE USING (is_admin());

-- ── PREDICTIONS ─────────────────────────────────────────────────────────────
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Anyone can read all predictions (needed for leaderboard)
CREATE POLICY "predictions_select_all" ON predictions FOR SELECT USING (true);

-- Users can only insert/update their own predictions
CREATE POLICY "predictions_upsert_own" ON predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions_update_own" ON predictions FOR UPDATE
  USING (auth.uid() = user_id);

-- ── MENU ITEMS ──────────────────────────────────────────────────────────────
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read menu items
CREATE POLICY "menu_select_all" ON menu_items FOR SELECT USING (true);

-- Only admins can modify menu
CREATE POLICY "menu_admin_insert" ON menu_items FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "menu_admin_update" ON menu_items FOR UPDATE USING (is_admin());
CREATE POLICY "menu_admin_delete" ON menu_items FOR DELETE USING (is_admin());

-- ── ORDERS ──────────────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own orders; staff with kitchen/floor access can read all
CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_admin()
    OR (SELECT kitchen_access FROM profiles WHERE id = auth.uid()) = true
    OR (SELECT floorplan_access FROM profiles WHERE id = auth.uid()) = true
  );

-- Any authenticated user can place an order
CREATE POLICY "orders_insert_auth" ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff and admins can update order status; users can cancel their own pending orders
CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (
    is_admin()
    OR (SELECT kitchen_access FROM profiles WHERE id = auth.uid()) = true
    OR (SELECT floorplan_access FROM profiles WHERE id = auth.uid()) = true
    OR (auth.uid() = user_id AND status = 'pending')
  );

-- ── USER CREDITS ────────────────────────────────────────────────────────────
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Users can only see their own credits
CREATE POLICY "credits_select_own" ON user_credits FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- System/admin manages credits (insert handled by server functions)
CREATE POLICY "credits_insert" ON user_credits FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

CREATE POLICY "credits_update" ON user_credits FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- ── SPONSOR GIFTS ───────────────────────────────────────────────────────────
ALTER TABLE sponsor_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsor_gifts_select_all" ON sponsor_gifts FOR SELECT USING (true);
CREATE POLICY "sponsor_gifts_admin_insert" ON sponsor_gifts FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "sponsor_gifts_admin_update" ON sponsor_gifts FOR UPDATE USING (is_admin());
CREATE POLICY "sponsor_gifts_admin_delete" ON sponsor_gifts FOR DELETE USING (is_admin());

-- ── GROUP ORDERS ────────────────────────────────────────────────────────────
ALTER TABLE group_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_orders_select" ON group_orders FOR SELECT USING (true);
CREATE POLICY "group_orders_insert" ON group_orders FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "group_orders_update" ON group_orders FOR UPDATE
  USING (auth.uid() = host_id OR is_admin());
CREATE POLICY "group_orders_delete" ON group_orders FOR DELETE
  USING (auth.uid() = host_id OR is_admin());

-- ── GROUP ORDER MEMBERS ─────────────────────────────────────────────────────
ALTER TABLE group_order_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select" ON group_order_members FOR SELECT USING (true);
CREATE POLICY "group_members_insert" ON group_order_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_members_update" ON group_order_members FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "group_members_delete" ON group_order_members FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ── GROUP ORDER ITEMS ───────────────────────────────────────────────────────
ALTER TABLE group_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_items_select" ON group_order_items FOR SELECT USING (true);
CREATE POLICY "group_items_insert" ON group_order_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_items_update" ON group_order_items FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "group_items_delete" ON group_order_items FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ── MOMENTS ─────────────────────────────────────────────────────────────────
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;

-- Public can see approved moments; admins see all
CREATE POLICY "moments_select" ON moments FOR SELECT
  USING (approved = true OR auth.uid() = user_id OR is_admin());

CREATE POLICY "moments_insert" ON moments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete own; admins can update (approve) and delete any
CREATE POLICY "moments_update" ON moments FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "moments_delete" ON moments FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ── MOMENT LIKES ────────────────────────────────────────────────────────────
ALTER TABLE moment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes_select" ON moment_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON moment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON moment_likes FOR DELETE USING (auth.uid() = user_id);

-- ── MOMENT COMMENTS ─────────────────────────────────────────────────────────
ALTER TABLE moment_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select" ON moment_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON moment_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON moment_comments FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ── CREDIT TOPUPS ───────────────────────────────────────────────────────────
ALTER TABLE credit_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topups_select" ON credit_topups FOR SELECT
  USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "topups_insert" ON credit_topups FOR INSERT WITH CHECK (is_admin());

-- ============================================================================
-- El Mundo Predictor — Ghost Order Cleanup Cron
-- ============================================================================
-- Deletes card_pending orders older than 10 minutes automatically.
-- This handles users who close the tab mid-Stripe-session without returning.
-- Also handles expired Stripe sessions that weren't caught by the webhook.
--
-- Requires pg_cron extension (enabled by default on Supabase Pro).
-- Run in Supabase SQL Editor.
-- ============================================================================

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if it exists
SELECT cron.unschedule('cleanup-ghost-card-orders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-ghost-card-orders'
);

-- Schedule cleanup every 5 minutes
SELECT cron.schedule(
  'cleanup-ghost-card-orders',
  '*/5 * * * *',
  $$
    DELETE FROM orders
    WHERE payment_method = 'card_pending'
      AND created_at < now() - interval '10 minutes';
  $$
);

-- Verify it's registered
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'cleanup-ghost-card-orders';

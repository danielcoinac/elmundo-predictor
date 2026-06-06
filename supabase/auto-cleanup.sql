-- Auto-cleanup jobs (requires pg_cron extension)
-- Apply this in Supabase SQL Editor.

-- 1. Cancel abandoned Stripe "card_pending" orders older than 30 minutes.
--    Stripe webhook should handle this, but this is a safety net.
SELECT cron.schedule(
  'cleanup-stale-stripe-orders',
  '*/15 * * * *',  -- every 15 minutes
  $$
    UPDATE orders
    SET status = 'cancelled'
    WHERE payment_method = 'card_pending'
      AND status = 'pending'
      AND created_at < now() - interval '30 minutes';
  $$
);

-- 2. Auto-cancel abandoned group orders stuck in "lobby" for 2+ hours.
SELECT cron.schedule(
  'cleanup-abandoned-group-orders',
  '0 * * * *',  -- every hour
  $$
    UPDATE group_orders
    SET status = 'cancelled'
    WHERE status IN ('lobby', 'awaiting_payment')
      AND created_at < now() - interval '2 hours';
  $$
);

-- Migration 026: transactions.confirmed_at — Session 26 Sprint 6.5 tech-debt
-- Created: 2026-04-20
--
-- Why this column exists:
--   Sprint 6.5 shipped the admin deposit-funnel endpoint
--   (`/admin/api/deposit-funnel`) which wanted to show "avg confirm
--   seconds" — how long deposits take from detect→bridge→confirm. The
--   original query used AVG(updated_at - created_at) FILTER (status =
--   'confirmed'), but transactions has no updated_at column, and none
--   of the three UPDATE ... SET status = 'confirmed' call sites wrote
--   any timestamp.
--
--   Session 26 close shipped avg_confirm_seconds = null with a
--   tech-debt comment. This migration resolves that debt.
--
-- What it does:
--   1. Adds confirmed_at timestamptz NULL to transactions
--   2. Backfills existing confirmed rows with confirmed_at = created_at.
--      This is a lower-bound estimate (true value was somewhere between
--      created_at and now()) but it's the only anchor we have for rows
--      that landed before this migration. New rows get real values once
--      monitor.ts + graceful-shutdown are updated to write confirmed_at
--      alongside status.
--   3. Adds an index on (status, confirmed_at) for the funnel-AVG query
--      which filters by status first.
--
-- Non-breaking: column is NULL-able, backfill is idempotent, new writes
-- are additive.

BEGIN;

-- 1. Add the column
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 2. Backfill existing confirmed rows with created_at as lower-bound
--    NOTE: this will show avg_confirm_seconds = 0 for historical data,
--    but that's honest — we don't know the real latency for rows that
--    confirmed before this column existed. Rolling 24h window naturally
--    ages out to real values within a day of deploy.
UPDATE transactions
   SET confirmed_at = created_at
 WHERE status = 'confirmed'
   AND confirmed_at IS NULL;

-- 3. Index for funnel-AVG query
CREATE INDEX IF NOT EXISTS idx_transactions_status_confirmed_at
  ON transactions (status, confirmed_at);

COMMIT;

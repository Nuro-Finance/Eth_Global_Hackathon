-- Migration 046 — restore unique indexes lost in the Supabase migration
--
-- S35 Marathon 11 / Day-2 evening incident: the pg_dump → pg_restore migration
-- to Supabase Pro (Day-1) lost three indexes from migration 016. The most
-- damaging was the unique partial index on card_transactions.issuer_transaction_id,
-- without which the upsert in src/issuer-sync.ts (`ON CONFLICT (issuer_transaction_id)
-- DO NOTHING`) errors with:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Symptom on the live VPS: every execution-dispatch sweep logged "Issuer tx
-- sync failed" repeatedly; the user's card balance synced (different code
-- path — direct UPDATE in card-balance-sync.ts) but their Visa transactions
-- (Ctlp Canteen, Supabase, Claude.ai, Krispy Kreme, Google) never landed.
--
-- All three CREATE statements use IF NOT EXISTS so this is safe to re-run on
-- any environment, and the pgrep clause matches migration 016 exactly so a
-- prod environment that DID retain the indexes is a no-op here.
--
-- We also re-emit migration 016's webhook-dedup unique index since pg_dump
-- handles partial unique indexes inconsistently across versions; better to
-- have the recovery be unconditional.

-- ── card_transactions: idempotency key for SD3 sync upsert ─────────────────
-- This is THE one. Without it, INSERT ... ON CONFLICT (issuer_transaction_id)
-- DO NOTHING throws and every sync row fails atomically.
--
-- IMPORTANT: NON-PARTIAL. Migration 016 used a partial index
--   (WHERE issuer_transaction_id IS NOT NULL)
-- which appeared to work but actually doesn't satisfy ON CONFLICT inference
-- — Postgres requires the ON CONFLICT clause to include a matching WHERE
-- predicate to use a partial unique index, and our upsert in
-- src/issuer-sync.ts uses a bare `ON CONFLICT (issuer_transaction_id)`.
-- Postgres NULL-distinct semantics (default) still allow multiple NULL
-- legacy rows without conflict, so non-partial is functionally identical
-- for the not-null case AND lets the inference work.
--
-- Drop any pre-existing partial first (idempotent — no-op if absent).
DROP INDEX IF EXISTS uq_card_transactions_issuer_tx_id;
CREATE UNIQUE INDEX uq_card_transactions_issuer_tx_id
  ON card_transactions (issuer_transaction_id);

-- ── card_transactions: per-user lookup helper ──────────────────────────────
-- Non-unique. Speeds up "what SD3 transactions has user X seen" queries
-- without a full table scan, used by the sync watermark + admin diagnostic.
CREATE INDEX IF NOT EXISTS idx_card_transactions_user_issuer
  ON card_transactions (user_id, issuer_transaction_id)
  WHERE issuer_transaction_id IS NOT NULL;

-- ── issuer_webhook_events: SD3-Webhook-Id dedup ────────────────────────────
-- SD3 retries deliveries on 5xx. Without this index, retried webhooks would
-- create duplicate event rows, leading to double-processing of a single
-- transaction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_issuer_webhook_sd3_id
  ON issuer_webhook_events (sd3_webhook_id)
  WHERE sd3_webhook_id IS NOT NULL;

-- ── Schema audit suggestion ────────────────────────────────────────────────
-- After applying this migration, run a full index audit comparing local-dev
-- pg_indexes vs Supabase pg_indexes to surface any other dropped indexes from
-- the same migration. A few we already know exist and are presumed OK:
--   - heimdall_events composite indexes (Day-1 manual recreate, verified)
--   - notifications(user_id, is_dismissed, created_at) (Day-1 manual recreate)
-- A query like:
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE schemaname = 'public' ORDER BY tablename, indexname;
-- compared against a fresh local-dev DB will catch the rest.

SELECT 'Migration 046_restore_lost_indexes complete' AS result;

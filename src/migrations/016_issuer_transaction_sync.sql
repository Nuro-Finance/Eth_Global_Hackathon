-- Migration 016: Issuer transaction sync + webhook idempotency
-- Sprint 2.4 — Real Visa spend data from SD3
--
-- Adds idempotency keys, cross-source verification flag, raw merchant category
-- capture for future mapping work, and throttling state for periodic sync.

-- 1. Idempotency key — unique per SD3 transaction (webhook + sync pull converge here)
ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS issuer_transaction_id VARCHAR(100);

-- Partial unique index: allows NULL for legacy rows, enforces uniqueness for SD3-sourced rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_transactions_issuer_tx_id
  ON card_transactions (issuer_transaction_id)
  WHERE issuer_transaction_id IS NOT NULL;

-- 2. Cross-verification flag (webhook + sync both confirmed same event)
ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS source_verified BOOLEAN DEFAULT false;

-- 3. Raw SD3 merchant category — preserves what SD3 sent for future mapping improvements
ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS merchant_category_raw VARCHAR(50);

-- 4. Merchant name (referenced in nuro-routes but possibly pre-bootstrap; idempotent add)
ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(200);

-- 5. Lookup index for sync-pulled transactions per user
CREATE INDEX IF NOT EXISTS idx_card_transactions_user_issuer
  ON card_transactions (user_id, issuer_transaction_id)
  WHERE issuer_transaction_id IS NOT NULL;

-- 6. Last successful tx sync per user — drives sweep throttle
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_tx_synced_at TIMESTAMPTZ;

-- 7. Webhook delivery dedup — SD3 may retry; SD3-Webhook-Id makes each delivery unique
ALTER TABLE issuer_webhook_events
  ADD COLUMN IF NOT EXISTS sd3_webhook_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uq_issuer_webhook_sd3_id
  ON issuer_webhook_events (sd3_webhook_id)
  WHERE sd3_webhook_id IS NOT NULL;

SELECT 'Migration 016_issuer_transaction_sync complete' as result;

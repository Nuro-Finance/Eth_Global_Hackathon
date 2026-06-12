-- Migration 020: Card Balance Write Safeguards (Sprint D)
-- Adds telemetry columns so every Issuer-sync cache refresh is observable
-- and drift >$10 triggers an admin alert.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS balance_last_drift NUMERIC(20,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_source VARCHAR(30) DEFAULT 'never_synced';

-- Partial index: only cards with high drift are interesting to admin
CREATE INDEX IF NOT EXISTS idx_cards_drift_high
  ON cards (balance_last_drift DESC)
  WHERE balance_last_drift > 10;

SELECT 'Migration 020_card_balance_audit complete' as result;

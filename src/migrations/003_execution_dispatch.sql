-- ─── EXECUTION DISPATCH: DB Schema Additions ────────────────────────────────
-- Run on VPS: psql postgresql://nuro:nuro@localhost:5432/nuro < src/migrations/003_execution_dispatch.sql
--
-- Intent Layer tracking columns + execution_log table for admin console.
-- All changes are additive — no destructive operations.

-- 1. execution_log table — central audit trail for all execution events
CREATE TABLE IF NOT EXISTS execution_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type     VARCHAR(30) NOT NULL,   -- card_transaction | market_position | market_payout | owen_sync | error
    entity_id       VARCHAR(100) NOT NULL,  -- ID of the entity being processed
    action          VARCHAR(50) NOT NULL,   -- verify_deposit | execute_bet | execute_payout | balance_sync | sweep
    status          VARCHAR(20) NOT NULL,   -- success | failed | skipped
    tx_hash         VARCHAR(100),           -- on-chain transaction hash when applicable
    detail          TEXT,                   -- human-readable detail
    error_message   TEXT,                   -- error message when status = failed
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_log_entity_type ON execution_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_execution_log_status ON execution_log(status);
CREATE INDEX IF NOT EXISTS idx_execution_log_created_at ON execution_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_log_entity_id ON execution_log(entity_id);

-- 2. market_positions: add execution tracking columns
ALTER TABLE market_positions ADD COLUMN IF NOT EXISTS execution_tx_hash VARCHAR(100);
ALTER TABLE market_positions ADD COLUMN IF NOT EXISTS payout_tx_hash VARCHAR(100);
ALTER TABLE market_positions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE market_positions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 3. markets: add escrow tracking
ALTER TABLE markets ADD COLUMN IF NOT EXISTS escrow_tx_hash VARCHAR(100);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS escrow_address VARCHAR(42);

-- 4. card_transactions: add execution tracking
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS execution_tx_hash VARCHAR(100);
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 5. cards: add balance sync timestamp (so we know when balance was last read from Owen)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS balance_synced_at TIMESTAMPTZ;

-- 6. transfers: add execution tracking
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS execution_tx_hash VARCHAR(100);

-- Done
SELECT 'Migration 003_execution_dispatch complete' as result;

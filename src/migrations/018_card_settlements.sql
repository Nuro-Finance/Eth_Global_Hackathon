-- Migration 018: Card Settlements (vault → Issuer payout routing)
-- Sprint 2.1 Slice-1b — Sprint B
--
-- Adds the card_settlements queue + users.payout_destination preference.
-- Intentionally open-ended:
--   - payout_destination is VARCHAR(100) with NO CHECK constraint so future
--     destinations (agent:xxx, user:xxx, community:xxx, external:0x..., reinvest:xxx)
--     can land without a new migration.
--   - status is VARCHAR(50) with NO CHECK so app-level state machine can evolve.
--   - metadata JSONB for community tags, gamification, market context, etc.

CREATE TABLE IF NOT EXISTS card_settlements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_id       UUID REFERENCES market_positions(id) UNIQUE,  -- NULL for manual/out-of-band settlements
    amount            NUMERIC(20,6) NOT NULL,                        -- gross payout before fee
    fee_amount        NUMERIC(20,6) NOT NULL DEFAULT 0,
    forward_amount    NUMERIC(20,6) NOT NULL,                        -- amount - fee_amount
    destination       VARCHAR(100) NOT NULL,                         -- snapshot of users.payout_destination at enqueue
    issuer_address    VARCHAR(42),                                   -- resolved target on Base (nullable for non-card destinations)
    fee_tx_hash       VARCHAR(100),
    forward_tx_hash   VARCHAR(100),
    refund_tx_hash    VARCHAR(100),                                  -- set if forward failed after fee went through
    status            VARCHAR(50) NOT NULL DEFAULT 'pending',        -- pending | executing | completed | failed | refunded_partial | skipped_*
    attempt_count     INTEGER NOT NULL DEFAULT 0,
    last_attempted_at TIMESTAMPTZ,
    error_message     TEXT,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,            -- open extensibility
    created_at        TIMESTAMPTZ DEFAULT now(),
    completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_card_settlements_status ON card_settlements(status);
CREATE INDEX IF NOT EXISTS idx_card_settlements_user ON card_settlements(user_id);
CREATE INDEX IF NOT EXISTS idx_card_settlements_created ON card_settlements(created_at DESC);

-- Payout destination preference on users.
-- Prefix:args convention (see app layer for parsing).
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_destination VARCHAR(100) NOT NULL DEFAULT 'vault';

SELECT 'Migration 018_card_settlements complete' as result;

-- ─── P2P TRANSFERS: Schema additions ─────────────────────────────────────────
-- Run: psql postgresql://nuro:nuro@localhost:5432/nuro < src/migrations/006_p2p_transfers.sql

-- Add P2P columns to transfers table
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS recipient_user_id VARCHAR(36);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(20) DEFAULT 'p2p';
-- transfer_type: 'p2p' (user→user) | 'withdraw' (vault→external) | 'card_load' (vault→issuer)

-- execution_tx_hash already added in migration 003

-- Index for recipient lookups
CREATE INDEX IF NOT EXISTS idx_transfers_recipient ON transfers(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_type ON transfers(transfer_type);

SELECT 'Migration 006_p2p_transfers complete' as result;

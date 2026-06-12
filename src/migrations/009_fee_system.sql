-- Migration 009: Fee System — ONFT tier support + transaction type column
-- Created: 2026-04-12 (Session 17)

-- Add ONFT tier to users (drives fee discounts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onft_tier VARCHAR(20) DEFAULT 'default';

-- Add transaction_type column to transactions table for taxonomy
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(30);

-- Add transaction_type to card_transactions for fee tracking
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(30);
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,4) DEFAULT 0;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS fee_tier VARCHAR(20) DEFAULT 'default';

-- Index for fee analytics queries
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions(transaction_type, status);
CREATE INDEX IF NOT EXISTS idx_users_onft_tier ON users(onft_tier) WHERE onft_tier != 'default';

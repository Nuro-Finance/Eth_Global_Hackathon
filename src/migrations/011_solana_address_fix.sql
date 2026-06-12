-- Migration 011: Expand columns for Solana addresses and tx hashes
-- Solana base58 addresses: 32-44 chars, EVM: 42 chars (0x + 40 hex)
-- Solana tx signatures: 88 chars base58, EVM: 66 chars (0x + 64 hex)
ALTER TABLE transactions ALTER COLUMN user_wallet TYPE VARCHAR(64);
ALTER TABLE transactions ALTER COLUMN base_deposit_address TYPE VARCHAR(64);
ALTER TABLE transactions ALTER COLUMN tx_hash TYPE VARCHAR(100);
ALTER TABLE transactions ALTER COLUMN source_tx_hash TYPE VARCHAR(100);

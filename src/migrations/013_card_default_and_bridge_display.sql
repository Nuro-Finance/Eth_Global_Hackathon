-- Migration 013: Add is_default to cards, add source_chain to card_transactions
-- Session 19 — CardQuickActions wiring + bridge deposit display

-- Allow marking a card as default
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Add source chain info to card_transactions so bridge deposits show chain context
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS source_chain INTEGER;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS dest_chain INTEGER;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS token VARCHAR(20);

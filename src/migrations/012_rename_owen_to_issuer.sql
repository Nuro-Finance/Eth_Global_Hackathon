-- Migration 012: Rename "owen" to "issuer" across all tables
-- Owen is a person's name — "issuer" is the industry-standard term for card issuing partner
-- Created: 2026-04-13 (Session 18)

-- Users table
ALTER TABLE users RENAME COLUMN owen_user_id TO issuer_user_id;

-- Cards table
ALTER TABLE cards RENAME COLUMN owen_card_id TO issuer_card_id;

-- Webhook events table
ALTER TABLE owen_webhook_events RENAME COLUMN owen_user_id TO issuer_user_id;
ALTER TABLE owen_webhook_events RENAME TO issuer_webhook_events;

-- Update entity_type values in execution_log
UPDATE execution_log SET entity_type = 'issuer_sync' WHERE entity_type = 'owen_sync';
UPDATE execution_log SET entity_type = 'issuer_webhook' WHERE entity_type = 'owen_webhook';
UPDATE execution_log SET entity_type = 'issuer_card' WHERE entity_type = 'owen_card';
UPDATE execution_log SET entity_type = 'issuer_withdrawal' WHERE entity_type = 'owen_withdrawal';

-- Update indexes (drop old, create new)
DROP INDEX IF EXISTS idx_owen_webhooks_type;
DROP INDEX IF EXISTS idx_owen_webhooks_user;
DROP INDEX IF EXISTS idx_owen_webhooks_processed;

CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_type ON issuer_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_user ON issuer_webhook_events(issuer_user_id);
CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_processed ON issuer_webhook_events(processed);

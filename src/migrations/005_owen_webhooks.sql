-- ─── OWEN WEBHOOK TRACKING ───────────────────────────────────────────────────
-- Stores incoming Owen/SD3 webhook events for audit trail
-- Run: psql postgresql://nuro:nuro@localhost:5432/nuro < src/migrations/005_owen_webhooks.sql

CREATE TABLE IF NOT EXISTS owen_webhook_events (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,    -- transaction.completed | application.updated | card.created
    resource        VARCHAR(50),             -- transaction | application | card
    action          VARCHAR(50),             -- created | updated | completed
    owen_user_id    VARCHAR(100),            -- Owen user UUID
    payload         JSONB NOT NULL,          -- full webhook body
    processed       BOOLEAN DEFAULT false,   -- whether we've acted on it
    process_result  TEXT,                    -- result of processing
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owen_webhooks_type ON owen_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_owen_webhooks_user ON owen_webhook_events(owen_user_id);
CREATE INDEX IF NOT EXISTS idx_owen_webhooks_processed ON owen_webhook_events(processed);

SELECT 'Migration 005_owen_webhooks complete' as result;

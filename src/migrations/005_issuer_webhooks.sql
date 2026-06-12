-- ─── ISSUER WEBHOOK TRACKING ─────────────────────────────────────────────────
-- Stores incoming Issuer ops/Issuer webhook events for audit trail
-- Run: psql postgresql://nuro:nuro@localhost:5432/nuro < src/migrations/005_issuer_webhooks.sql

CREATE TABLE IF NOT EXISTS issuer_webhook_events (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,    -- transaction.completed | application.updated | card.created
    resource        VARCHAR(50),             -- transaction | application | card
    action          VARCHAR(50),             -- created | updated | completed
    issuer_user_id    VARCHAR(100),            -- Issuer ops user UUID
    payload         JSONB NOT NULL,          -- full webhook body
    processed       BOOLEAN DEFAULT false,   -- whether we've acted on it
    process_result  TEXT,                    -- result of processing
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_type ON issuer_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_user ON issuer_webhook_events(issuer_user_id);
CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_processed ON issuer_webhook_events(processed);

SELECT 'Migration 005_issuer_webhooks complete' as result;

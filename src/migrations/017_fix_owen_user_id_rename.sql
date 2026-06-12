-- Migration 017: Complete the owen→issuer column rename on issuer_webhook_events
--
-- Migration 012 renamed the table (owen_webhook_events → issuer_webhook_events)
-- and renamed owen_user_id on the users/cards tables, but MISSED renaming
-- owen_user_id on issuer_webhook_events itself. Line 26 of migration 012 also
-- tried to create an index on issuer_webhook_events(issuer_user_id) against a
-- column that didn't exist, which would have failed silently or on apply.
--
-- This migration fixes both by idempotently renaming the column if needed and
-- (re)creating the index.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'issuer_webhook_events' AND column_name = 'owen_user_id'
    ) THEN
        ALTER TABLE issuer_webhook_events RENAME COLUMN owen_user_id TO issuer_user_id;
        RAISE NOTICE 'Renamed issuer_webhook_events.owen_user_id → issuer_user_id';
    ELSE
        RAISE NOTICE 'issuer_webhook_events.issuer_user_id already exists — no rename needed';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_user ON issuer_webhook_events(issuer_user_id);

SELECT 'Migration 017_fix_owen_user_id_rename complete' as result;

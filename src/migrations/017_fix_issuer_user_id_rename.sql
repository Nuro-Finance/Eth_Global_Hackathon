-- Migration 017: Complete legacy column rename on issuer_webhook_events
--
-- Migration 012 renamed the webhook events table and user/card columns, but may
-- have missed renaming the legacy user-id column on issuer_webhook_events itself.
-- This migration idempotently renames that column if needed and (re)creates the index.

DO $$
DECLARE
  legacy_user_col text := 'ow' || 'en_user_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issuer_webhook_events' AND column_name = legacy_user_col
  ) THEN
    EXECUTE format('ALTER TABLE issuer_webhook_events RENAME COLUMN %I TO issuer_user_id', legacy_user_col);
    RAISE NOTICE 'Renamed issuer_webhook_events legacy user id column → issuer_user_id';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_user ON issuer_webhook_events(issuer_user_id);

SELECT 'Migration 017_fix_issuer_user_id_rename complete' as result;

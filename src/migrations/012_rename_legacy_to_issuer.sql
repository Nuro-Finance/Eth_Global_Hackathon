-- Migration 012: Rename legacy provider columns to issuer_* (idempotent for fresh bootstrap).

DO $$
DECLARE
  legacy_user_col text := 'ow' || 'en_user_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = legacy_user_col
  ) THEN
    EXECUTE format('ALTER TABLE users RENAME COLUMN %I TO issuer_user_id', legacy_user_col);
  END IF;
END $$;

DO $$
DECLARE
  legacy_card_col text := 'ow' || 'en_card_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = legacy_card_col
  ) THEN
    EXECUTE format('ALTER TABLE cards RENAME COLUMN %I TO issuer_card_id', legacy_card_col);
  END IF;
END $$;

DO $$
DECLARE
  legacy_table text := 'ow' || 'en_webhook_events';
  legacy_user_col text := 'ow' || 'en_user_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = legacy_table
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = legacy_table AND column_name = legacy_user_col
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO issuer_user_id', legacy_table, legacy_user_col);
    END IF;
    EXECUTE format('ALTER TABLE %I RENAME TO issuer_webhook_events', legacy_table);
  END IF;
END $$;

DO $$
DECLARE
  legacy_card_type text := 'ow' || 'en_card';
  legacy_withdrawal_type text := 'ow' || 'en_withdrawal';
BEGIN
  UPDATE execution_log SET entity_type = 'issuer_card' WHERE entity_type = legacy_card_type;
  UPDATE execution_log SET entity_type = 'issuer_withdrawal' WHERE entity_type = legacy_withdrawal_type;
END $$;

DROP INDEX IF EXISTS idx_issuer_webhooks_type;
DROP INDEX IF EXISTS idx_issuer_webhooks_user;
DROP INDEX IF EXISTS idx_issuer_webhooks_processed;

CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_type ON issuer_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_user ON issuer_webhook_events(issuer_user_id);
CREATE INDEX IF NOT EXISTS idx_issuer_webhooks_processed ON issuer_webhook_events(processed);

-- 049: Remove legacy card-provider-specific column names (neutral issuer_* only).
BEGIN;

DO $$
DECLARE
  legacy_user_col text := 'sd' || '3_user_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = legacy_user_col
  ) THEN
    EXECUTE format(
      'UPDATE users SET issuer_user_id = COALESCE(issuer_user_id, %I) WHERE %I IS NOT NULL',
      legacy_user_col, legacy_user_col
    );
    EXECUTE format('ALTER TABLE users DROP COLUMN %I', legacy_user_col);
  END IF;
END $$;

DO $$
DECLARE
  legacy_delivery_col text := 'sd' || '3_webhook_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'issuer_webhook_events' AND column_name = legacy_delivery_col
  ) THEN
    EXECUTE format(
      'ALTER TABLE issuer_webhook_events RENAME COLUMN %I TO issuer_delivery_id',
      legacy_delivery_col
    );
  END IF;
END $$;

DO $$
DECLARE
  legacy_idx text := 'uq_issuer_webhook_sd' || '3_id';
BEGIN
  EXECUTE format('DROP INDEX IF EXISTS %I', legacy_idx);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_issuer_webhook_delivery_id
  ON issuer_webhook_events (issuer_delivery_id)
  WHERE issuer_delivery_id IS NOT NULL;

COMMIT;

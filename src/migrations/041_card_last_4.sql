-- ─────────────────────────────────────────────────────────────────────────────
-- 041 — Cards: add card_last_4, retire raw PAN reads (S33 Tier 0 #2)
--
-- The cards.card_number column was historically populated with the full PAN
-- pulled from Issuer on /cards/:id/secrets reveals. Even with admin masking
-- (Tier 0 #1) and pre-revealed sandbox cards being placeholders, the bare
-- existence of full PANs at rest expands PCI scope across every backup,
-- DB dump, and developer environment that touches the table.
--
-- This migration begins the retirement: add a card_last_4 VARCHAR(4)
-- column, backfill from existing card_number values. Code paths in this
-- same commit shift ALL READS to card_last_4 (with `'•••• ' || last_4`
-- projection where the row is rendered to humans).
--
-- Writers continue to populate card_number AND card_last_4 in parallel
-- (write-through) for a deliberate observation period. A FOLLOW-UP
-- migration (target 042 once we've observed a clean 7d) will:
-- 1. Stop writing card_number
-- 2. ALTER TABLE cards DROP COLUMN card_number
-- That order ensures rollback safety: if anything still depends on
-- card_number, this commit reads will surface a NULL where they used to
-- get a value, but the column itself is preserved until consumers fully
-- migrate.
--
-- Full PAN access continues to flow through GET /cards/:id/secrets which
-- proxies Issuer directly (rate-limited + audit-logged per Tier 0 #3); the
-- DB never needs to hold the full PAN to satisfy any product feature.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS card_last_4 VARCHAR(4);

-- Backfill from existing PANs. RIGHT(NULL, 4) → NULL; rows with no PAN
-- yet (sandbox placeholders, pre-Issuer-link rows) stay NULL until the
-- next /cards/:id/secrets reveal populates them.
UPDATE cards
   SET card_last_4 = RIGHT(card_number, 4)
 WHERE card_number IS NOT NULL
   AND card_last_4 IS NULL;

-- Index for any future "lookup by last 4" admin queries (cheap, sparse —
-- card_last_4 is high-cardinality across users so index is small).
CREATE INDEX IF NOT EXISTS idx_cards_user_last4
  ON cards(user_id, card_last_4)
  WHERE card_last_4 IS NOT NULL;

COMMIT;

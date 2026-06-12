-- Migration 031: Address Book — saved send-to contacts (Session 30 Phase 2.5 closeout)
-- Created: 2026-04-25
--
-- Why this table exists:
-- SendModal's "Address Book" tab shipped in S30 (38b99b6) with a demo
-- array. Users wanted to actually save recipients. The "recent
-- destinations" tab pulls from withdrawals (S30 batch wiring), but
-- saved favorites needed their own table — they're user-intent
-- (named by the user), not inferred from tx history.
--
-- Schema design:
-- - Scoped to user_id (one user's contacts are private)
-- - Unique (user_id, address) — one row per destination, label can be
-- edited. Prevents dupes when a user saves the same address with
-- slightly different capitalization (stored lowercased for EVM via
-- insert-time trim)
-- - Label varchar(100) — "Mom's wallet", "Coinbase cold storage", etc.
-- - chain is an optional hint for the UI (0x… = evm, base58 = solana)
-- but not enforced; a user could save an ENS name as text and we
-- resolve at send time
-- - favorite boolean so the UI can surface frequently-used first

CREATE TABLE IF NOT EXISTS address_book (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       VARCHAR(36) NOT NULL,
    address       VARCHAR(128) NOT NULL,
    label         VARCHAR(100) NOT NULL,
    chain         VARCHAR(32),
    favorite      BOOLEAN NOT NULL DEFAULT false,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, address)
);

CREATE INDEX IF NOT EXISTS idx_address_book_user
    ON address_book(user_id, favorite DESC, created_at DESC);

-- Touch updated_at on any UPDATE
CREATE OR REPLACE FUNCTION touch_address_book_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_address_book_touch ON address_book;
CREATE TRIGGER trg_address_book_touch
BEFORE UPDATE ON address_book
FOR EACH ROW EXECUTE FUNCTION touch_address_book_updated_at();

INSERT INTO schema_migrations (version, filename, notes) VALUES
  ('031', '031_address_book.sql', 'Session 30 Phase 2.5 closeout — saved address-book table for SendModal. CRUD in nuro-routes under /address-book, consumed by useFetch in SendModal Address Book tab.')
ON CONFLICT (version) DO NOTHING;

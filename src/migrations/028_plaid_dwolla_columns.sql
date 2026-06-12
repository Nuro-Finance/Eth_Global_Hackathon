-- Migration 028: Plaid + Dwolla columns on users — Session 28 Phase 8 scaffold
-- Created: 2026-04-21
--
-- WHY THIS EXISTS
-- Buy 2 (bank → crypto wallet) needs per-user state on the users row:
-- the Plaid access_token (long-lived), Plaid item_id (stable ref for the
-- linked bank Item), Dwolla customer URL (stable ref for all Dwolla ops),
-- and Dwolla funding source URL (the user's linked bank at Dwolla).
--
-- first_name / last_name are needed so we can create Dwolla "unverified"
-- customers at link time. Our current users.name column is a single
-- display field (e.g. " Wayne") that doesn't split cleanly on
-- spaces for Canadian/European compound surnames; keeping it AND adding
-- the split fields preserves backwards compat while letting link-complete
-- pass clean values to Dwolla. Populate first/last at registration when
-- the user provides them; fall back to 'Nuro' / 'User' in the route if
-- null until we do a data backfill.
--
-- WHAT WE DO
-- ALTER TABLE users ADD COLUMN (six columns, all nullable). No backfill —
-- existing rows get NULL and the link-complete path tolerates that by
-- falling back to 'Nuro User' for Dwolla customer creation. Once Dwolla
-- flips on in prod we'll add a forced re-KYC step that captures real
-- first/last name for any user who wants to Buy 2.
--
-- SECURITY NOTE
-- plaid_access_token is a bearer credential. In this scaffold we store
-- plaintext to unblock the flow; before BUY_2_ENABLED flips in prod,
-- wrap it with pgcrypto (sym enc with KMS-managed DEK) or migrate to
-- Vault. Tracked in Pending Tasks as "Encrypt plaid_access_token at rest"
-- pre-launch gate.
--
-- SAFETY
-- All ADD COLUMNs are IF NOT EXISTS — re-runnable. No data migration.
-- Locks briefly on users (ACCESS EXCLUSIVE for ALTER) but rows are small
-- and count is low (<10K). Run during a deploy window.
--

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100);

-- Dwolla URLs are self-describing stable refs. Store verbatim.
ALTER TABLE users ADD COLUMN IF NOT EXISTS dwolla_customer_url        VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS dwolla_funding_source_url  VARCHAR(500);

-- Plaid credentials (Phase 8 scaffold — plaintext until encryption wrap lands).
ALTER TABLE users ADD COLUMN IF NOT EXISTS plaid_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plaid_item_id      VARCHAR(100);

-- Index for Dwolla webhook lookup (future: inbound transfer processed events
-- need to map customer URL → user id fast). Partial index skips nulls.
CREATE INDEX IF NOT EXISTS idx_users_dwolla_customer_url
    ON users (dwolla_customer_url)
    WHERE dwolla_customer_url IS NOT NULL;

COMMIT;

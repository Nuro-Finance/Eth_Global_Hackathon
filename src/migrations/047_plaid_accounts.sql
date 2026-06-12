-- Migration 047 — plaid_accounts table
--
-- S35 Marathon 11 / Day-3. The "Connect Bank" pillar from the omnichain
-- settlement story. We already had migration 028 add plaid_access_token +
-- plaid_item_id columns to users (Session 28 / Buy-2 scaffold), but no
-- per-account snapshot — and the dashboard "show me my linked banks +
-- balances" view needs one row per account, not one per user.
--
-- The existing /buy-from-bank/link-complete route stores the access_token
-- on users.plaid_access_token but never persists the accounts list. This
-- migration backs the new GET /api/plaid/accounts endpoint that:
-- 1. Reads users.plaid_access_token
-- 2. Calls Plaid /accounts/balance/get
-- 3. Upserts each account into plaid_accounts
-- 4. Returns the rows for the FE to render
--
-- One-bank-per-user limit (today): we store access_token directly on users.
-- Multi-bank support requires moving access tokens into a separate
-- plaid_connections table — out of scope for the May 14 demo.
--
-- Security note: plaid_access_token is still plaintext per migration 028's
-- carryover. Encryption at rest is tracked as a pre-prod-launch gate; for
-- the sandbox demo this is acceptable.

CREATE TABLE IF NOT EXISTS plaid_accounts (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL,
    plaid_account_id   VARCHAR(100) NOT NULL,
    plaid_item_id      VARCHAR(100),  -- denormalized from users.plaid_item_id for join-free reads

 -- Account metadata from Plaid /accounts/get
    name               VARCHAR(200),
    official_name      VARCHAR(200),
    mask               VARCHAR(8),    -- last 4 of account number, may be null
    type               VARCHAR(20),   -- 'depository' | 'credit' | 'loan' | 'investment' | 'other'
    subtype            VARCHAR(40),   -- 'checking' | 'savings' | 'credit_card' | 'cd' | etc.

 -- Balance snapshot (refresh on demand). NULL allowed because Plaid
 -- sometimes returns balance=null on accounts without recent activity.
    current_balance    NUMERIC(20,2),
    available_balance  NUMERIC(20,2),
    iso_currency_code  VARCHAR(8) DEFAULT 'USD',

 -- Lifecycle
    last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent on Plaid's stable account id. Re-syncs upsert by this key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plaid_accounts_account_id
    ON plaid_accounts (plaid_account_id);

-- Lookup: "show me all this user's accounts"
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user
    ON plaid_accounts (user_id, last_synced_at DESC);

-- updated_at autobump (matches the connected_agents pattern from 045)
CREATE OR REPLACE FUNCTION trg_plaid_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plaid_accounts_updated_at ON plaid_accounts;
CREATE TRIGGER plaid_accounts_updated_at
    BEFORE UPDATE ON plaid_accounts
    FOR EACH ROW
    EXECUTE FUNCTION trg_plaid_accounts_updated_at();

SELECT 'Migration 047_plaid_accounts complete' AS result;

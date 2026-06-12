-- Migration 025: ERC-20 swap allowlist — database-backed (Session 23 Thread D)
-- Created: 2026-04-18
--
-- Why this table exists:
-- Session 23 shipped ERC20_ALLOWLIST as a hard-coded constant in swap.ts.
-- That works for a handful of tokens but every addition requires a code
-- commit + pre-push + pull on VPS + pm2 restart — ~10 minute cycle per
-- token. At 20-50 tokens ( goal), that's death by a thousand
-- redeploys AND couples token policy decisions to code reviews.
--
-- This migration moves the allowlist to a DB table. Admin can row-edit
-- `enabled` to toggle a token off instantly (no redeploy) if a rug
-- emerges. `findErc20` in swap.ts queries this with a 60s cache.
--
-- Schema design:
-- - Keyed by (chain_id, UPPER(symbol)) — prevents "link" vs "LINK" dupes
-- - `enabled` bool lets us kill a token without deleting the row (keeps
-- audit history). Row with enabled=false is inert but still queryable
-- for the admin UI.
-- - `category` mirrors the TypeScript enum: 'bluechip' | 'memecoin'
-- - `audited_at` + `audit_notes` — source of truth for policy compliance
-- - `min_liquidity_usd` — measured at audit time (for post-hoc sanity check)

CREATE TABLE IF NOT EXISTS erc20_allowlist (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id            INTEGER NOT NULL,
    symbol              VARCHAR(32) NOT NULL,
    display_name        VARCHAR(128) NOT NULL,
    contract_address    VARCHAR(80) NOT NULL,   -- 0x + 40 hex = 42, but leave headroom
    decimals            INTEGER NOT NULL,
    category            VARCHAR(32) NOT NULL CHECK (category IN ('bluechip', 'memecoin')),
    enabled             BOOLEAN NOT NULL DEFAULT true,
    audited_at          DATE NOT NULL,
    audit_notes         TEXT,
    min_liquidity_usd   NUMERIC(18, 2) DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chain_id, symbol)   -- one logical entry per (chain, symbol)
);

CREATE INDEX IF NOT EXISTS idx_erc20_allowlist_chain_enabled
    ON erc20_allowlist(chain_id, enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_erc20_allowlist_category
    ON erc20_allowlist(category, enabled) WHERE enabled = true;

-- Touch updated_at on every row update
CREATE OR REPLACE FUNCTION touch_erc20_allowlist_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erc20_allowlist_touch ON erc20_allowlist;
CREATE TRIGGER trg_erc20_allowlist_touch
BEFORE UPDATE ON erc20_allowlist
FOR EACH ROW EXECUTE FUNCTION touch_erc20_allowlist_updated_at();

-- Seed: migrate existing hardcoded ERC20_ALLOWLIST entries + add Session 23
-- Tier 1 + Tier 2 memecoin additions per Session 23 directive.
-- Bluechips (from swap.ts Session 23) — these stay enabled.
INSERT INTO erc20_allowlist (chain_id, symbol, display_name, contract_address, decimals, category, enabled, audited_at, audit_notes, min_liquidity_usd) VALUES
 -- Ethereum mainnet bluechips
    (1,     'LINK',  'Chainlink',       '0x514910771AF9Ca656af840dff83E8264EcF986CA', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — 5yr+ old, blue-chip oracle token', 50000000),
    (1,     'UNI',   'Uniswap',         '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — Uniswap governance, 4yr+ old', 30000000),
    (1,     'WBTC',  'Wrapped BTC',     '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',  8, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — BitGo-custodied BTC wrapper', 100000000),
    (1,     'WETH',  'Wrapped Ether',   '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — canonical WETH9', 500000000),
 -- Base bluechips
    (8453,  'WETH',  'Wrapped Ether',   '0x4200000000000000000000000000000000000006', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — OP Stack canonical WETH', 50000000),
    (8453,  'cbBTC', 'Coinbase BTC',    '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',  8, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — Coinbase-custodied BTC wrapper', 20000000),
 -- Arbitrum bluechips
    (42161, 'LINK',  'Chainlink',       '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — LINK on Arbitrum', 5000000),
    (42161, 'UNI',   'Uniswap',         '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — UNI on Arbitrum', 3000000),
    (42161, 'WBTC',  'Wrapped BTC',     '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',  8, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — WBTC on Arbitrum', 10000000),
    (42161, 'WETH',  'Wrapped Ether',   '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 18, 'bluechip', true, '2026-04-18', 'Session 23 initial audit — WETH on Arbitrum', 100000000),
 -- Memecoins — Tier 1 ( approved inline Session 23)
    (1,     'SHIB',  'Shiba Inu',       '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', 18, 'memecoin', true, '2026-04-18', 'Session 23 Tier 1 — #2 memecoin by market cap, since Aug 2020. Battle-tested, $100M+ liquidity.', 100000000),
    (1,     'PEPE',  'Pepe',            '0x6982508145454Ce325dDbE47a25d4ec3d2311933', 18, 'memecoin', true, '2026-04-18', 'Session 23 Tier 1 — top-5 memecoin by volume, since Apr 2023, ~$50M liquidity.', 50000000),
 -- Memecoins — Tier 2 ( approved inline Session 23 with "extra caution")
    (1,     'PENGU', 'Pudgy Penguins',  '0x24EcE6F20C39CE2d9c91aBCa5Ad3B27C50Bc58E9', 18, 'memecoin', true, '2026-04-18', 'Session 23 Tier 2 — TGE Dec 2024, ~16mo old. Liquidity moderate. Contract address needs verification before enabling.', 10000000),
    (1,     'ANDY',  'ANDY',            '0x68BbEd6A47194EFf1CF514B50Ea91895597fc91E', 18, 'memecoin', true, '2026-04-18', 'Session 23 Tier 2 — ~18mo old, has had pump episodes. Moderate risk.', 5000000),
 -- Additional — QUAI (: friend owns, he mines it himself)
    (1,     'QUAI',  'Quai Network',    '0x00000000000000000000000000000000deadbeef', 18, 'memecoin', false, '2026-04-18', 'Placeholder contract — verify before enable. Needs real 0x-verified contract before enabling. Disabled until verified.', 0)
ON CONFLICT (chain_id, symbol) DO NOTHING;

-- Audit trail entry
INSERT INTO schema_migrations (version, filename, notes) VALUES
  ('025', '025_erc20_allowlist_db.sql', 'Session 23 Thread D — DB-backed erc20_allowlist table. Moved from hardcoded constant in swap.ts so admin can row-edit enabled flag without redeploy. Seeds with Session 23 bluechips + Tier 1/2 memecoin approvals.')
ON CONFLICT (version) DO NOTHING;

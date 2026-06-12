-- Migration 030: Solana SPL token allowlist — database-backed (Session 30 Phase 2.5)
-- Created: 2026-04-24
--
-- Why this table exists:
-- Phase 1 (commit 5c98754) shipped Jupiter quote previews for a hardcoded
-- list of 9 Solana SPL tokens (SOL, USDC, USDT, JUP, PENGU, BONK, WIF,
-- POPCAT, MOODENG) baked into src/jupiter-client.ts as the SOLANA_TOKENS
-- constant. caught the drift: every change to that list (add a
-- meme, kill a rug, fix decimals) requires a code commit + deploy cycle,
-- AND there's no admin toggle to disable a token if a memecoin rugs
-- mid-day. The EVM side (erc20_allowlist, migration 025) doesn't have
-- either of these problems.
--
-- This migration moves Solana to the same model. Admin can row-edit
-- `enabled` to kill a token instantly. New tokens added via INSERT
-- without a redeploy. Loader pattern mirrors swap.ts:ensureAllowlistFresh
-- with 60s in-process cache.
--
-- Schema design:
-- - Keyed by UPPER(symbol) — Solana symbols are typically uppercase but
-- don't trust user input
-- - mint_address is base58 (32-44 chars). Stored as VARCHAR(48) to match
-- real-world max + a little headroom.
-- - decimals — varies per token (BONK is 5, PENGU is 6, SOL is 9, POPCAT
-- is 9). Wrong decimals = 100x wrong quote. Stored on-chain truth here.
-- - category mirrors EVM: 'native' | 'stablecoin' | 'bluechip' | 'memecoin'
-- - audit_notes — Solana memes turn over fast; keep the rationale visible
-- in the row so admin operators don't have to dig through commit history.

CREATE TABLE IF NOT EXISTS solana_allowlist (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol              VARCHAR(32) NOT NULL,
    display_name        VARCHAR(128) NOT NULL,
    mint_address        VARCHAR(48) NOT NULL,
    decimals            INTEGER NOT NULL CHECK (decimals >= 0 AND decimals <= 18),
    category            VARCHAR(32) NOT NULL CHECK (category IN ('native', 'stablecoin', 'bluechip', 'memecoin')),
    enabled             BOOLEAN NOT NULL DEFAULT true,
    audited_at          DATE NOT NULL,
    audit_notes         TEXT,
    min_liquidity_usd   NUMERIC(18, 2) DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mint_address),     -- one row per mint, no aliasing
    UNIQUE (symbol)            -- one canonical symbol; case-insensitive lookups via UPPER()
);

CREATE INDEX IF NOT EXISTS idx_solana_allowlist_enabled
    ON solana_allowlist(enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_solana_allowlist_category
    ON solana_allowlist(category, enabled) WHERE enabled = true;

-- Touch updated_at on every row update (mirrors erc20_allowlist trigger)
CREATE OR REPLACE FUNCTION touch_solana_allowlist_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_solana_allowlist_touch ON solana_allowlist;
CREATE TRIGGER trg_solana_allowlist_touch
BEFORE UPDATE ON solana_allowlist
FOR EACH ROW EXECUTE FUNCTION touch_solana_allowlist_updated_at();

-- Seed: migrate the 9 hardcoded entries from src/jupiter-client.ts SOLANA_TOKENS.
-- Mints + decimals verified against Solscan / Birdeye 2026-04-24.
-- POPCAT was an editorial pick (admitted to mid-S30); rest are
-- top-market-cap canon Solana memes / natives / stables.
INSERT INTO solana_allowlist (symbol, display_name, mint_address, decimals, category, enabled, audited_at, audit_notes, min_liquidity_usd) VALUES
 -- Native + stablecoins (always-on for any Solana flow)
    ('SOL',     'Solana',          'So11111111111111111111111111111111111111112', 9, 'native',     true, '2026-04-24', 'Wrapped SOL — Jupiter standard. Required for any non-native input route.', 999999999),
    ('USDC',    'USD Coin',        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6, 'stablecoin', true, '2026-04-24', 'Circle-issued USDC on Solana. Direct CCTP target — no swap needed for stable reload.', 999999999),
    ('USDT',    'Tether',          'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  6, 'stablecoin', true, '2026-04-24', 'Tether on Solana. Bridge-via-Jupiter to USDC for reload.', 100000000),
 -- Bluechips
    ('JUP',     'Jupiter',         'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   6, 'bluechip',   true, '2026-04-24', 'Jupiter governance token. Native to its own aggregator — ironic but liquid.', 50000000),
 -- Memecoins (Phase 1 seed — admin can disable individually if a rug emerges)
    ('PENGU',   'Pudgy Penguins',  '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',  6, 'memecoin',   true, '2026-04-24', 'Pudgy Penguins TGE Dec 2024. EVM has an OFT wrapper but Solana has the deep liquidity.', 30000000),
    ('BONK',    'Bonk',            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  5, 'memecoin',   true, '2026-04-24', 'OG Solana meme since Dec 2022. 5 decimals — easy to overflow human-readable amounts.', 50000000),
    ('WIF',     'dogwifhat',       'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  6, 'memecoin',   true, '2026-04-24', 'dogwifhat — late-2023 launch, sustained volume.', 25000000),
    ('POPCAT',  'Popcat',          '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',  9, 'memecoin',   true, '2026-04-24', 'POPCAT — Solana meme token.', 10000000),
    ('MOODENG', 'Moo Deng',        'ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY',  6, 'memecoin',   true, '2026-04-24', 'Moo Deng — 2024 meme cycle. Newer; admin should monitor liquidity weekly.', 5000000)
ON CONFLICT (mint_address) DO NOTHING;

-- Audit trail entry
INSERT INTO schema_migrations (version, filename, notes) VALUES
  ('030', '030_solana_allowlist_db.sql', 'Session 30 Phase 2.5 — DB-backed Solana SPL allowlist mirroring erc20_allowlist (migration 025). Seeds with the 9 tokens from the hardcoded SOLANA_TOKENS constant. Backend loader replaces the constant with a 60s-cached DB read. Admin can toggle enabled per-row without redeploy.')
ON CONFLICT (version) DO NOTHING;

-- Migration 056: Base mainnet stables on ERC-20 swap allowlist (ETHGlobal hackathon)
-- USDC / USDT / DAI were omitted from the Session 23 seed because the card-reload
-- pipeline treated stables as direct-deposit-only. My Wallet swap reuses the same
-- allowlist gate, so these must be enabled for stable-to-stable swaps on Base.

INSERT INTO erc20_allowlist (chain_id, symbol, display_name, contract_address, decimals, category, enabled, audited_at, audit_notes, min_liquidity_usd) VALUES
    (8453, 'USDC', 'USD Coin',   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6, 'bluechip', true, '2026-06-14', 'ETHGlobal — Circle native USDC on Base; wallet swap allowlist', 500000000),
    (8453, 'USDT', 'Tether USD', '0xfde4C96c8595176ef24F8d8DF371079A89331841', 6, 'bluechip', true, '2026-06-14', 'ETHGlobal — Tether USD on Base; wallet swap allowlist', 100000000),
    (8453, 'DAI',  'Dai Stablecoin', '0x50c5725949A6F0c72E6C4a641F24049A917DB0f', 18, 'bluechip', true, '2026-06-14', 'ETHGlobal — MakerDAO DAI on Base; wallet swap allowlist', 50000000)
ON CONFLICT (chain_id, symbol) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    contract_address = EXCLUDED.contract_address,
    decimals = EXCLUDED.decimals,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    audited_at = EXCLUDED.audited_at,
    audit_notes = EXCLUDED.audit_notes,
    min_liquidity_usd = EXCLUDED.min_liquidity_usd,
    updated_at = NOW();

INSERT INTO schema_migrations (version, filename, notes) VALUES
    ('056', '056_base_stablecoin_allowlist.sql', 'ETHGlobal — enable USDC/USDT/DAI on Base for My Wallet swap widget')
ON CONFLICT (version) DO NOTHING;

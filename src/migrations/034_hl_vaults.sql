-- ─────────────────────────────────────────────────────────────────────────────
-- 034 — Hyperliquid vault deposit + position tracking (HL Phase 1)
--
-- Per Hyperliquid Integration Design v1 (S31 H1, hybrid C-now / B-later):
-- Phase 1 ships curated HL vault deposits as a "Hyperliquid Yield Vault"
-- card on the Yield page. Users deposit USDC, agent allocates into 2-4
-- audited vaults, daily APR + cumulative PnL surfaces in the wallet.
--
-- This migration creates the two tables that back that surface:
-- - hl_vaults: the curated vault registry. Nuro drafts the audit,
-- signs off, only `audit_status='approved'` vaults appear in
-- production UI. ~3-6 entries at any given time.
-- - hl_vault_positions: per-user open positions. One row per
-- (user, vault) deposit thread; closed positions stay for history.
--
-- Read-only first slice (S31 H2):
-- - hl_vaults seeded with 0 rows; admin endpoint adds candidates after audit
-- - hl_vault_positions stays empty until deposit/withdraw flow ships
-- - Yield page surfaces hl_vaults rows via GET /api/hl/vaults
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS hl_vaults (
 -- Slug-style id, e.g. 'hl-makers-001'. Stable across restarts.
    id              VARCHAR(64) PRIMARY KEY,
    display_name    TEXT NOT NULL,
 -- Vault contract address on HyperEVM (chainId 999). Each HL vault is
 -- a smart contract; user deposits invoke its deposit and receive
 -- shares. Cast to lowercase before comparison.
    vault_address   TEXT NOT NULL UNIQUE,
 -- Public-facing leader identity. Either:
 -- "team:<team-name>" (verified protocol team)
 -- "doxxed:<twitter-handle>" (public crypto-Twitter persona)
 -- We do NOT list anonymous-leader vaults under any circumstances.
    leader          TEXT NOT NULL,
 -- Min deposit users see in the UI. Floor; HL vault might enforce
 -- a higher floor itself.
    min_deposit_usd NUMERIC(12,2) NOT NULL DEFAULT 100,
 -- Lifecycle: pending → approved → (paused | deprecated). Only
 -- 'approved' rows are surfaced in production UI.
    audit_status    TEXT NOT NULL DEFAULT 'pending'
                    CHECK (audit_status IN ('pending', 'approved', 'paused', 'deprecated')),
 -- Free-form audit notes from Nuro. Includes link to the audit
 -- decision-journal entry, plus drawdown / TVL / age numbers at audit.
    audit_notes     TEXT,
    approved_by     TEXT,                       -- 'richard' typically
    approved_at     TIMESTAMPTZ,
 -- Soft pause without deletion (pulls from UI but preserves audit history).
    paused_reason   TEXT,
    paused_at       TIMESTAMPTZ,
 -- Cached read-only data (refreshed by hl-position-sync cron).
 -- Reflects last successful on-chain read. Null until first sync.
    cached_apr_pct       NUMERIC(8,3),       -- e.g. 12.345 = 12.345% APR
    cached_tvl_usd       NUMERIC(18,2),
    cached_total_assets  NUMERIC(36,18),     -- raw vault.totalAssets()
    cached_total_shares  NUMERIC(36,18),
    cached_at            TIMESTAMPTZ,
 -- Public-info fields for the FE card
    description          TEXT,                 -- 1-2 sentence strategy summary
    risk_level           TEXT
                         CHECK (risk_level IN ('low', 'medium', 'high')),
 -- Audit-rubric scores (0-10) for transparency on the Yield card.
 -- Null until audit completed.
    score_tvl            INTEGER CHECK (score_tvl BETWEEN 0 AND 10),
    score_age            INTEGER CHECK (score_age BETWEEN 0 AND 10),
    score_drawdown       INTEGER CHECK (score_drawdown BETWEEN 0 AND 10),
    score_leader         INTEGER CHECK (score_leader BETWEEN 0 AND 10),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hl_vaults_status ON hl_vaults(audit_status)
    WHERE audit_status = 'approved';

CREATE TABLE IF NOT EXISTS hl_vault_positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 -- users.id is VARCHAR on prod (verified — see CLAUDE.md auto-memory).
 -- DO NOT change to UUID without re-confirming the schema.
    user_id         VARCHAR NOT NULL REFERENCES users(id),
    vault_id        VARCHAR(64) NOT NULL REFERENCES hl_vaults(id),
 -- USD-equivalent (USDC) the user deposited at open time. Use this as
 -- the cost basis for PnL calc.
    deposit_amount_usdc  NUMERIC(18,6) NOT NULL,
 -- The actual on-chain deposit tx hash. NULL until the deposit-pipeline
 -- step that broadcasts the tx completes (Phase 1.2; this row is
 -- created in 'pending' state at intent time).
    deposit_tx_hash      TEXT,
 -- Vault shares received in exchange for the deposit. Same precision as
 -- ERC4626 (typically 18-dec). Computed from the deposit event log.
    shares_held          NUMERIC(36,18) NOT NULL DEFAULT 0,
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'active', 'withdrawing', 'closed', 'failed')),
 -- Withdrawal tracking — HL vaults have epoch-based windows so the
 -- "user clicked withdraw" event may take days to settle.
    withdraw_initiated_at TIMESTAMPTZ,
    withdraw_completes_at TIMESTAMPTZ,
    withdraw_tx_hash      TEXT,
 -- Final settlement amounts (set when status='closed').
    closed_amount_usdc    NUMERIC(18,6),
    closed_pnl_usdc       NUMERIC(18,6),    -- negative = loss
 -- Last successful sync — drives the "X minutes ago" freshness label
 -- and stops stale data from showing as live.
    last_synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_known_value_usd NUMERIC(18,2),
    opened_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hl_positions_user_status
    ON hl_vault_positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_hl_positions_vault_active
    ON hl_vault_positions(vault_id)
    WHERE status IN ('pending', 'active', 'withdrawing');
CREATE INDEX IF NOT EXISTS idx_hl_positions_synced
    ON hl_vault_positions(last_synced_at)
    WHERE status IN ('active', 'withdrawing');

COMMIT;

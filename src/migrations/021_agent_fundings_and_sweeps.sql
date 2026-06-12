-- Migration 021: Agent Fundings + Profit Sweeps (Sprint 2.3)
-- Created: 2026-04-17 (Session 21)
-- Sprint 2.3 — Bot Section Real Execution

-- agent_fundings: user vault (Base) → agent wallet (Polygon) via CCTP
-- Note: agents.id is UUID on production (migration 010 CREATE TABLE IF NOT EXISTS
-- was a no-op since agents pre-existed with UUID). users.id is VARCHAR(36).
CREATE TABLE IF NOT EXISTS agent_fundings (
    id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id           VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount            NUMERIC(12,6) NOT NULL,
    status            VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending | burning | attesting | completed | failed | skipped_observe_only
    burn_tx_hash      VARCHAR(100),
    mint_tx_hash      VARCHAR(100),
    error_message     TEXT,
    attempt_count     INT DEFAULT 0,
    last_attempted_at TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_fundings_agent ON agent_fundings(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_fundings_status ON agent_fundings(status);

-- agent_profit_sweeps: agent wallet (Polygon) → user vault (Base) via CCTP
CREATE TABLE IF NOT EXISTS agent_profit_sweeps (
    id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id           VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount            NUMERIC(12,6) NOT NULL,
    status            VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- pending | burning | attesting | completed | failed
    burn_tx_hash      VARCHAR(100),
    mint_tx_hash      VARCHAR(100),
    destination       VARCHAR(50),  -- snapshot of users.payout_destination at enqueue
    error_message     TEXT,
    attempt_count     INT DEFAULT 0,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_profit_sweeps_agent ON agent_profit_sweeps(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_profit_sweeps_status ON agent_profit_sweeps(status);

-- Funding + sweep totals on agents (enables P&L reconciliation without scanning history)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_funded        NUMERIC(12,6) DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_swept         NUMERIC(12,6) DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_reconciled_at  TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_pnl_drift_usd  NUMERIC(12,6) DEFAULT 0;

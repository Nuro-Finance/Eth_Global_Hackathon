-- Migration 010: Agent System Tables
-- Created: 2026-04-12 (Session 17)
-- Referenced in nuro-routes.ts lines 1837-2149
--
-- ⚠️ HISTORICAL DRIFT NOTE (added 2026-04-17, Session 21):
-- This migration used CREATE TABLE IF NOT EXISTS against tables that ALREADY
-- EXISTED on production with a different schema. As a result, the declarations
-- below PARTIALLY NO-OP'd:
-- • agents.id — declared VARCHAR(36) here; production has UUID type
-- • agent_bets.id — declared VARCHAR(36) here; production has UUID type
-- • agent_bets columns pnl, settled_at — NEVER applied via this migration
--
-- Fixes landed retroactively:
-- • 022_agent_bets_settlement_columns.sql — added missing pnl + settled_at
-- • 023_schema_migrations_tracking.sql — records applied state in DB
-- • scripts/audit-schema.sql — drift detector (run via /gate-check schema-integrity)
--
-- DO NOT trust the column types declared below as the source of truth for
-- production. Run scripts/audit-schema.sql or query information_schema.columns
-- directly before writing any FK against these tables.

CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(30) NOT NULL DEFAULT 'polymarket',
  wallet_address VARCHAR(42),
  card_id       VARCHAR(36) REFERENCES cards(id) ON DELETE SET NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  risk_limit    NUMERIC(12,2) DEFAULT 100,
  strategy      JSONB DEFAULT '{}',
  total_invested NUMERIC(12,2) DEFAULT 0,
  total_profit  NUMERIC(12,2) DEFAULT 0,
  win_count     INT DEFAULT 0,
  loss_count    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id       VARCHAR(100) NOT NULL,
  market_question TEXT DEFAULT '',
  outcome         VARCHAR(10) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  entry_price     NUMERIC(10,4) DEFAULT 0,
  exit_price      NUMERIC(10,4),
  pnl             NUMERIC(12,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued | open | won | lost | cancelled
  tx_hash         VARCHAR(100),
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_bets_agent ON agent_bets(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_bets_user ON agent_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_bets_status ON agent_bets(status);

-- Migration 022: Fix agent_bets schema drift (Sprint 2.3 hotfix)
-- Created: 2026-04-17 (Session 21 hotfix #2)
--
-- Migration 010 declared agent_bets with settlement columns (exit_price, pnl,
-- settled_at), but the table pre-existed on VPS and CREATE TABLE IF NOT EXISTS
-- was a no-op. sweepAgentBetSettlements writes to these columns; reconcileAgentPnL
-- reads pnl. Adding them idempotently so re-running is safe.
--
-- Related: Session 21 Hotfix commits b8aefe6 (migration 021 FK types),
-- cd8254c (tsx to runtime deps). This closes the third VPS schema drift.

ALTER TABLE agent_bets ADD COLUMN IF NOT EXISTS exit_price NUMERIC(10,4);
ALTER TABLE agent_bets ADD COLUMN IF NOT EXISTS pnl        NUMERIC(12,2);
ALTER TABLE agent_bets ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Defensive: the columns the bet-placement path writes to. All declared in
-- migration 010; adding idempotently in case any other column drifted.
ALTER TABLE agent_bets ADD COLUMN IF NOT EXISTS market_question TEXT DEFAULT '';
ALTER TABLE agent_bets ADD COLUMN IF NOT EXISTS tx_hash         VARCHAR(100);

-- Index used by sweepAgentBetSettlements to find open bets fast
CREATE INDEX IF NOT EXISTS idx_agent_bets_status ON agent_bets(status);
CREATE INDEX IF NOT EXISTS idx_agent_bets_agent_status ON agent_bets(agent_id, status);

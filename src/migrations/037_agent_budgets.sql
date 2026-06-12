-- ─────────────────────────────────────────────────────────────────────────────
-- 037 — Agent budgets (USD authority + gas balance per chain)
--
-- S31 H2. Per Mythos's "what does an agent want" list + Richard's expansion
-- (gas budget that agents can autonomously shuffle). Schema:
--   - agent_budgets: per-agent (period, currency) authority + remaining
--   - agent_gas_balances: per-agent per-chain native-token balance (cached)
--   - agent_budget_ledger: append-only event log of every spend / refill /
--     transfer. Drives the "where did the money go" view.
--
-- Read model:
--   GET /api/agents/:id/budget
--     → { usdBudget: { weekly, monthly, ... }, gasByChain, recentLedger }
--
-- Write paths:
--   - Spend: every on-chain tx OR off-chain payment (issuer fee, etc.)
--     records to agent_budget_ledger with action='spend' + delta < 0.
--   - Refill: human-driven top-up to weekly/monthly budget records to
--     ledger with action='refill' + delta > 0.
--   - Gas-shuffle: agent moves native between chains. Both legs recorded
--     (action='gas-out' on source, 'gas-in' on dest).
--
-- Heimdall integration: HEIM-105 reads agent_budgets.usd_remaining and
-- caps tx values at min(env_default, remaining). The cap CAN'T be evaded
-- without a refill audit-trail.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS agent_budgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- VARCHAR to match agents.id on prod (HD-derived plus 'system' /
    -- 'mythos' / etc. for non-table agents).
    agent_id        VARCHAR(128) NOT NULL,
    -- Period the budget renews on. 'weekly' is canonical for v1; 'monthly'
    -- + 'one-shot' (drains, doesn't auto-refill) supported as alternates.
    period          VARCHAR(16) NOT NULL DEFAULT 'weekly'
                    CHECK (period IN ('weekly', 'monthly', 'one-shot')),
    -- Total authority in this period in USD.
    usd_authority   NUMERIC(14,2) NOT NULL,
    -- USD remaining after spending. Bumps down per spend ledger entry,
    -- refills back to usd_authority on period rollover (handled by cron).
    usd_remaining   NUMERIC(14,2) NOT NULL,
    -- Last period reset — cron uses this to know when to roll over.
    last_reset_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Active budgets are surfaced to Heimdall + the admin UI; archived
    -- budgets are kept for forensic history but don't gate.
    active          BOOLEAN NOT NULL DEFAULT true,
    -- Optional human-readable note ("Sprint 31 yield experiments", etc.)
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, period)
);

CREATE INDEX IF NOT EXISTS idx_agent_budgets_active
    ON agent_budgets(agent_id, period)
    WHERE active = true;

-- Per-chain native balance for the agent's gas wallet. The actual
-- balance lives on-chain; this table is a CACHE refreshed periodically
-- by a balance-sync cron. Used for "you have X gas left on Y chain"
-- display + autonomous-shuffle decision-making.
CREATE TABLE IF NOT EXISTS agent_gas_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        VARCHAR(128) NOT NULL,
    chain_id        INTEGER NOT NULL,
    -- Wallet address holding the gas (HD-derived per agent per chain).
    -- Stored separately from the balance so we can map address → agent
    -- when on-chain events fire.
    wallet_address  TEXT NOT NULL,
    -- Native token balance, expressed as wei-equivalent (raw integer).
    -- BigInt-shape stored as NUMERIC for precision; FE / API converts.
    balance_native  NUMERIC(48,0) NOT NULL DEFAULT 0,
    -- Cached USD value at last_synced_at (snapshot; not authoritative
    -- between syncs, just for display). Computed via native-price.ts.
    balance_usd     NUMERIC(14,2),
    last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ops alert thresholds. When balance_usd < low_threshold_usd, ops
    -- alert fires. Defaults configurable per chain via cron.
    low_threshold_usd  NUMERIC(10,2) DEFAULT 1.00,
    UNIQUE (agent_id, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_gas_balances_low
    ON agent_gas_balances(agent_id)
    WHERE balance_usd < COALESCE(low_threshold_usd, 1.00);

-- Append-only ledger. Every spend / refill / shuffle records a row.
-- This is the single source of truth for "where did the money go" — the
-- agent_budgets.usd_remaining column is a CACHE derived from this ledger.
CREATE TABLE IF NOT EXISTS agent_budget_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        VARCHAR(128) NOT NULL,
    -- Action drives interpretation of delta:
    --   'spend'      → delta < 0, USD authority consumed
    --   'refill'     → delta > 0, human top-up
    --   'period-reset' → restores to usd_authority (delta is positive
    --                    enough to bring remaining back to authority)
    --   'gas-out'    → delta < 0 in native token units (chain-specific)
    --   'gas-in'     → delta > 0 in native token units (chain-specific)
    --   'gas-buy'    → delta < 0 USD + delta > 0 gas, but recorded as
    --                  TWO rows for clean accounting
    action          VARCHAR(32) NOT NULL,
    -- Currency: 'USD' for budget moves, 'ETH' / 'MATIC' / 'HYPE' / etc.
    -- for gas moves. ISO-style symbols.
    currency        VARCHAR(16) NOT NULL DEFAULT 'USD',
    -- Chain context for gas-related rows. Null for USD budget moves.
    chain_id        INTEGER,
    delta           NUMERIC(48,8) NOT NULL,
    -- Human-readable label of what triggered this. e.g.
    --   'swap-eth-usdc on chain 1 by execution-dispatch'
    --   'gas-topup on chain 8453 from gas.ts'
    --   'human-refill via admin-console by richard'
    description     TEXT NOT NULL,
    -- Foreign key to the on-chain tx that drove the spend, when applicable.
    related_tx_hash TEXT,
    related_event_id UUID,  -- heimdall_events.id reference if Heimdall flagged
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_budget_ledger_agent_time
    ON agent_budget_ledger(agent_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_budget_ledger_action
    ON agent_budget_ledger(action, occurred_at DESC);

-- Convenience view: weekly spend summary per agent.
CREATE OR REPLACE VIEW agent_budget_weekly_summary AS
SELECT
    agent_id,
    SUM(CASE WHEN action = 'spend' AND currency = 'USD' THEN -delta ELSE 0 END) AS usd_spent_7d,
    COUNT(*) FILTER (WHERE action = 'spend' AND occurred_at >= now() - interval '7 days') AS spend_count_7d,
    MAX(occurred_at) FILTER (WHERE action = 'spend') AS last_spend_at
FROM agent_budget_ledger
WHERE occurred_at >= now() - interval '7 days'
GROUP BY agent_id;

COMMIT;

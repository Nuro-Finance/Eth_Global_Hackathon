-- Sprint 2.3 evidence script — run on VPS via psql to verify sweeps are firing.
-- Usage: psql "$DATABASE_URL" -f scripts/sprint-2.3-evidence.sql
--
-- After migration 021 is applied and the backend is restarted, running this
-- immediately after one or two 60-second sweep cycles should show:
--   1. agent_fundings rows (if any user tested the fund endpoint)
--   2. execution_log entries with entity_type IN ('agent_funding', 'agent_bet_settlement',
--      'agent_profit_sweep', 'agent_reconcile', 'agent_cycle')
--   3. agents.last_reconciled_at updating on every cycle for every active agent

\echo '── 1. Migration 021 applied?'
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_fundings') AS agent_fundings_exists,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_profit_sweeps') AS agent_profit_sweeps_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'total_funded') AS agents_total_funded_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'last_reconciled_at') AS agents_last_reconciled_at_col;

\echo ''
\echo '── 2. Active agents (should populate sweep inputs)'
SELECT id, name, status, wallet_address, total_funded, total_invested, total_swept, last_reconciled_at, last_pnl_drift_usd
FROM agents WHERE status IN ('active', 'funding') ORDER BY updated_at DESC LIMIT 5;

\echo ''
\echo '── 3. Recent funding intents (observe-only rows expected pre-Monday)'
SELECT id, agent_id, amount, status, error_message, created_at
FROM agent_fundings ORDER BY created_at DESC LIMIT 5;

\echo ''
\echo '── 4. Execution log — agent entries in the last hour'
SELECT entity_type, action, status, LEFT(detail, 100) as detail_trim, created_at
FROM execution_log
WHERE entity_type LIKE 'agent_%' AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC LIMIT 20;

\echo ''
\echo '── 5. Sweep cycle telemetry — was runSweepCycle called in last 5 min?'
SELECT COUNT(*) AS agent_log_rows_last_5min,
       MIN(created_at) AS oldest,
       MAX(created_at) AS newest
FROM execution_log
WHERE entity_type LIKE 'agent_%' AND created_at > now() - interval '5 minutes';

\echo ''
\echo '── 6. Reconcile coverage — which active agents were reconciled in last 2 min?'
SELECT id, name, last_reconciled_at, last_pnl_drift_usd,
       EXTRACT(EPOCH FROM (now() - last_reconciled_at))::int AS seconds_since_reconcile
FROM agents
WHERE status = 'active'
ORDER BY last_reconciled_at NULLS FIRST
LIMIT 10;

\echo ''
\echo '── 7. Drift alerts (should be empty in a healthy system)'
SELECT entity_id AS agent_id, detail, created_at
FROM execution_log
WHERE entity_type = 'agent_reconcile' AND action = 'drift_alert' AND created_at > now() - interval '1 day'
ORDER BY created_at DESC LIMIT 5;

-- audit-schema.sql — Runnable schema drift detector
-- Usage: psql "$DATABASE_URL" -f scripts/audit-schema.sql
--
-- Compares production column types against expected baseline. Exits with a
-- non-zero count of "DRIFT" rows if anything mismatches. Intended to run as
-- part of gate-check deploy-vps (schema-integrity gate).
--
-- Created 2026-04-17 after the agents.id uuid/varchar drift incident.

\echo '════════════════════════════════════════════════════════════════════'
\echo '  AFI Schema Audit — drift detection against expected baseline'
\echo '════════════════════════════════════════════════════════════════════'
\echo ''

-- ── Expected baseline ────────────────────────────────────────────────────
-- Derived from production reality (verified 2026-04-17) + critical
-- columns Sprint 2.3 code depends on.

WITH expected_schema(table_name, column_name, expected_type) AS (VALUES
  -- Core identity tables
  ('agents',              'id',                  'uuid'),
  ('agents',              'user_id',             'character varying'),
  ('agents',              'wallet_address',      'character varying'),
  ('agents',              'status',              'character varying'),
  ('agents',              'strategy',            'jsonb'),
  ('agents',              'total_funded',        'numeric'),
  ('agents',              'total_invested',      'numeric'),
  ('agents',              'total_swept',         'numeric'),
  ('agents',              'last_reconciled_at',  'timestamp with time zone'),
  ('agents',              'last_pnl_drift_usd',  'numeric'),

  ('agent_bets',          'id',                  'uuid'),
  ('agent_bets',          'agent_id',            'uuid'),
  ('agent_bets',          'user_id',             'character varying'),
  ('agent_bets',          'amount',              'numeric'),
  ('agent_bets',          'entry_price',         'numeric'),
  ('agent_bets',          'exit_price',          'numeric'),
  ('agent_bets',          'pnl',                 'numeric'),
  ('agent_bets',          'status',              'character varying'),
  ('agent_bets',          'settled_at',          'timestamp with time zone'),

  ('agent_fundings',      'id',                  'character varying'),
  ('agent_fundings',      'agent_id',            'uuid'),
  ('agent_fundings',      'user_id',             'character varying'),
  ('agent_fundings',      'amount',              'numeric'),
  ('agent_fundings',      'status',              'character varying'),

  ('agent_profit_sweeps', 'id',                  'character varying'),
  ('agent_profit_sweeps', 'agent_id',            'uuid'),
  ('agent_profit_sweeps', 'user_id',             'character varying'),
  ('agent_profit_sweeps', 'amount',              'numeric'),
  ('agent_profit_sweeps', 'status',              'character varying'),

  ('users',               'id',                  'character varying'),
  ('users',               'payout_destination',  'character varying'),
  ('users',               'sd3_user_id',         'text'),              -- VERIFIED: text on prod (not VARCHAR despite some migration declarations)

  ('cards',               'id',                  'character varying'),
  ('cards',               'user_id',             'character varying'),
  ('cards',               'balance',             'numeric'),

  ('card_settlements',    'id',                  'uuid'),              -- VERIFIED: uuid on prod
  ('card_settlements',    'user_id',             'character varying'),
  ('card_settlements',    'amount',              'numeric'),
  ('card_settlements',    'status',              'character varying'),
  ('card_settlements',    'destination',         'character varying'),

  ('market_positions',    'id',                  'uuid'),              -- VERIFIED: uuid on prod
  ('market_positions',    'user_id',             'character varying'),
  ('market_positions',    'status',              'character varying'),

  ('execution_log',       'entity_type',         'character varying'),
  ('execution_log',       'status',              'character varying'),

  ('schema_migrations',   'version',             'character varying')
)
SELECT
  CASE
    WHEN actual.data_type IS NULL THEN 'DRIFT: MISSING'
    WHEN actual.data_type = expected_type THEN 'OK'
    ELSE 'DRIFT: TYPE MISMATCH'
  END AS status,
  expected.table_name,
  expected.column_name,
  expected.expected_type,
  COALESCE(actual.data_type, '<not found>') AS actual_type
FROM expected_schema expected
LEFT JOIN information_schema.columns actual
  ON actual.table_name  = expected.table_name
 AND actual.column_name = expected.column_name
ORDER BY
  CASE WHEN actual.data_type IS NULL OR actual.data_type != expected_type THEN 0 ELSE 1 END,
  expected.table_name,
  expected.column_name;

\echo ''
\echo '── Summary ──────────────────────────────────────────────────────────'
WITH expected_schema(table_name, column_name, expected_type) AS (VALUES
  ('agents','id','uuid'),('agents','user_id','character varying'),('agents','wallet_address','character varying'),
  ('agents','status','character varying'),('agents','strategy','jsonb'),('agents','total_funded','numeric'),
  ('agents','total_invested','numeric'),('agents','total_swept','numeric'),
  ('agents','last_reconciled_at','timestamp with time zone'),('agents','last_pnl_drift_usd','numeric'),
  ('agent_bets','id','uuid'),('agent_bets','agent_id','uuid'),('agent_bets','user_id','character varying'),
  ('agent_bets','amount','numeric'),('agent_bets','entry_price','numeric'),('agent_bets','exit_price','numeric'),
  ('agent_bets','pnl','numeric'),('agent_bets','status','character varying'),('agent_bets','settled_at','timestamp with time zone'),
  ('agent_fundings','id','character varying'),('agent_fundings','agent_id','uuid'),
  ('agent_fundings','user_id','character varying'),('agent_fundings','amount','numeric'),('agent_fundings','status','character varying'),
  ('agent_profit_sweeps','id','character varying'),('agent_profit_sweeps','agent_id','uuid'),
  ('agent_profit_sweeps','user_id','character varying'),('agent_profit_sweeps','amount','numeric'),
  ('agent_profit_sweeps','status','character varying'),
  ('users','id','character varying'),('users','payout_destination','character varying'),('users','sd3_user_id','text'),
  ('cards','id','character varying'),('cards','user_id','character varying'),('cards','balance','numeric'),
  ('card_settlements','id','uuid'),('card_settlements','user_id','character varying'),
  ('card_settlements','amount','numeric'),('card_settlements','status','character varying'),
  ('card_settlements','destination','character varying'),
  ('market_positions','id','uuid'),('market_positions','user_id','character varying'),
  ('market_positions','status','character varying'),
  ('execution_log','entity_type','character varying'),('execution_log','status','character varying'),
  ('schema_migrations','version','character varying')
)
SELECT
  COUNT(*) FILTER (WHERE actual.data_type IS NULL) AS missing,
  COUNT(*) FILTER (WHERE actual.data_type IS NOT NULL AND actual.data_type != expected_type) AS type_mismatches,
  COUNT(*) FILTER (WHERE actual.data_type = expected_type) AS ok,
  COUNT(*) AS total_checks
FROM expected_schema expected
LEFT JOIN information_schema.columns actual
  ON actual.table_name  = expected.table_name
 AND actual.column_name = expected.column_name;

\echo ''
\echo '── Applied migrations ───────────────────────────────────────────────'
SELECT version, filename, applied_at, LEFT(notes, 80) AS notes_short
FROM schema_migrations ORDER BY version;

\echo ''
\echo '  ✅ OK = column exists with expected type'
\echo '  🔴 DRIFT: MISSING = column does not exist'
\echo '  🔴 DRIFT: TYPE MISMATCH = column exists but wrong type'
\echo '  Treat any DRIFT as a blocker. Write a migration to reconcile before deploy.'
\echo '════════════════════════════════════════════════════════════════════'

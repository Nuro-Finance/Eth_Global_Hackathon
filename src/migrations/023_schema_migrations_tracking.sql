-- Migration 023: schema_migrations tracking table (structural drift prevention)
-- Created: 2026-04-17 (Session 21)
--
-- Root cause of the 2026-04-17 deploy drift incident:
-- Migration 010 declared agents + agent_bets with VARCHAR ids. The tables
-- pre-existed on production with uuid. `CREATE TABLE IF NOT EXISTS` was a
-- no-op. Missing columns (pnl, settled_at) stayed missing silently. Three
-- hotfix migrations (021 re-run, 022, and retroactive tracking here) were
-- required at deploy time.
--
-- Prevention: record every applied migration with filename + checksum + notes
-- so the DB itself is the source of truth for "what's been applied," not
-- the migration file directory on disk.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version      VARCHAR(10)  PRIMARY KEY,   -- '023', '024', etc.
    filename     VARCHAR(200) NOT NULL,
    applied_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    applied_by   VARCHAR(100) NOT NULL DEFAULT current_user,
    checksum     VARCHAR(64),                 -- sha256 of migration file at apply time (optional; populate going forward)
    notes        TEXT                          -- free-form, used to flag partial/drift-risky applications
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);

-- Backfill known migrations. Dates approximate (from session logs / git commit history).
-- `notes` field flags the historical drift issues uncovered 2026-04-17.
INSERT INTO schema_migrations (version, filename, applied_at, notes) VALUES
  ('003', '003_execution_dispatch.sql',              '2026-04-09', NULL),
  ('004', '004_market_feeds.sql',                    '2026-04-09', NULL),
  ('005', '005_issuer_webhooks.sql',                   '2026-04-10', 'legacy webhook table bootstrap'),
  ('006', '006_p2p_transfers.sql',                   '2026-04-10', NULL),
  ('007', '007_growth_agent.sql',                    '2026-04-11', NULL),
  ('008', '008_performance_indexes.sql',             '2026-04-11', NULL),
  ('009', '009_fee_system.sql',                      '2026-04-12', NULL),
  ('010', '010_agents.sql',                          '2026-04-12', 'PARTIAL — CREATE TABLE IF NOT EXISTS was no-op for pre-existing agents + agent_bets (both had uuid ids). Columns pnl, settled_at did NOT land via this migration. Fixed retroactively by 022.'),
  ('011', '011_solana_address_fix.sql',              '2026-04-13', NULL),
  ('012', '012_rename_legacy_to_issuer.sql',           '2026-04-13', 'legacy provider column rename'),
  ('013', '013_card_default_and_bridge_display.sql', '2026-04-13', NULL),
  ('014', '014_scheduled_withdrawals.sql',           '2026-04-14', NULL),
  ('015', '015_security_hardening.sql',              '2026-04-14', NULL),
  ('016', '016_issuer_transaction_sync.sql',         '2026-04-15', NULL),
  ('017', '017_fix_issuer_user_id_rename.sql',         '2026-04-15', NULL),
  ('018', '018_card_settlements.sql',                '2026-04-16', 'Sprint B — card_settlements queue + users.payout_destination prefix:args'),
  ('019', '019_creator_staking.sql',                 '2026-04-16', 'Sprint C — creator stake + rewards'),
  ('020', '020_card_balance_audit.sql',              '2026-04-16', 'Sprint D — drift telemetry'),
  ('021', '021_agent_fundings_and_sweeps.sql',       '2026-04-17', 'Sprint 2.3 — re-run after FK type hotfix. First attempt failed because 010 left agents.id as uuid but 021 declared VARCHAR FK. Fixed in commit b8aefe6 and re-applied.'),
  ('022', '022_agent_bets_settlement_columns.sql',   '2026-04-17', 'Sprint 2.3 — retroactive fix for agent_bets columns that 010 never actually applied (pnl, settled_at + defensive additions)'),
  ('023', '023_schema_migrations_tracking.sql',      NOW(),         'Self-registering — tracks every future migration with applied_at + checksum + notes')
ON CONFLICT (version) DO NOTHING;

-- From this point forward, every new migration MUST end with:
-- INSERT INTO schema_migrations (version, filename, notes) VALUES ('NNN', 'NNN_<name>.sql', '<notes>');
-- ...OR be applied via a wrapper script that records it automatically.

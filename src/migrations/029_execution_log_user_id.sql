-- Migration 029: Add user_id to execution_log — Session 28 Phase 8 hotfix
-- Created: 2026-04-22
--
-- WHY THIS EXISTS
--   Four INSERT INTO execution_log call sites in nuro-routes.ts (around
--   lines 2011, 2035, 2052, 2116 — all in the withdrawal path) reference
--   a `user_id` column that does NOT exist in the execution_log table per
--   migration 003 (the table's original definition). Every withdrawal
--   triggers the error:
--     "column user_id of relation execution_log does not exist"
--
--   The errors have been silent because each INSERT is wrapped in
--   `.catch(() => {})`. That swallowing was intended for "don't let audit
--   logging fail the withdrawal" — good defensive posture — but it hid
--   the fact that the column didn't exist, so we lost EVERY withdrawal
--   audit record.
--
--   Found via Postgres log inspection during Session 28 MCP diagnostic
--   (2026-04-22 16:46:18 UTC entry).
--
-- WHAT WE DO
--   ALTER TABLE execution_log ADD COLUMN user_id VARCHAR(36). Matches
--   the users.id column type (VARCHAR(36), confirmed via information_schema
--   during Session 28 diagnostic). Nullable — historical rows (pre-this
--   migration) + non-withdrawal rows don't have a natural user_id.
--
--   Adds partial index on user_id for per-user audit queries
--   (skips NULL rows via WHERE clause).
--
-- SAFETY
--   ADD COLUMN IF NOT EXISTS — re-runnable. Nullable — won't break any
--   existing INSERT that doesn't specify user_id. Brief ACCESS EXCLUSIVE
--   lock on ALTER, but execution_log gets hundreds of inserts/day not
--   thousands — run during normal operations.
--
-- EXPECTED OUTCOME
--   After running, Postgres logs should stop showing the "column user_id
--   does not exist" error. Withdrawal audit trail starts populating
--   with proper user_id linkage.
--

BEGIN;

ALTER TABLE execution_log ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_execution_log_user_id
    ON execution_log (user_id)
    WHERE user_id IS NOT NULL;

COMMIT;

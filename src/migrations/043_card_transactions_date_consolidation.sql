-- Migration 043 — card_transactions.date consolidation
--
-- Two timestamp columns historically coexisted on card_transactions:
--   created_at — when WE inserted the row (audit/insertion timestamp)
--   date       — when the transaction OCCURRED on the card network
--                (mapped from SD3 webhook occurredAt; semantically what
--                 the user thinks of as "when did this transaction happen")
--
-- They serve distinct purposes — this migration does NOT collapse them.
-- Instead it closes the silent-data-loss bug introduced by inserts that
-- only set created_at, leaving date NULL.
--
-- Pre-S34 inserts in nuro-routes.ts:1424 and monitor.ts:607 set only
-- created_at. Analytics queries in nuro-routes.ts:4226–4355 filter
-- `WHERE date >= NOW() - INTERVAL ...`, and a NULL `date` fails that
-- predicate — so user-initiated POST /transactions rows and agent-sweep
-- bridge-deposit rows were being silently dropped from 24h / 7d / 12mo
-- spend totals.
--
-- This migration:
--   1. Backfills NULL date with created_at. Sensible default because for
--      those code paths occurrence ≈ insertion (user-initiated /
--      monitor-detected, both effectively "now" at the moment of insert).
--   2. Sets DEFAULT now() so any future insert path that omits date
--      still populates it correctly without re-introducing NULLs.
--
-- NOT NULL is intentionally NOT added in this migration — left as a
-- follow-up once one full observation window (~7 days) confirms no
-- insert path is producing NULL dates. After 2026-05-03, run:
--     ALTER TABLE card_transactions ALTER COLUMN date SET NOT NULL;
--
-- Companion code edits land in the same commit:
--   - src/nuro-routes.ts:1424   INSERT now sets date explicitly
--   - src/monitor.ts:607        INSERT now sets date explicitly

UPDATE card_transactions SET date = created_at WHERE date IS NULL;

ALTER TABLE card_transactions ALTER COLUMN date SET DEFAULT now();

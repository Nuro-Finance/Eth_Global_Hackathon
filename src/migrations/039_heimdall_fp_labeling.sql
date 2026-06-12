-- ─────────────────────────────────────────────────────────────────────────────
-- 039 — Heimdall events: per-rule false-positive labeling (S32)
--
-- Lets the operator mark a heimdall_events row as a false positive directly
-- from the admin UI. This feeds rule-sensitivity tuning: per-rule FP rate
-- (last 30d) becomes the signal we use to decide whether/when to flip a
-- rule from observe → enforce.
--
-- Foundation for the self-learning loop. Today the operator labels by
-- hand; future Muninn (memory-curator sub-agent) consumes the FP labels
-- + the surrounding context to propose rule-tuning patches.
--
-- Schema additions:
--   false_positive  — boolean. NULL = unlabeled (default), true = FP,
--                     false = confirmed real-positive. Three-state by
--                     intent: most events go unlabeled.
--   fp_marked_by    — operator id ('richard' / 'mythos' / etc.). Audit
--                     trail; not constrained to a FK because operators
--                     aren't a first-class table yet.
--   fp_marked_at    — when the label was applied. Lets us detect
--                     re-labels (toggle history would be a future table).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE heimdall_events
  ADD COLUMN IF NOT EXISTS false_positive BOOLEAN,
  ADD COLUMN IF NOT EXISTS fp_marked_by   TEXT,
  ADD COLUMN IF NOT EXISTS fp_marked_at   TIMESTAMPTZ;

-- Per-rule FP-rate query benefits from a partial index on labeled rows.
-- (Most rows stay NULL — partial index keeps the index small.)
CREATE INDEX IF NOT EXISTS idx_heimdall_events_fp_labeled
  ON heimdall_events (rule_id, occurred_at DESC)
  WHERE false_positive IS NOT NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 038 — Agent reputation (predictions + outcomes + scoring with TEETH)
--
-- S31 H2. Per Nuro "reputation that has teeth" — the missing feedback
-- loop. Today agents.risk_limit is a static number a human sets. With
-- this schema, predictions get recorded → outcomes get scored → reputation
-- accumulates → risk_limit auto-adjusts (tighten on bad calls, loosen on
-- good).
--
-- Key tables:
-- agent_predictions — every prediction recorded, with horizon for scoring
-- agent_reputation — per-agent rollup: count, avg score, tier
--
-- "Correct" definition is type-specific. v1 prediction types have
-- crystal-clear outcomes:
-- vault-survival → vault still 'approved' after horizon? +1 / -1
-- market-resolution → prediction matched the resolution? +1 / -1
-- tx-success → broadcast succeeded? +1 / -1
-- Fuzzy types (yield-prediction, drift-detection) come in v2 with
-- partial-credit scoring. Schema supports the partial via NUMERIC `score`.
--
-- Reputation tiers + risk_limit multipliers:
-- novice (< 10 preds OR avg < 0) → 1.0× (default)
-- trusted (≥ 10 preds, avg ≥ 0.4) → 2.0×
-- expert (≥ 30 preds, avg ≥ 0.7) → 5.0×
-- penalized (avg < -0.3 over rolling 30) → 0.5× (HARD reduce)
--
-- The risk_limit auto-adjust is a CRON-driven update (separate cron from
-- the compound detector); ships in the follow-up commit alongside the
-- adjustment cron + Nuro POV dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS agent_predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        VARCHAR(128) NOT NULL,
 -- Type drives outcome resolver. v1 types: vault-survival, market-
 -- resolution, tx-success. v2 adds yield-prediction + drift-detection.
    prediction_type VARCHAR(64) NOT NULL,
 -- The thing being predicted about. e.g. vault_id, market_id, tx_hash,
 -- or composite "vault_id:risk-blowup-90d". Type-specific format.
    prediction_subject TEXT NOT NULL,
 -- The structured prediction. Format depends on type. Example for
 -- vault-survival: { willSurvive: true, horizonDays: 90 }. For
 -- market-resolution: { side: 'YES' }.
    prediction      JSONB NOT NULL,
 -- 0.0 to 1.0 — agent's stated confidence. Used to weight scoring
 -- (high-confidence wrong calls hurt more; low-confidence wrong calls
 -- are softer).
    confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.5
                    CHECK (confidence >= 0 AND confidence <= 1),
 -- Free-form reasoning at prediction time. Becomes evals corpus later
 -- (Marathon 8 Phase 2 — Huginn / Muninn LoRA training).
    reasoning       TEXT,
 -- Number of days from predicted_at after which this should be scorable.
 -- The scoring cron looks for predictions where now > predicted_at +
 -- horizon AND outcome_observed_at IS NULL.
    horizon_days    INTEGER NOT NULL DEFAULT 7
                    CHECK (horizon_days > 0),
    predicted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
 -- Outcome fields populated by the scoring cron (or recordOutcome API).
    outcome         JSONB,
    outcome_observed_at TIMESTAMPTZ,
 -- Boolean correct/wrong for clear-cut types. NULL until scored.
    correct         BOOLEAN,
 -- Numeric score: -1.0 (most wrong) to +1.0 (most right). Allows
 -- partial credit for fuzzy outcomes. NULL until scored. We weight
 -- by confidence: a 0.95-confidence wrong call lands a more negative
 -- score than a 0.6-confidence wrong call.
    score           NUMERIC(5,3) CHECK (score IS NULL OR (score >= -1 AND score <= 1)),
 -- For audit: who/what scored this (cron source label).
    scored_by       VARCHAR(64),
 -- Optional: tied to a security event that contradicted (or confirmed)
 -- the prediction. Useful forensic linkage.
    related_event_id UUID
);

CREATE INDEX IF NOT EXISTS idx_agent_predictions_agent_time
    ON agent_predictions(agent_id, predicted_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_predictions_unscored_due
    ON agent_predictions(predicted_at, horizon_days)
    WHERE outcome_observed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_predictions_subject
    ON agent_predictions(prediction_type, prediction_subject);

-- Per-agent rollup, refreshed by the scoring cron after each pass.
CREATE TABLE IF NOT EXISTS agent_reputation (
    agent_id        VARCHAR(128) PRIMARY KEY,
    predictions_count_total INTEGER NOT NULL DEFAULT 0,
    predictions_count_30d   INTEGER NOT NULL DEFAULT 0,
    correct_count_total     INTEGER NOT NULL DEFAULT 0,
    correct_count_30d       INTEGER NOT NULL DEFAULT 0,
    score_sum_total         NUMERIC(10,3) NOT NULL DEFAULT 0,
    score_avg_total         NUMERIC(5,3) NOT NULL DEFAULT 0,
    score_avg_30d           NUMERIC(5,3) NOT NULL DEFAULT 0,
 -- Tier drives the risk_limit multiplier. Computed from count + avg.
    reputation_tier         VARCHAR(16) NOT NULL DEFAULT 'novice'
                            CHECK (reputation_tier IN ('novice', 'trusted', 'expert', 'penalized')),
    risk_limit_multiplier   NUMERIC(4,2) NOT NULL DEFAULT 1.00,
 -- Tracks when the cron last refreshed this row.
    last_recomputed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drift-detection: weekly score deltas. Lets us detect agents whose
-- reputation is sliding (was trusted, now novice again — needs review).
CREATE TABLE IF NOT EXISTS agent_reputation_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        VARCHAR(128) NOT NULL,
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    predictions_count_total INTEGER NOT NULL,
    correct_count_total     INTEGER NOT NULL,
    score_avg_total         NUMERIC(5,3) NOT NULL,
    reputation_tier         VARCHAR(16) NOT NULL,
    risk_limit_multiplier   NUMERIC(4,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_reputation_history_agent_time
    ON agent_reputation_history(agent_id, snapshot_at DESC);

COMMIT;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT REPUTATION — predictions + outcomes + tier-driven risk_limit teeth
//
// S31 H2. Per Mythos's "reputation that has teeth" — the missing feedback
// loop. Predictions land here at decision time; outcomes get scored when
// the horizon passes; reputation accumulates; risk_limit auto-adjusts.
//
// Public API:
//   recordPrediction({ agentId, type, subject, prediction, confidence,
//                      reasoning, horizonDays }) → predictionId
//   recordOutcome({ predictionId, outcome, correct, score, scoredBy })
//   getReputationSnapshot(agentId) → { rep, recentPredictions, history }
//   recomputeAllReputations() — cron entry point
//
// Cron flow (runs daily):
//   1. Score due predictions (now() > predicted_at + horizon AND
//      outcome_observed_at IS NULL).
//   2. For each scored prediction, write outcome via recordOutcome.
//   3. Recompute agent_reputation rollups for agents who had any
//      prediction scored this cycle.
//   4. Apply tier transitions + risk_limit_multiplier updates.
//   5. Snapshot to agent_reputation_history.
//
// First customer (this commit): HL vault audit predictions. When a vault
// is inserted into hl_vaults as 'pending' by Mythos, we record a
// 'vault-survival' prediction. The horizon is 90 days; at horizon, we
// score: vault still 'approved' = correct, paused/quarantined = wrong.

import type { Pool } from 'pg'

// ── Types ───────────────────────────────────────────────────────────────────

export type PredictionType = 'vault-survival' | 'market-resolution' | 'tx-success' | string
export type ReputationTier = 'novice' | 'trusted' | 'expert' | 'penalized'

export interface RecordPredictionInput {
  agentId: string
  type: PredictionType
  subject: string
  prediction: Record<string, unknown>
  confidence?: number  // 0..1; defaults to 0.5
  reasoning?: string | null
  horizonDays?: number  // defaults to 7
}

export interface RecordOutcomeInput {
  predictionId: string
  outcome: Record<string, unknown>
  correct: boolean
  /** Optional partial-credit score in [-1, +1]. If omitted, derived from
   *  correct (true → +1 × confidence; false → -1 × confidence). */
  score?: number
  scoredBy?: string  // 'cron-vault-survival' / 'manual-admin' / etc.
  relatedEventId?: string | null
}

export interface ReputationSnapshot {
  agentId: string
  rep: {
    predictionsCountTotal: number
    correctCountTotal: number
    scoreAvgTotal: number
    scoreAvg30d: number
    tier: ReputationTier
    riskLimitMultiplier: number
    lastRecomputedAt: string
  } | null
  recentPredictions: Array<{
    id: string
    type: string
    subject: string
    confidence: number
    predictedAt: string
    horizonDays: number
    correct: boolean | null
    score: number | null
    outcomeObservedAt: string | null
  }>
  history: Array<{
    snapshotAt: string
    predictionsCountTotal: number
    correctCountTotal: number
    scoreAvgTotal: number
    tier: ReputationTier
    riskLimitMultiplier: number
  }>
}

// ── Record APIs ─────────────────────────────────────────────────────────────

export async function recordPrediction(
  db: Pool,
  input: RecordPredictionInput,
): Promise<{ predictionId: string }> {
  const confidence = clamp01(input.confidence ?? 0.5)
  const horizon = Math.max(1, Math.floor(input.horizonDays ?? 7))
  const r = await db.query(
    `INSERT INTO agent_predictions
       (agent_id, prediction_type, prediction_subject, prediction,
        confidence, reasoning, horizon_days)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     RETURNING id`,
    [
      input.agentId,
      input.type,
      input.subject.slice(0, 500),
      JSON.stringify(input.prediction),
      confidence,
      input.reasoning ?? null,
      horizon,
    ],
  )
  return { predictionId: r.rows[0].id }
}

// ── Counsel-on-action wrapper (S32) ─────────────────────────────────────────

export interface RecordPredictionWithCounselInput extends RecordPredictionInput {
  /** Optional USD value of the action this prediction relates to. Helps
   *  Huginn's budget/cap rules score the proposal. */
  counselValueUsd?: number | null
  /** Optional chain context. */
  counselChainId?: number | null
  /** Optional action-type for Huginn's rule bank. Defaults to
   *  'agent-prediction' if omitted. */
  counselActionType?: string
}

/**
 * Record a prediction AFTER getting Huginn's counsel on it. The verdict is
 * attached to the prediction's metadata so it's visible at scoring time
 * + in the admin UI. Logs a HELM-CTRL event via huginn.counsel() so the
 * Mythos POV "recent counsel" panel surfaces the verdict in real-time.
 *
 * Self-counseling guard: if the proposer IS huginn, we skip the counsel
 * call (would recurse infinitely — Huginn already runs counsel inline
 * inside its own counsel() function for self-prediction).
 *
 * Counsel-failure guard: if huginn.counsel() throws, the prediction
 * still records (just without the counsel metadata). We never block
 * Mythos's reasoning on Huginn being unavailable.
 *
 * Returns the prediction id AND the counsel result so the caller can
 * decide whether to proceed with the action (e.g. abort on
 * verdict='block-recommend' + Huginn enforce-mode).
 */
export async function recordPredictionWithCounsel(
  db: Pool,
  input: RecordPredictionWithCounselInput,
): Promise<{
  predictionId: string
  counsel: import('./huginn').CounselResult | null
}> {
  let counsel: import('./huginn').CounselResult | null = null
  if (input.agentId !== 'huginn') {
    try {
      const { counsel: counselFn } = await import('./huginn')
      counsel = await counselFn(db, {
        proposerAgentId: input.agentId,
        actionType: input.counselActionType ?? 'agent-prediction',
        actionSubject: input.subject,
        valueUsd: input.counselValueUsd ?? null,
        chainId: input.counselChainId ?? null,
        reasoning: input.reasoning ?? null,
        metadata: {
          predictionType: input.type,
          ...(input.prediction || {}),
        },
      })
    } catch (err: any) {
      console.warn(
        `[reputation] counsel-on-action failed for ${input.agentId}: ${err?.message?.slice(0, 100)}`,
      )
    }
  }

  // Attach Huginn's verdict to prediction metadata. Visible to scorers +
  // admin-UI consumers, audit-traceable, and ties this prediction back
  // to the counsel-outcome prediction Huginn recorded for itself.
  const enrichedPrediction = counsel
    ? {
        ...(input.prediction || {}),
        _huginn_counsel: {
          verdict: counsel.verdict,
          confidence: Math.round(counsel.confidence * 100) / 100,
          signals_count: counsel.signals.length,
          counsel_prediction_id: counsel.predictionId,
        },
      }
    : input.prediction

  const { predictionId } = await recordPrediction(db, {
    ...input,
    prediction: enrichedPrediction,
  })

  return { predictionId, counsel }
}

export async function recordOutcome(db: Pool, input: RecordOutcomeInput): Promise<void> {
  // Default score: +confidence if correct, -confidence if wrong.
  // Caller can pass explicit score for partial-credit fuzzy outcomes.
  let scoreToWrite: number
  if (typeof input.score === 'number' && Number.isFinite(input.score)) {
    scoreToWrite = clampPM1(input.score)
  } else {
    // Need confidence for default scoring.
    const r = await db.query(
      `SELECT confidence::text FROM agent_predictions WHERE id = $1`,
      [input.predictionId],
    )
    const conf = Number(r.rows[0]?.confidence ?? 0.5)
    scoreToWrite = input.correct ? conf : -conf
  }

  await db.query(
    `UPDATE agent_predictions
     SET outcome = $1::jsonb,
         outcome_observed_at = now(),
         correct = $2,
         score = $3,
         scored_by = $4,
         related_event_id = $5
     WHERE id = $6`,
    [
      JSON.stringify(input.outcome),
      input.correct,
      scoreToWrite,
      input.scoredBy ?? 'manual',
      input.relatedEventId ?? null,
      input.predictionId,
    ],
  )
}

// ── Reputation rollup ───────────────────────────────────────────────────────

export async function recomputeReputation(db: Pool, agentId: string): Promise<{
  tier: ReputationTier
  multiplier: number
  predictionsCount: number
  correctCount: number
  avgScore: number
}> {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE outcome_observed_at IS NOT NULL) AS pred_total,
       COUNT(*) FILTER (WHERE outcome_observed_at IS NOT NULL
                          AND outcome_observed_at >= now() - interval '30 days') AS pred_30d,
       COUNT(*) FILTER (WHERE correct = true) AS correct_total,
       COUNT(*) FILTER (WHERE correct = true
                          AND outcome_observed_at >= now() - interval '30 days') AS correct_30d,
       COALESCE(SUM(score), 0)::text AS score_sum,
       COALESCE(AVG(score), 0)::text AS score_avg_total,
       COALESCE(AVG(score) FILTER (WHERE outcome_observed_at >= now() - interval '30 days'), 0)::text AS score_avg_30d
     FROM agent_predictions
     WHERE agent_id = $1`,
    [agentId],
  )
  const row = r.rows[0] || {}
  const predTotal = Number(row.pred_total) || 0
  const pred30d = Number(row.pred_30d) || 0
  const correctTotal = Number(row.correct_total) || 0
  const correct30d = Number(row.correct_30d) || 0
  const scoreSum = Number(row.score_sum) || 0
  const scoreAvgTotal = Number(row.score_avg_total) || 0
  const scoreAvg30d = Number(row.score_avg_30d) || 0

  const tier = decideTier(predTotal, scoreAvgTotal, scoreAvg30d)
  const multiplier = tierMultiplier(tier)

  await db.query(
    `INSERT INTO agent_reputation
       (agent_id, predictions_count_total, predictions_count_30d,
        correct_count_total, correct_count_30d,
        score_sum_total, score_avg_total, score_avg_30d,
        reputation_tier, risk_limit_multiplier, last_recomputed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (agent_id) DO UPDATE
       SET predictions_count_total = EXCLUDED.predictions_count_total,
           predictions_count_30d = EXCLUDED.predictions_count_30d,
           correct_count_total = EXCLUDED.correct_count_total,
           correct_count_30d = EXCLUDED.correct_count_30d,
           score_sum_total = EXCLUDED.score_sum_total,
           score_avg_total = EXCLUDED.score_avg_total,
           score_avg_30d = EXCLUDED.score_avg_30d,
           reputation_tier = EXCLUDED.reputation_tier,
           risk_limit_multiplier = EXCLUDED.risk_limit_multiplier,
           last_recomputed_at = now()`,
    [agentId, predTotal, pred30d, correctTotal, correct30d, scoreSum, scoreAvgTotal, scoreAvg30d, tier, multiplier],
  )

  // History snapshot — daily granularity max (skip insert if already
  // snapshotted within last 23h).
  await db.query(
    `INSERT INTO agent_reputation_history
       (agent_id, predictions_count_total, correct_count_total,
        score_avg_total, reputation_tier, risk_limit_multiplier)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM agent_reputation_history
       WHERE agent_id = $1 AND snapshot_at >= now() - interval '23 hours'
     )`,
    [agentId, predTotal, correctTotal, scoreAvgTotal, tier, multiplier],
  )

  return {
    tier,
    multiplier,
    predictionsCount: predTotal,
    correctCount: correctTotal,
    avgScore: scoreAvgTotal,
  }
}

function decideTier(predCount: number, avgTotal: number, avg30d: number): ReputationTier {
  // Hard penalty: recent 30d trending bad → drop tier regardless of history.
  if (predCount >= 5 && avg30d < -0.3) return 'penalized'
  if (predCount < 10 || avgTotal < 0) return 'novice'
  if (predCount >= 30 && avgTotal >= 0.7) return 'expert'
  if (avgTotal >= 0.4) return 'trusted'
  return 'novice'
}

function tierMultiplier(t: ReputationTier): number {
  switch (t) {
    case 'expert':    return 5.0
    case 'trusted':   return 2.0
    case 'novice':    return 1.0
    case 'penalized': return 0.5
  }
}

// ── Cron entry: score due predictions + recompute everyone ─────────────────

/**
 * Per-type outcome resolvers. Given a prediction row, return:
 *   - { ready: false } if outcome can't be observed yet (cron skips)
 *   - { ready: true, correct: bool, outcome: {...}, score?: number }
 *
 * Each resolver knows how to peek at the relevant external state
 * (hl_vaults, markets, transactions) to decide.
 */
const RESOLVERS: Record<string, (db: Pool, row: any) => Promise<
  { ready: false } | { ready: true; correct: boolean; outcome: Record<string, unknown>; score?: number }
>> = {
  'vault-survival': async (db, row) => {
    // Subject is the hl_vaults.id. Outcome at horizon: is the vault still
    // 'approved'? paused or deprecated → we predicted survival incorrectly.
    const r = await db.query(
      `SELECT audit_status FROM hl_vaults WHERE id = $1`,
      [row.prediction_subject],
    )
    if (r.rows.length === 0) {
      // Vault row deleted entirely — treat as wrong (it didn't survive).
      return {
        ready: true,
        correct: false,
        outcome: { vaultStatus: 'missing' },
      }
    }
    const status = r.rows[0].audit_status as string
    const survived = status === 'approved' || status === 'pending'
    return {
      ready: true,
      correct: survived,
      outcome: { vaultStatus: status },
    }
  },
  'tx-success': async (db, row) => {
    // Subject is the tx hash. Look in execution_log; if status='confirmed'
    // → correct; if 'failed' → wrong; if not yet known → not ready.
    const r = await db.query(
      `SELECT status FROM execution_log
       WHERE tx_hash = $1
       ORDER BY created_at DESC LIMIT 1`,
      [row.prediction_subject],
    )
    if (r.rows.length === 0) return { ready: false }
    const status = r.rows[0].status as string
    if (status === 'confirmed') {
      return { ready: true, correct: true, outcome: { status } }
    }
    if (status === 'failed' || status === 'reverted') {
      return { ready: true, correct: false, outcome: { status } }
    }
    return { ready: false }
  },
  // Future: 'market-resolution', 'yield-prediction', 'drift-detection'.
}

export interface ReputationCycleResult {
  duePredictions: number
  scoredPredictions: number
  agentsRecomputed: number
  durationMs: number
}

export async function runReputationCycle(db: Pool): Promise<ReputationCycleResult> {
  const start = Date.now()
  const result: ReputationCycleResult = {
    duePredictions: 0,
    scoredPredictions: 0,
    agentsRecomputed: 0,
    durationMs: 0,
  }

  // Find unsorted predictions whose horizon has passed.
  const due = await db.query(
    `SELECT id, agent_id, prediction_type, prediction_subject,
            prediction, confidence::text
     FROM agent_predictions
     WHERE outcome_observed_at IS NULL
       AND now() > predicted_at + (horizon_days || ' days')::interval
     ORDER BY predicted_at ASC
     LIMIT 200`,
  )
  result.duePredictions = due.rows.length

  const touchedAgents = new Set<string>()
  for (const row of due.rows) {
    const resolver = RESOLVERS[row.prediction_type]
    if (!resolver) continue // unknown type — leave for a later (more capable) cron
    try {
      const verdict = await resolver(db, row)
      if (!verdict.ready) continue
      await recordOutcome(db, {
        predictionId: row.id,
        outcome: verdict.outcome,
        correct: verdict.correct,
        score: verdict.score,
        scoredBy: `cron-${row.prediction_type}`,
      })
      touchedAgents.add(row.agent_id)
      result.scoredPredictions++
    } catch (err: any) {
      console.warn(
        `[reputation] resolve failed for ${row.id} (${row.prediction_type}): ${err?.message?.slice(0, 100)}`,
      )
    }
  }

  for (const agentId of touchedAgents) {
    try {
      const rep = await recomputeReputation(db, agentId)
      result.agentsRecomputed++
      // S31 H2: auto-apply the multiplier to agents.risk_limit. The base
      // (DB) authority comes from agent_budgets.usd_authority for 'weekly'
      // period if present; falls back to the original agents.risk_limit
      // (read once + cached on first apply via base_risk_limit_usd column
      // which we add lazily here).
      await applyReputationToRiskLimit(db, agentId, rep.multiplier)
    } catch (err: any) {
      console.warn(
        `[reputation] recompute failed for ${agentId}: ${err?.message?.slice(0, 100)}`,
      )
    }
  }

  result.durationMs = Date.now() - start
  if (result.duePredictions > 0 || result.agentsRecomputed > 0) {
    console.log(
      `[reputation] cycle complete in ${result.durationMs}ms — ` +
        `due=${result.duePredictions} scored=${result.scoredPredictions} ` +
        `agents=${result.agentsRecomputed}`,
    )
  }
  return result
}

// ── Read API ────────────────────────────────────────────────────────────────

export async function getReputationSnapshot(
  db: Pool,
  agentId: string,
  recentLimit = 25,
  historyLimit = 30,
): Promise<ReputationSnapshot> {
  const [repRes, predRes, histRes] = await Promise.all([
    db.query(
      `SELECT predictions_count_total, correct_count_total,
              score_avg_total::text, score_avg_30d::text,
              reputation_tier, risk_limit_multiplier::text, last_recomputed_at
       FROM agent_reputation WHERE agent_id = $1`,
      [agentId],
    ),
    db.query(
      `SELECT id, prediction_type, prediction_subject, confidence::text,
              predicted_at, horizon_days, correct, score::text,
              outcome_observed_at
       FROM agent_predictions
       WHERE agent_id = $1
       ORDER BY predicted_at DESC
       LIMIT $2`,
      [agentId, Math.min(Math.max(recentLimit, 1), 100)],
    ),
    db.query(
      `SELECT snapshot_at, predictions_count_total, correct_count_total,
              score_avg_total::text, reputation_tier, risk_limit_multiplier::text
       FROM agent_reputation_history
       WHERE agent_id = $1
       ORDER BY snapshot_at DESC
       LIMIT $2`,
      [agentId, Math.min(Math.max(historyLimit, 1), 365)],
    ),
  ])

  return {
    agentId,
    rep: repRes.rows[0]
      ? {
          predictionsCountTotal: Number(repRes.rows[0].predictions_count_total) || 0,
          correctCountTotal: Number(repRes.rows[0].correct_count_total) || 0,
          scoreAvgTotal: Number(repRes.rows[0].score_avg_total) || 0,
          scoreAvg30d: Number(repRes.rows[0].score_avg_30d) || 0,
          tier: repRes.rows[0].reputation_tier as ReputationTier,
          riskLimitMultiplier: Number(repRes.rows[0].risk_limit_multiplier) || 1,
          lastRecomputedAt: repRes.rows[0].last_recomputed_at,
        }
      : null,
    recentPredictions: predRes.rows.map((r: any) => ({
      id: r.id,
      type: r.prediction_type,
      subject: r.prediction_subject,
      confidence: Number(r.confidence) || 0,
      predictedAt: r.predicted_at,
      horizonDays: r.horizon_days,
      correct: r.correct,
      score: r.score != null ? Number(r.score) : null,
      outcomeObservedAt: r.outcome_observed_at,
    })),
    history: histRes.rows.map((r: any) => ({
      snapshotAt: r.snapshot_at,
      predictionsCountTotal: Number(r.predictions_count_total) || 0,
      correctCountTotal: Number(r.correct_count_total) || 0,
      scoreAvgTotal: Number(r.score_avg_total) || 0,
      tier: r.reputation_tier as ReputationTier,
      riskLimitMultiplier: Number(r.risk_limit_multiplier) || 1,
    })),
  }
}

// ── Risk-limit auto-apply ───────────────────────────────────────────────────
//
// Applies a reputation multiplier to the agent's risk_limit. Strategy:
//   - On first application, snapshot the CURRENT risk_limit as
//     base_risk_limit_usd (a new metadata column we add lazily — UPDATE
//     is a no-op if the column already exists).
//   - Effective risk_limit = base × multiplier (clamped to a sane range
//     so a wild bug can't grant unbounded authority).
//
// Range clamps:
//   floor: $25 (even penalized agents need SOME authority for routine ops)
//   ceiling: 100× the original base (prevents runaway compounding if
//            multiplier ever exceeds expectation)

async function applyReputationToRiskLimit(
  db: Pool,
  agentId: string,
  multiplier: number,
): Promise<void> {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return

  // Lazy schema addition. This is a single ALTER per VPS; idempotent.
  // Skipped silently if the column already exists.
  try {
    await db.query(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS base_risk_limit_usd NUMERIC(12,2);
    `)
  } catch {
    /* race-safe noop */
  }

  // Read current state. If base wasn't snapshotted yet, snapshot the
  // current risk_limit as base. Then compute effective.
  const r = await db.query(
    `SELECT risk_limit::text, base_risk_limit_usd::text
     FROM agents WHERE id = $1`,
    [agentId],
  )
  if (r.rows.length === 0) return
  const cur = Number(r.rows[0].risk_limit) || 0
  const baseStored = r.rows[0].base_risk_limit_usd
  const base = baseStored != null ? Number(baseStored) : cur
  if (!(base > 0)) return

  const effective = Math.max(25, Math.min(base * 100, base * multiplier))

  // Only write if different to avoid churn.
  if (Math.abs(effective - cur) < 0.005) {
    if (baseStored == null) {
      // Still snapshot base on first pass.
      await db.query(
        `UPDATE agents SET base_risk_limit_usd = $1 WHERE id = $2 AND base_risk_limit_usd IS NULL`,
        [base, agentId],
      ).catch(() => undefined)
    }
    return
  }

  await db.query(
    `UPDATE agents
     SET risk_limit = $1,
         base_risk_limit_usd = COALESCE(base_risk_limit_usd, $2)
     WHERE id = $3`,
    [effective, base, agentId],
  ).catch(() => undefined)

  // Audit trail event so admins see the move in the Helm log.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logHelmEvent } = require('./helm')
    await logHelmEvent({
      ruleId: 'HELM-CTRL',
      subject: `risk_limit auto-adjusted: ${agentId} ${cur} → ${effective.toFixed(2)} (×${multiplier})`,
      agentId,
      context: {
        kind: 'reputation-multiplier-apply',
        previousRiskLimit: cur,
        newRiskLimit: effective,
        baseRiskLimit: base,
        multiplier,
      },
      actionOverride: 'log-only',
    })
  } catch {
    /* skip */
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}
function clampPM1(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

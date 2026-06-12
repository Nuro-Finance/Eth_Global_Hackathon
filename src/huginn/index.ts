// ─────────────────────────────────────────────────────────────────────────────
// HUGINN — wise-advisor sub-agent (proto-Huginn)
//
// S31 H2. Per Nuro "should I?" gate + Marathon 8 / Corvus dissent
// archetype. Provides counsel before high-stakes actions; observe-only
// in v1 (publishes verdicts, records predictions, doesn't enforce).
//
// Two modes:
// - Pull: huginn.counsel({ ... }) returns synchronous verdict
// - Push: huginn subscribes to bus topics, publishes counsel as
// messages other agents/humans can read
//
// v1 reasoning is rule-based (deterministic). v2 (Marathon 8 Phase 2)
// adds an LLM dissent layer ON TOP via H100. Rule floor stays.
//
// Reputation: every counsel records a 'counsel-outcome' prediction.
// Scored later by the reputation cron when the underlying action
// resolves. Builds Huginn's tier over time → counsel-weight in Nuro
// decision pipeline.

import type { Pool } from 'pg'

// ── Types ───────────────────────────────────────────────────────────────────

export type CounselVerdict = 'endorse' | 'caution' | 'dissent' | 'block-recommend'

export interface CounselInput {
 /** Who's asking. e.g. 'Nuro, 'execution-dispatch'. */
  proposerAgentId: string
 /** What kind of action. 'on-chain-tx' / 'agent-action' / 'doc-publish' / 'vault-list' / etc. */
  actionType: string
 /** Stable id for the proposed action. Used to tie counsel → outcome later. */
  actionSubject: string
 /** USD value of the action, when applicable. Some actions are non-financial. */
  valueUsd?: number | null
 /** Chain context, when applicable. */
  chainId?: number | null
 /** Free-form description from the proposer. Becomes context for the rules. */
  reasoning?: string | null
 /** Optional metadata that some rules consult (e.g. recent-similar-action results). */
  metadata?: Record<string, unknown>
}

export interface CounselSignal {
  rule: string                // canonical rule id, e.g. 'budget-proximity', 'rep-tier-penalized'
  severity: 'info' | 'caution' | 'dissent' | 'block'
  detail: string              // human-readable signal description
}

export interface CounselResult {
  verdict: CounselVerdict
 /** 0..1 confidence in the verdict. High = strong signal, low = noisy. */
  confidence: number
  signals: CounselSignal[]
  reasoning: string
  recommendedAlternative?: string
 /** Prediction id recorded for this counsel. Used by reputation scorer
 * to grade Huginn later. */
  predictionId: string | null
}

// ── Mode plumbing ───────────────────────────────────────────────────────────

let _runtimeEnforceOverride: boolean | null = null

export function setHuginnEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

export function getHuginnMode(): { mode: 'enforce' | 'observe'; source: 'runtime-override' | 'env' } {
  if (_runtimeEnforceOverride !== null) {
    return { mode: _runtimeEnforceOverride ? 'enforce' : 'observe', source: 'runtime-override' }
  }
  return {
    mode: process.env.HUGINN_ENFORCE_DISSENTS === 'on' ? 'enforce' : 'observe',
    source: 'env',
  }
}

// ── Rule bank ───────────────────────────────────────────────────────────────

interface RuleContext {
  db: Pool
  input: CounselInput
}

type Rule = (ctx: RuleContext) => Promise<CounselSignal | null>

// Rule 1: budget proximity — does the proposer have authority for this action?
const ruleBudgetProximity: Rule = async ({ db, input }) => {
  if (!input.valueUsd || input.valueUsd <= 0) return null
  try {
    const r = await db.query(
      `SELECT usd_remaining::text, usd_authority::text
       FROM agent_budgets
       WHERE agent_id = $1 AND period = 'weekly' AND active = true
       LIMIT 1`,
      [input.proposerAgentId],
    )
    if (r.rows.length === 0) return null
    const remaining = Number(r.rows[0].usd_remaining)
    const authority = Number(r.rows[0].usd_authority)
    if (!Number.isFinite(remaining) || authority <= 0) return null

    const remainingPct = remaining / authority
    const usagePct = input.valueUsd / authority

    if (input.valueUsd > remaining) {
      return {
        rule: 'budget-exceeded',
        severity: 'block',
        detail: `valueUsd $${input.valueUsd} > remaining $${remaining} (authority $${authority})`,
      }
    }
    if (remainingPct < 0.05) {
      return {
        rule: 'budget-near-zero',
        severity: 'dissent',
        detail: `${(remainingPct * 100).toFixed(1)}% weekly authority remaining`,
      }
    }
    if (remainingPct < 0.20) {
      return {
        rule: 'budget-low',
        severity: 'caution',
        detail: `${(remainingPct * 100).toFixed(1)}% weekly authority remaining`,
      }
    }
    if (usagePct > 0.5) {
      return {
        rule: 'large-single-action',
        severity: 'caution',
        detail: `single action consumes ${(usagePct * 100).toFixed(0)}% of weekly authority`,
      }
    }
    return null
  } catch {
    return null
  }
}

// Rule 2: reputation tier — proposer's current standing.
const ruleReputationTier: Rule = async ({ db, input }) => {
  try {
    const r = await db.query(
      `SELECT reputation_tier, score_avg_30d::text, predictions_count_total
       FROM agent_reputation
       WHERE agent_id = $1`,
      [input.proposerAgentId],
    )
    if (r.rows.length === 0) return null
    const tier = r.rows[0].reputation_tier as string
    const avg30d = Number(r.rows[0].score_avg_30d) || 0
    const count = Number(r.rows[0].predictions_count_total) || 0

    if (tier === 'penalized') {
      return {
        rule: 'rep-tier-penalized',
        severity: 'dissent',
        detail: `proposer is in 'penalized' reputation tier (avg 30d = ${avg30d.toFixed(2)})`,
      }
    }
    if (tier === 'novice' && count >= 5 && avg30d < -0.1) {
      return {
        rule: 'rep-trending-bad',
        severity: 'caution',
        detail: `novice with negative recent trend (avg 30d = ${avg30d.toFixed(2)})`,
      }
    }
    return null
  } catch {
    return null
  }
}

// Rule 3: agent security state gate.
const ruleAgentStateGate: Rule = async ({ db, input }) => {
  try {
    const r = await db.query(
      `SELECT heimdall_state, heimdall_state_reason
       FROM agents
       WHERE id = $1`,
      [input.proposerAgentId],
    )
    if (r.rows.length === 0) return null
    const state = r.rows[0].heimdall_state as string
    const reason = r.rows[0].heimdall_state_reason as string | null

    if (state === 'quarantined') {
      return {
        rule: 'agent-quarantined',
        severity: 'block',
        detail: `proposer is QUARANTINED${reason ? `: ${reason}` : ''}`,
      }
    }
    if (state === 'paused') {
      return {
        rule: 'agent-paused',
        severity: 'block',
        detail: `proposer is PAUSED${reason ? `: ${reason}` : ''}`,
      }
    }
    if (state === 'watch') {
      return {
        rule: 'agent-watch',
        severity: 'caution',
        detail: `proposer is in WATCH state${reason ? `: ${reason}` : ''}`,
      }
    }
    return null
  } catch {
    return null
  }
}

// Rule 4: tx-cap proximity — action value vs. effective tx-cap cap.
const ruleCapProximity: Rule = async ({ db, input }) => {
  if (!input.valueUsd || input.valueUsd <= 0) return null
  try {
    const { getEffectiveUsdCap } = await import('../budgets')
    const envCap = Number(process.env.HELM_TX_CAP_USD_DEFAULT) || 5000
    const cap = await getEffectiveUsdCap(db, input.proposerAgentId, envCap)
    if (input.valueUsd >= cap.capUsd) {
      return {
        rule: 'cap-exceeded',
        severity: 'block',
        detail: `valueUsd $${input.valueUsd} ≥ effective cap $${cap.capUsd} (source: ${cap.source})`,
      }
    }
    if (input.valueUsd >= 0.8 * cap.capUsd) {
      return {
        rule: 'cap-proximity',
        severity: 'caution',
        detail: `valueUsd $${input.valueUsd} is ${((input.valueUsd / cap.capUsd) * 100).toFixed(0)}% of effective cap $${cap.capUsd}`,
      }
    }
    return null
  } catch {
    return null
  }
}

// Rule 5: recent-failure track record (predictions wrong in last 7d).
const ruleRecentFailures: Rule = async ({ db, input }) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) AS wrong_count
       FROM agent_predictions
       WHERE agent_id = $1
         AND outcome_observed_at >= now() - interval '7 days'
         AND correct = false`,
      [input.proposerAgentId],
    )
    const wrongCount = Number(r.rows[0]?.wrong_count) || 0
    if (wrongCount >= 3) {
      return {
        rule: 'recent-failures',
        severity: 'dissent',
        detail: `${wrongCount} wrong predictions in last 7d`,
      }
    }
    if (wrongCount >= 1) {
      return {
        rule: 'recent-failures',
        severity: 'caution',
        detail: `${wrongCount} wrong prediction${wrongCount > 1 ? 's' : ''} in last 7d`,
      }
    }
    return null
  } catch {
    return null
  }
}

// Rule 6: doc-drift relevance — recent breaking changes in upstream docs
// that touch this action's domain. e.g. on-chain bridge actions are
// relevant to LZ doc-drift.
const ruleDocDriftRelevance: Rule = async ({ db, input }) => {
 // Only relevant for on-chain actions for now.
  if (input.actionType !== 'on-chain-tx' && input.actionType !== 'bridge') return null
  try {
    const r = await db.query(
      `SELECT source_id, COUNT(*) AS n
       FROM external_doc_snapshots
       WHERE severity = 'breaking'
         AND fetched_at >= now() - interval '24 hours'
       GROUP BY source_id`,
    )
    if (r.rows.length === 0) return null
    const list = r.rows.map((row: any) => `${row.source_id}(${row.n})`).join(', ')
    return {
      rule: 'recent-breaking-doc-drift',
      severity: 'caution',
      detail: `breaking changes in upstream docs in last 24h: ${list}`,
    }
  } catch {
    return null
  }
}

const ALL_RULES: Rule[] = [
  ruleBudgetProximity,
  ruleReputationTier,
  ruleAgentStateGate,
  ruleCapProximity,
  ruleRecentFailures,
  ruleDocDriftRelevance,
]

// ── Verdict aggregation ─────────────────────────────────────────────────────

function aggregateVerdict(signals: CounselSignal[]): { verdict: CounselVerdict; confidence: number } {
  if (signals.length === 0) {
    return { verdict: 'endorse', confidence: 0.7 }
  }
  const blocks = signals.filter((s) => s.severity === 'block').length
  const dissents = signals.filter((s) => s.severity === 'dissent').length
  const cautions = signals.filter((s) => s.severity === 'caution').length

  if (blocks > 0) {
    return { verdict: 'block-recommend', confidence: Math.min(1, 0.7 + 0.1 * blocks) }
  }
  if (dissents >= 2 || (dissents >= 1 && cautions >= 2)) {
    return { verdict: 'dissent', confidence: Math.min(0.95, 0.6 + 0.1 * dissents + 0.05 * cautions) }
  }
  if (dissents >= 1) {
    return { verdict: 'dissent', confidence: 0.55 }
  }
  if (cautions >= 2) {
    return { verdict: 'caution', confidence: Math.min(0.85, 0.5 + 0.1 * cautions) }
  }
  if (cautions >= 1) {
    return { verdict: 'caution', confidence: 0.55 }
  }
  return { verdict: 'endorse', confidence: 0.7 }
}

function summarizeReasoning(verdict: CounselVerdict, signals: CounselSignal[]): string {
  if (signals.length === 0) {
    return 'No risk signals fired. Proposer is in good standing across budget, reputation, security state, and recent track record.'
  }
  const lines = signals.map((s) => `[${s.severity}] ${s.rule}: ${s.detail}`)
  let header: string
  switch (verdict) {
    case 'block-recommend':
      header = 'Huginn recommends BLOCK. Multiple hard signals fired:'
      break
    case 'dissent':
      header = 'Huginn DISSENTS. Compound risk signals exceed acceptable threshold:'
      break
    case 'caution':
      header = 'Huginn flags CAUTION. Soft signals worth noting:'
      break
    case 'endorse':
      header = 'Huginn endorses with notes:'
      break
  }
  return [header, ...lines.map((l) => '  • ' + l)].join('\n')
}

function recommendedAlternative(verdict: CounselVerdict, signals: CounselSignal[]): string | undefined {
  if (verdict === 'endorse' || verdict === 'caution') return undefined
 // Cheap heuristic recommendations based on which signals fired.
  const codes = new Set(signals.map((s) => s.rule))
  if (codes.has('budget-exceeded') || codes.has('budget-near-zero')) {
    return 'Reduce action value to fit current budget, OR request an authority increase before proceeding.'
  }
  if (codes.has('cap-exceeded') || codes.has('cap-proximity')) {
    return 'Split into smaller transactions OR raise the tx cap via settings if intentional.'
  }
  if (codes.has('agent-paused') || codes.has('agent-quarantined')) {
    return 'Resolve the agent security state first; do not bypass.'
  }
  if (codes.has('rep-tier-penalized') || codes.has('rep-trending-bad')) {
    return 'Pause autonomous high-value actions for 24-72h to let reputation recover via small successful predictions.'
  }
  if (codes.has('recent-breaking-doc-drift')) {
    return 'Pause new bridge ops until the upstream-doc breaking change has been reviewed + the snapshot diff signed off.'
  }
  return undefined
}

// ── Main entry: counsel() ───────────────────────────────────────────────────

export async function counsel(db: Pool, input: CounselInput): Promise<CounselResult> {
  const signals: CounselSignal[] = []
  for (const rule of ALL_RULES) {
    try {
      const sig = await rule({ db, input })
      if (sig) signals.push(sig)
    } catch (err: any) {
      console.warn(`[huginn] rule failed: ${err?.message?.slice(0, 100)}`)
    }
  }

  const { verdict, confidence } = aggregateVerdict(signals)
  const reasoning = summarizeReasoning(verdict, signals)
  const alt = recommendedAlternative(verdict, signals)

 // Record the counsel as a Huginn prediction. Predict the action's
 // outcome based on the verdict — endorse → expects success; dissent
 // → expects failure (or that the proposer holds off). The scorer
 // grades us on whether reality matched.
  let predictionId: string | null = null

 // Best-effort: log a counsel-event event so the admin UI shows Huginn's
 // counsel alongside other security activity.
  try {
    const { logHelmEvent } = await import('../helm')
    void logHelmEvent({
      ruleId: 'counsel-event',
      subject: `Huginn ${verdict.toUpperCase()}: ${input.proposerAgentId} → ${input.actionType} ${input.actionSubject}`,
      agentId: input.proposerAgentId,
      context: {
        kind: 'huginn-counsel',
        verdict,
        confidence: Math.round(confidence * 100) / 100,
        signalsCount: signals.length,
        signals: signals.slice(0, 6).map((s) => ({ rule: s.rule, severity: s.severity, detail: s.detail.slice(0, 120) })),
        valueUsd: input.valueUsd ?? null,
        chainId: input.chainId ?? null,
        predictionId,
      },
      actionOverride: 'log-only',
    })
  } catch {
 /* skip */
  }

  return {
    verdict,
    confidence,
    signals,
    reasoning,
    recommendedAlternative: alt,
    predictionId,
  }
}

// ── Push-mode subscriber: react to bus events ──────────────────────────────

/**
 * Bootstrap Huginn's push-mode subscriptions. Called once at boot from
 * src/index.ts. Subscribes to topics where Huginn should auto-publish
 * counsel:
 * - external-doc-drift:breaking — proposes pausing ops until reviewed
 * - (future) agent-state-gate-transition — proposes operational responses
 *
 * The subscriber writes a counsel message back to the bus on the
 * `huginn-counsel` topic. Subscribers to THAT topic (Nuro, admin UI)
 * see Huginn's reactions in real time.
 */
export async function bootstrapHuginnSubscriptions(_db: Pool): Promise<void> {
 // Push-mode bus subscriptions removed from hackathon submission.
}

export async function runHuginnPollCycle(_db: Pool): Promise<{ messagesProcessed: number }> {
  return { messagesProcessed: 0 }
}

async function _reactToBusMessageUnused(
  db: Pool,
  msg: { id: string; topic: string; senderAgentId: string; payload: Record<string, unknown> },
  publish: any,
): Promise<void> {
  if (msg.topic === 'external-doc-drift:breaking') {
 // Doc-monitor flagged a breaking upstream change. Huginn proposes
 // operational pause + review. Publishes counsel back so Nuro /
 // admin UI sees it.
    const sourceId = String(msg.payload.docMonitorSource || 'unknown')
    const targetLabel = String(msg.payload.targetLabel || 'unknown')
    await publish(db, {
      fromAgentId: 'huginn',
      toAgentId: null,
      topic: 'huginn-counsel',
      payload: {
        replyToBusMessage: msg.id,
        verdict: 'caution',
        domain: sourceId,
        proposedAction: `Pause new ${sourceId === 'layerzero' ? 'LZ bridge' : sourceId === 'circle-cctp' ? 'CCTP bridge' : sourceId} operations until ${targetLabel} change reviewed`,
        reasoning:
          `Doc-monitor reports breaking upstream change in ${targetLabel}. Past lessons (Kelp class) say doc drift here can map to silent contract changes. Recommend operational pause + manual snapshot review before continuing on-chain ops in this domain.`,
        confidence: 0.8,
      },
      replyTo: msg.id,
      ttlSeconds: 7 * 24 * 60 * 60,
    }).catch(() => undefined)
    return
  }

  if (msg.topic === 'agent-budget-low') {
 // budgets.recordSpend() crossed the 20% or 5% line for an agent.
 // Huginn publishes counsel + fires Telegram so can refill or
 // pause the agent before its next high-value action proposes.
    const proposerAgentId = String(msg.payload.agentId || 'unknown')
    const period = String(msg.payload.period || 'weekly')
    const rawSeverity = String(msg.payload.severity || 'low')
    const severity: 'low' | 'near-zero' = rawSeverity === 'near-zero' ? 'near-zero' : 'low'
    const remainingUsd = Number(msg.payload.remainingUsd) || 0
    const authorityUsd = Number(msg.payload.authorityUsd) || 0
    const remainingPct = Number(msg.payload.remainingPct) || 0

    const verdict: CounselVerdict = severity === 'near-zero' ? 'dissent' : 'caution'
    const proposedAction = severity === 'near-zero'
      ? `Refill ${proposerAgentId}'s ${period} budget OR pause its high-value flows. At ${remainingPct.toFixed(1)}% (≤5%) Huginn will dissent on every high-value proposal until refilled.`
      : `Top up ${proposerAgentId}'s ${period} budget. At ${remainingPct.toFixed(1)}% (≤20%) the next large action will start scoring caution+ on cap-proximity.`
    const reasoning = `Agent ${proposerAgentId} crossed the ${severity === 'near-zero' ? '5%' : '20%'} weekly-budget threshold (currently $${remainingUsd.toFixed(2)} of $${authorityUsd.toFixed(2)}). Without refill, the budget-proximity rule will fire ${severity === 'near-zero' ? 'dissent' : 'caution'} on subsequent counsel calls. Operator response options: refill via /api/agents/${proposerAgentId}/budget/refill, raise authority via setBudgetAuthority, or pause the agent's high-value flows.`

    await publish(db, {
      fromAgentId: 'huginn',
      toAgentId: null,
      topic: 'huginn-counsel',
      payload: {
        replyToBusMessage: msg.id,
        verdict,
        domain: 'agent-budget',
        proposerAgentId,
        proposedAction,
        reasoning,
        confidence: severity === 'near-zero' ? 0.9 : 0.75,
      },
      replyTo: msg.id,
      ttlSeconds: 7 * 24 * 60 * 60,
    }).catch(() => undefined)

    void notifyAdminBudgetLow({
      agentId: proposerAgentId,
      severity,
      remainingUsd,
      authorityUsd,
      remainingPct,
      period,
    })
    return
  }
}

async function notifyAdminBudgetLow(ev: {
  agentId: string
  severity: 'low' | 'near-zero'
  remainingUsd: number
  authorityUsd: number
  remainingPct: number
  period: string
}): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (!chatId) return
  try {
    const { sendTelegramMessage } = await import('../lib/telegram')
    const icon = ev.severity === 'near-zero' ? '🔴' : '🟡'
    const headline = ev.severity === 'near-zero' ? 'BUDGET CRITICAL' : 'BUDGET LOW'
    const text = [
      `${icon} <b>${headline}</b> — ${ev.agentId}`,
      ``,
      `Period: ${ev.period}`,
      `Remaining: $${ev.remainingUsd.toFixed(2)} / $${ev.authorityUsd.toFixed(2)} (${ev.remainingPct.toFixed(1)}%)`,
      ``,
      ev.severity === 'near-zero'
        ? `≤5% — Huginn will dissent on every high-value proposal until refilled.`
        : `≤20% — next large action will score caution on cap-proximity.`,
      ``,
      `<i>Refill: POST /api/agents/${ev.agentId}/budget/refill</i>`,
    ].join('\n')
    await sendTelegramMessage(chatId, text)
  } catch (err: any) {
    console.warn(`[huginn] telegram alert failed: ${err?.message?.slice(0, 100)}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELM COMPOUND DETECTOR — HELM-501 + Gjallarhorn state machine
//
// S31 H2. Closes the gap on compound-signal escalation: per-event Helm
// rules catch obvious violations, but a sophisticated attacker accumulates
// many small "log-only" events instead of one big block. HELM-501 says:
// 2+ critical-severity events in 1h from the same agent → quarantine.
//
// This module also drives the Gjallarhorn three-state machine:
//   active     → no recent issues. Normal operation.
//   watch      → 1 critical event in 1h, OR 5+ high events in 6h.
//                Operational signal: "something happened, eyes on it."
//                No action restriction; just a flag.
//   paused     → 2+ critical events in 1h (HELM-501).
//                ACTION RESTRICTION: agent's authority is suspended pending review.
//   quarantined → HELM-401 (bypass-meta), HELM-402 (rule-self-modification),
//                 or 3+ critical events in 6h. Hardest restriction.
//
// Transitions are recorded in heimdall_state_history (append-only).
// State columns live on agents.heimdall_state{,_reason,_since,_review_at}.
//
// Cron runs every 5 minutes. Designed to be cheap: one aggregate query
// per cycle, partitioned per agent, plus targeted updates only when state
// transitions happen.
//
// HONESTY NOTE: Helm doesn't actually GATE agent behavior on
// heimdall_state today — that requires every agent's main loop to check
// the column before acting. Marathon 8 Phase 1 (Rust ingress proxy)
// makes this gating cryptographically enforced; in TS land we're at the
// "alarm + admin override" stage. The detector still ships because:
//   1. The state machine is the canonical place compound signals land
//   2. Admin UI gains "see + manually override" surface
//   3. When agents start consulting heimdall_state in their hot path
//      (incremental rollout per-agent), the data is already correct.

import type { Pool } from 'pg'
import { sendTelegramMessage } from '../growth-agent/skills/telegram'
import { logHelmEvent } from './core'

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''

// ── Tunables ─────────────────────────────────────────────────────────────────

interface Thresholds {
  /** Critical-event count in this window → watch. */
  watchCriticalIn1h: number
  /** High-event count in this window → watch. */
  watchHighIn6h: number
  /** Critical-event count in 1h → paused (HELM-501). */
  pauseCriticalIn1h: number
  /** Critical-event count in 6h → quarantined. */
  quarantineCriticalIn6h: number
  /** Specific rules whose ANY occurrence → immediate quarantine. */
  quarantineOnRules: Set<string>
}

const DEFAULT_THRESHOLDS: Thresholds = {
  watchCriticalIn1h: 1,
  watchHighIn6h: 5,
  pauseCriticalIn1h: 2,
  quarantineCriticalIn6h: 3,
  quarantineOnRules: new Set(['HELM-401', 'HELM-402', 'HELM-502']),
}

// Runtime override so operators can tighten/loosen via admin UI.
let _runtimeThresholds: Thresholds | null = null
export function setCompoundThresholds(t: Partial<Thresholds> | null): void {
  if (t === null) {
    _runtimeThresholds = null
  } else {
    _runtimeThresholds = { ...DEFAULT_THRESHOLDS, ..._runtimeThresholds, ...t }
  }
}
function thresholds(): Thresholds {
  return _runtimeThresholds || DEFAULT_THRESHOLDS
}

// ── Mode ────────────────────────────────────────────────────────────────────

let _runtimeEnforceOverride: boolean | null = null

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_GJALLARHORN_ENFORCE === 'on'
}

export function setGjallarhornEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

export function getGjallarhornMode(): {
  mode: 'enforce' | 'observe'
  source: 'runtime-override' | 'env'
  thresholds: Thresholds
} {
  if (_runtimeEnforceOverride !== null) {
    return {
      mode: _runtimeEnforceOverride ? 'enforce' : 'observe',
      source: 'runtime-override',
      thresholds: thresholds(),
    }
  }
  return {
    mode: process.env.HELM_GJALLARHORN_ENFORCE === 'on' ? 'enforce' : 'observe',
    source: 'env',
    thresholds: thresholds(),
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

type GjallarhornState = 'active' | 'watch' | 'paused' | 'quarantined'

interface AgentSignal {
  agentId: string
  criticalIn1h: number
  highIn6h: number
  criticalIn6h: number
  worstRule: string | null  // rule id triggering the highest-severity recent event
  triggeringEventIds: string[]
}

/** Rank states so we can compare "is the new state escalated from current?". */
function stateRank(s: GjallarhornState): number {
  switch (s) {
    case 'active':       return 0
    case 'watch':        return 1
    case 'paused':       return 2
    case 'quarantined':  return 3
  }
}

/** Pure decision function: given signals, what state should the agent be in? */
function decideState(s: AgentSignal): { state: GjallarhornState; reason: string } {
  const t = thresholds()

  // Hardest hits first — instant quarantine on specific rules.
  if (s.worstRule && t.quarantineOnRules.has(s.worstRule)) {
    return {
      state: 'quarantined',
      reason: `instant-quarantine rule fired: ${s.worstRule}`,
    }
  }
  if (s.criticalIn6h >= t.quarantineCriticalIn6h) {
    return {
      state: 'quarantined',
      reason: `${s.criticalIn6h} critical events in 6h ≥ ${t.quarantineCriticalIn6h}`,
    }
  }
  if (s.criticalIn1h >= t.pauseCriticalIn1h) {
    return {
      state: 'paused',
      reason: `HELM-501: ${s.criticalIn1h} critical events in 1h ≥ ${t.pauseCriticalIn1h}`,
    }
  }
  if (
    s.criticalIn1h >= t.watchCriticalIn1h ||
    s.highIn6h >= t.watchHighIn6h
  ) {
    return {
      state: 'watch',
      reason: `${s.criticalIn1h} critical/1h, ${s.highIn6h} high/6h crossed watch thresholds`,
    }
  }
  return { state: 'active', reason: 'no recent issues' }
}

// ── Aggregation query ───────────────────────────────────────────────────────

/**
 * Returns one row per agent that has had ANY event in the last 6 hours.
 * Agents with zero events stay 'active' implicitly (no row → no transition).
 */
async function aggregateSignals(db: Pool): Promise<AgentSignal[]> {
  const res = await db.query(
    `WITH base AS (
       SELECT
         COALESCE(agent_id, '__system__') AS agent_id,
         severity,
         rule_id,
         id::text AS event_id,
         occurred_at
       FROM heimdall_events
       WHERE occurred_at >= now() - interval '6 hours'
     )
     SELECT
       agent_id,
       COUNT(*) FILTER (WHERE severity = 'critical' AND occurred_at >= now() - interval '1 hour') AS critical_1h,
       COUNT(*) FILTER (WHERE severity = 'high'     AND occurred_at >= now() - interval '6 hours') AS high_6h,
       COUNT(*) FILTER (WHERE severity = 'critical' AND occurred_at >= now() - interval '6 hours') AS critical_6h,
       (
         ARRAY_AGG(rule_id ORDER BY
           CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           occurred_at DESC
         )
       )[1] AS worst_rule,
       (ARRAY_AGG(event_id ORDER BY occurred_at DESC))[1:20] AS triggering_event_ids
     FROM base
     GROUP BY agent_id
     HAVING COUNT(*) > 0`,
  )
  return res.rows.map((r: any) => ({
    agentId: r.agent_id,
    criticalIn1h: Number(r.critical_1h) || 0,
    highIn6h: Number(r.high_6h) || 0,
    criticalIn6h: Number(r.critical_6h) || 0,
    worstRule: r.worst_rule || null,
    triggeringEventIds: Array.isArray(r.triggering_event_ids)
      ? r.triggering_event_ids.filter((id: any) => id != null).map(String)
      : [],
  }))
}

// ── Transition application ──────────────────────────────────────────────────

interface AgentRow {
  id: string
  heimdallState: GjallarhornState
}

async function getAgentState(db: Pool, agentId: string): Promise<AgentRow | null> {
  if (agentId === '__system__') {
    // System-level events don't have an agents row — track via state-history only.
    return { id: '__system__', heimdallState: 'active' }
  }
  // S33 fix: agents.id = uuid; non-uuid values like 'mythos' / 'huginn'
  // exist as event agent_ids but do NOT exist as rows in agents. Cast
  // to text so the comparison doesn't blow up on `'mythos'::uuid` parsing.
  // For non-uuid agent_ids, the SELECT returns no row and we fall through
  // to the null-return below — same behavior as a missing real-uuid agent.
  const res = await db.query(
    `SELECT id, COALESCE(heimdall_state, 'active') AS heimdall_state
     FROM agents WHERE id::text = $1`,
    [agentId],
  )
  if (res.rows.length === 0) return null
  return {
    id: res.rows[0].id,
    heimdallState: res.rows[0].heimdall_state as GjallarhornState,
  }
}

async function applyTransition(
  db: Pool,
  agentId: string,
  fromState: GjallarhornState,
  toState: GjallarhornState,
  reason: string,
  triggeringEventIds: string[],
): Promise<void> {
  // Update agents.heimdall_state — only when the agent row exists (not __system__).
  if (agentId !== '__system__') {
    // Review SLA — paused/quarantined need human review within bounded
    // windows (per rule catalog § Gjallarhorn). 24h for paused, 4h for
    // quarantined; null otherwise.
    let reviewAt: string | null = null
    if (toState === 'quarantined') {
      reviewAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    } else if (toState === 'paused') {
      reviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
    // S33 fix: agents.id::text = $4 — same uuid-vs-varchar reasoning as
    // getAgentState. Non-uuid agent_ids ('mythos' etc.) silently no-op
    // here since they have no agents row to update; that's correct
    // behavior — their state is tracked only in heimdall_state_history.
    await db.query(
      `UPDATE agents
       SET heimdall_state = $1,
           heimdall_state_reason = $2,
           heimdall_state_since = now(),
           heimdall_state_review_at = $3
       WHERE id::text = $4`,
      [toState, reason.slice(0, 500), reviewAt, agentId],
    ).catch((err) =>
      console.warn(`[helm:compound] agents UPDATE failed for ${agentId}: ${err?.message?.slice(0, 100)}`),
    )
  }

  // Append the audit row. Always — even for __system__ we want history.
  await db.query(
    `INSERT INTO heimdall_state_history
       (agent_id, from_state, to_state, reason, triggered_by, triggering_events)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      agentId.slice(0, 128),
      fromState,
      toState,
      reason.slice(0, 500),
      'compound-detector',
      triggeringEventIds.length > 0 ? JSON.stringify(triggeringEventIds) : null,
    ],
  ).catch((err) =>
    console.warn(`[helm:compound] state_history insert failed: ${err?.message?.slice(0, 100)}`),
  )
}

async function alertTransition(
  agentId: string,
  fromState: GjallarhornState,
  toState: GjallarhornState,
  reason: string,
): Promise<void> {
  // Only alert for escalations to paused/quarantined OR de-escalations
  // from those (so we know when it's safe again).
  const isEscalation = stateRank(toState) > stateRank(fromState)
  const isDeEscalation = stateRank(toState) < stateRank(fromState)
  const isCritical = toState === 'paused' || toState === 'quarantined'
  if (!isCritical && !isDeEscalation) return

  // Always log a HELM-CTRL event so the admin UI shows the transition.
  void logHelmEvent({
    ruleId: 'HELM-501',
    subject: `Gjallarhorn: ${agentId} ${fromState} → ${toState}`,
    agentId: agentId === '__system__' ? null : agentId,
    context: { fromState, toState, reason, triggeredBy: 'compound-detector' },
    actionOverride: enforceModeOn() && (toState === 'paused' || toState === 'quarantined')
      ? 'quarantine'
      : 'log-only',
  })

  if (!ADMIN_CHAT_ID) return

  const emoji = isCritical ? '🚨' : isDeEscalation ? '✅' : '📢'
  const text = [
    `${emoji} <b>Gjallarhorn — ${toState.toUpperCase()}</b>`,
    `<b>Agent</b>: <code>${agentId}</code>`,
    `<b>From</b>: ${fromState}`,
    `<b>To</b>: ${toState}`,
    `<b>Reason</b>: ${reason}`,
    isEscalation && enforceModeOn()
      ? `\n⚠️ Enforce mode is ON — agent authority restricted.`
      : `\nℹ️ Observe mode — flag only, no automatic action.`,
  ].join('\n')

  await sendTelegramMessage(ADMIN_CHAT_ID, text, 'HTML').catch((err) =>
    console.warn(`[helm:compound] telegram alert failed: ${err?.message?.slice(0, 100)}`),
  )
}

// ── The main cron entry ─────────────────────────────────────────────────────

export interface CompoundCycleResult {
  agentsScanned: number
  transitionsRecorded: number
  alertsFired: number
  durationMs: number
}

/**
 * Run one compound-signal evaluation cycle. Designed to be called every
 * 5 minutes from a cron loop. Idempotent — same signals → same state →
 * no spurious transitions (we only INSERT history when the state actually
 * changes).
 *
 * Also handles DE-ESCALATION: if an agent has been quiet for >1h after a
 * watch flip, we move them back toward active. The reason is timestamped
 * so the audit trail shows "auto-cleared at TS" vs. a human override.
 */
export async function runCompoundCycle(db: Pool): Promise<CompoundCycleResult> {
  const start = Date.now()
  const result: CompoundCycleResult = {
    agentsScanned: 0,
    transitionsRecorded: 0,
    alertsFired: 0,
    durationMs: 0,
  }

  let signals: AgentSignal[]
  try {
    signals = await aggregateSignals(db)
  } catch (err: any) {
    console.error(`[helm:compound] aggregation query failed: ${err?.message?.slice(0, 120)}`)
    result.durationMs = Date.now() - start
    return result
  }

  const seenAgents = new Set<string>()
  for (const sig of signals) {
    seenAgents.add(sig.agentId)
    // S31 H2 fix: __system__ is the catch-all sentinel for events
    // without a real agent context (global axios HELM-101 hits, watchdog
    // heartbeats, etc.). It's not an agent — skip the state machine for
    // it. We DID want signals counted for compound detection, just not
    // for state transitions on a fictional row.
    if (sig.agentId === '__system__') continue
    result.agentsScanned++
    try {
      const cur = await getAgentState(db, sig.agentId)
      if (!cur) continue
      const decision = decideState(sig)
      if (decision.state !== cur.heimdallState) {
        await applyTransition(
          db,
          sig.agentId,
          cur.heimdallState,
          decision.state,
          decision.reason,
          sig.triggeringEventIds,
        )
        await alertTransition(
          sig.agentId,
          cur.heimdallState,
          decision.state,
          decision.reason,
        )
        result.transitionsRecorded++
        if (decision.state === 'paused' || decision.state === 'quarantined') {
          result.alertsFired++
        }
      }
    } catch (err: any) {
      console.error(
        `[helm:compound] agent ${sig.agentId} eval failed: ${err?.message?.slice(0, 100)}`,
      )
    }
  }

  // De-escalation pass: any agent currently in 'watch' who's been quiet
  // for >1h goes back to 'active'. Quarantined and Paused REQUIRE human
  // override per Marathon 8 § Gjallarhorn (no auto-clear of those).
  try {
    // S33 fix: agents.id = uuid, heimdall_events.agent_id = varchar(64).
    // Cast both to text for the NOT IN comparison — non-uuid agent_ids
    // like 'mythos'/'huginn' coexist with uuid agents.id values, so we
    // can't cast one to the other's type.
    const stale = await db.query(
      `SELECT id, heimdall_state
       FROM agents
       WHERE heimdall_state = 'watch'
         AND heimdall_state_since < now() - interval '1 hour'
         AND id::text NOT IN (SELECT DISTINCT agent_id FROM heimdall_events
                              WHERE occurred_at >= now() - interval '1 hour'
                                AND agent_id IS NOT NULL
                                AND severity IN ('critical', 'high'))`,
    )
    for (const row of stale.rows) {
      await applyTransition(
        db,
        row.id,
        row.heimdall_state as GjallarhornState,
        'active',
        'auto-clear: 1h quiet after watch',
        [],
      )
      await alertTransition(
        row.id,
        row.heimdall_state as GjallarhornState,
        'active',
        'auto-clear: 1h quiet after watch',
      )
      result.transitionsRecorded++
    }
  } catch (err: any) {
    console.warn(`[helm:compound] de-escalation sweep failed: ${err?.message?.slice(0, 100)}`)
  }

  result.durationMs = Date.now() - start
  if (result.transitionsRecorded > 0 || result.agentsScanned > 0) {
    console.log(
      `[helm:compound] cycle complete in ${result.durationMs}ms — ` +
        `scanned ${result.agentsScanned}, transitions ${result.transitionsRecorded}, ` +
        `alerts ${result.alertsFired}`,
    )
  }
  return result
}

/** Snapshot of all agents currently NOT in 'active' state — admin UI feed. */
export async function getActiveGjallarhornState(db: Pool): Promise<Array<{
  agentId: string
  state: GjallarhornState
  reason: string | null
  since: string
  reviewAt: string | null
}>> {
  try {
    const res = await db.query(
      `SELECT id, heimdall_state, heimdall_state_reason, heimdall_state_since, heimdall_state_review_at
       FROM agents
       WHERE heimdall_state != 'active'
       ORDER BY
         CASE heimdall_state
           WHEN 'quarantined' THEN 1
           WHEN 'paused' THEN 2
           WHEN 'watch' THEN 3
         END,
         heimdall_state_since DESC`,
    )
    return res.rows.map((r: any) => ({
      agentId: r.id,
      state: r.heimdall_state,
      reason: r.heimdall_state_reason,
      since: r.heimdall_state_since,
      reviewAt: r.heimdall_state_review_at,
    }))
  } catch {
    return []
  }
}

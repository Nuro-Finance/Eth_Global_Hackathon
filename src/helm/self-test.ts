// ─────────────────────────────────────────────────────────────────────────────
// HELM SELF-TEST — operational visibility (S33 Tier 1 #16)
//
// Backs `GET /admin/api/helm/self-test`. For each rule in the canonical
// catalog (HELM_RULES from core.ts), reports:
//
//   - armed:        does the corresponding scanner module exist + is install
//                   enabled? (env-flag derived; "unknown" for rules not yet
//                   wired in TS)
//   - mode:         observe / enforce / live / unknown — pulled from each
//                   scanner's published getter where available
//   - lastFired:    timestamp of most recent heimdall_events row for the rule
//   - count24h:     event count in the last 24 hours
//   - enforcedInTs: from the catalog (true = TS implementation lives in
//                   src/heimdall/*; false = scaffold-only or Rust-tier rule)
//
// Operator workflow it unblocks:
//   1. After deploy: hit the endpoint to confirm every rule that was supposed
//      to install actually did
//   2. After a flag flip (e.g. HELM_TXCAP_ENFORCE=on): confirm mode flipped
//   3. Post-incident: see when the most recent event of each rule fired —
//      "did HELM-401 catch the bypass-meta attempt?" answers itself
//   4. Pre-enforce-flip readiness: zero-events-in-7d on a rule means we don't
//      have signal to base the flip on; >0 events in observe mode means we
//      should review FP rate before flipping
//
// Karpathy guideline #2 (Simplicity First): one query, one in-memory join
// against the catalog, return JSON. No caching layer; cron is 1m+, this
// endpoint is operator-on-demand and well under that load.
// ─────────────────────────────────────────────────────────────────────────────

import type { Pool } from 'pg'
import { HELM_RULES, type HelmRule } from './core'
import { getTxCapMode } from './tx-cap'
import { getGjallarhornMode } from './compound-detector'
import { getEgressMode } from './egress'
import { getFsGuardMode } from './fs-guard'
import { getReasoningMode } from './reasoning-detectors'
import { getMassWriteMode } from './mass-write-counter'
import { getMerkleMode } from './merkle-manifest'
import { getIngressMode } from './ingress-scanner'

export interface RuleSelfTestRow {
  id: string
  category: HelmRule['category']
  severity: HelmRule['severity']
  action: HelmRule['action']
  trigger: string
  enforcedInTs: boolean
  /** Did the scanner / cap actually install? `unknown` for rules without a
   *  module in TS yet (scaffold-only or Rust-tier). */
  armed: 'yes' | 'no' | 'unknown'
  /** observe / enforce / live (HELM-108 redacts unconditionally) / unknown. */
  mode: 'observe' | 'enforce' | 'live' | 'unknown'
  /** Where the mode came from when known — env var, runtime override, or
   *  hardcoded. */
  modeSource: 'env' | 'runtime-override' | 'always-on' | 'unknown'
  /** ISO timestamp of most recent occurrence in heimdall_events. */
  lastFired: string | null
  /** Events in the last 24 hours. Useful for "is this rule getting signal?". */
  count24h: number
  /** Cumulative events ever recorded. */
  countTotal: number
}

export interface HelmSelfTestResult {
  generatedAt: string
  /** Total rules in catalog. */
  totalRules: number
  /** How many have a TS implementation (enforcedInTs=true). */
  enforcedInTsCount: number
  /** How many of the TS-enforced rules are currently armed. */
  armedCount: number
  /** How many are in `enforce` mode (vs observe). */
  enforceCount: number
  /** How many fired any event in the last 24 hours — signal liveness. */
  active24hCount: number
  /** Per-rule rows, ordered by category then id. */
  rules: RuleSelfTestRow[]
}

/**
 * Runs the self-test. Pure function over (catalog, env, db state); safe to
 * call as often as needed.
 */
export async function runHelmSelfTest(db: Pool): Promise<HelmSelfTestResult> {
  // 1. One-shot DB query for last_fired + counts per rule_id.
  const eventStats = new Map<string, { lastFired: string | null; count24h: number; countTotal: number }>()
  try {
    const r = await db.query(
      `SELECT rule_id,
              MAX(occurred_at) AS last_fired,
              COUNT(*) FILTER (WHERE occurred_at >= now() - interval '24 hours') AS count_24h,
              COUNT(*) AS count_total
         FROM heimdall_events
        GROUP BY rule_id`,
    )
    for (const row of r.rows) {
      eventStats.set(row.rule_id, {
        lastFired: row.last_fired ? new Date(row.last_fired).toISOString() : null,
        count24h: Number(row.count_24h) || 0,
        countTotal: Number(row.count_total) || 0,
      })
    }
  } catch (err) {
    // Don't blow up the entire endpoint on a heimdall_events outage —
    // operator still gets the catalog with empty stats.
    console.warn(
      `[helm:self-test] event aggregate failed: ${(err as Error)?.message?.slice(0, 100)}`,
    )
  }

  // 2. Resolve per-rule mode + armed using the published getters.
  const rules: RuleSelfTestRow[] = HELM_RULES.map((rule) => {
    const stats = eventStats.get(rule.id)
    const base: RuleSelfTestRow = {
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      action: rule.action,
      trigger: rule.trigger,
      enforcedInTs: rule.enforcedInTs === true,
      armed: 'unknown',
      mode: 'unknown',
      modeSource: 'unknown',
      lastFired: stats?.lastFired ?? null,
      count24h: stats?.count24h ?? 0,
      countTotal: stats?.countTotal ?? 0,
    }

    // Per-rule resolution. Each branch reads the canonical getter for that
    // rule's module and projects to the self-test schema.
    switch (rule.id) {
      case 'HELM-001':
      case 'HELM-002':
      case 'HELM-003':
      case 'HELM-004':
      case 'HELM-005':
      case 'HELM-006':
      case 'HELM-007': {
        // Ingress prompt-injection scanner — wired per call-site.
        // Currently armed in /api/x402/huginn/counsel; future call-sites
        // can opt in by importing scanAndEmit from ingress-scanner.ts.
        const m = getIngressMode()
        base.armed = m.armed ? 'yes' : 'no'
        base.mode = m.mode
        base.modeSource = m.source
        return base
      }
      case 'HELM-101': {
        // Egress observer / enforcer.
        const m = getEgressMode()
        base.armed = 'yes'
        base.mode = m.mode
        base.modeSource = m.source
        return base
      }
      case 'HELM-105': {
        // Tx-cap value gate. Always armed (per-call-site, no install).
        const m = getTxCapMode()
        base.armed = 'yes'
        base.mode = m.mode
        base.modeSource = m.enforceSource
        return base
      }
      case 'HELM-105B': {
        // Pattern scanner that runs at boot + on flag-flip.
        base.armed = process.env.HELM_105B_OFF !== 'true' ? 'yes' : 'no'
        base.mode = process.env.HELM_105B_ENFORCE === 'on' ? 'enforce' : 'observe'
        base.modeSource = 'env'
        return base
      }
      case 'HELM-108': {
        // Log scanner — redaction is unconditional when armed.
        base.armed = process.env.HELM_LOG_SCAN !== 'off' ? 'yes' : 'no'
        base.mode = base.armed === 'yes' ? 'live' : 'unknown'
        base.modeSource = 'always-on'
        return base
      }
      case 'HELM-201':
      case 'HELM-202':
      case 'HELM-203': {
        // fs-guard covers all three. Single mode getter.
        const m = getFsGuardMode()
        base.armed = 'yes'
        base.mode = m.mode
        base.modeSource = m.source
        return base
      }
      case 'HELM-205': {
        const m = getMassWriteMode()
        base.armed = 'yes'
        base.mode = m.mode
        base.modeSource = m.source
        return base
      }
      case 'HELM-208': {
        const m = getMerkleMode()
        base.armed = 'yes'
        base.mode = m.mode
        base.modeSource = m.source
        return base
      }
      case 'HELM-401':
      case 'HELM-402':
      case 'HELM-403': {
        const m = getReasoningMode()
        base.armed = 'yes'
        base.mode = m.mode
        base.modeSource = m.source
        return base
      }
      case 'HELM-501':
      case 'HELM-502': {
        // Compound + state machine. Armed if cron not disabled.
        base.armed = process.env.HELM_COMPOUND_OFF !== 'true' ? 'yes' : 'no'
        const m = getGjallarhornMode()
        base.mode = m.mode
        base.modeSource = m.source === 'runtime-override' ? 'runtime-override' : 'env'
        return base
      }
      case 'HELM-CTRL': {
        // Operator control-plane events — not a rule per se, but emitted
        // by every transition so it's visible here too.
        base.armed = 'yes'
        base.mode = 'live'
        base.modeSource = 'always-on'
        return base
      }
      default:
        // Scaffold-only or Rust-tier rule with no TS implementation yet.
        // Leave armed/mode as 'unknown'; the catalog's enforcedInTs flag
        // tells the operator whether it SHOULD have an implementation.
        return base
    }
  })

  // 3. Sort: category alphabetical, then id ascending. Stable visual grouping
  //    in admin UI.
  rules.sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1
    return a.id < b.id ? -1 : 1
  })

  // 4. Roll-ups for the dashboard header.
  const enforcedInTsCount = rules.filter((r) => r.enforcedInTs).length
  const armedCount = rules.filter((r) => r.armed === 'yes').length
  const enforceCount = rules.filter((r) => r.mode === 'enforce').length
  const active24hCount = rules.filter((r) => r.count24h > 0).length

  return {
    generatedAt: new Date().toISOString(),
    totalRules: rules.length,
    enforcedInTsCount,
    armedCount,
    enforceCount,
    active24hCount,
    rules,
  }
}

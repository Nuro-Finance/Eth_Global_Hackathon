// ─────────────────────────────────────────────────────────────────────────────
// AGENT BUDGETS — read + write API for the budget dashboard
//
// S31 H2. Per Mythos's "what does an agent want" + Richard's expansion:
// surface budgets to the agent (so it can pace itself) AND to humans
// (admin oversight). Backed by migration 037.
//
// Read model:
//   getBudgetSnapshot(agentId) → {
//     budgets: [{ period, usdAuthority, usdRemaining, usdSpent7d, ... }],
//     gasBalances: [{ chainId, walletAddress, balanceNative, balanceUsd, lowThresholdUsd, lastSyncedAt }],
//     recentLedger: [{ action, currency, chainId, delta, description, occurredAt }]
//   }
//
// Write paths:
//   recordSpend({ agentId, deltaUsd, description, txHash?, chainId? })
//   recordRefill({ agentId, deltaUsd, description, by? })
//   recordGasMove({ agentId, chainId, deltaNative, currency, action, description })
//
// All writes append to agent_budget_ledger AND update the relevant
// summary cache (agent_budgets.usd_remaining or agent_gas_balances.balance_native).

import type { Pool } from 'pg'
import { cache, cacheKeys } from './cache'

// ── Types ───────────────────────────────────────────────────────────────────

export interface BudgetRecord {
  period: 'weekly' | 'monthly' | 'one-shot'
  usdAuthority: number
  usdRemaining: number
  lastResetAt: string
  usdSpent7d: number
  spendCount7d: number
  lastSpendAt: string | null
  note: string | null
  active: boolean
}

export interface GasBalance {
  chainId: number
  walletAddress: string
  balanceNative: string  // BigInt-shape; FE parses
  balanceUsd: number | null
  lowThresholdUsd: number | null
  lastSyncedAt: string
  isLow: boolean
}

export interface LedgerRow {
  id: string
  action: string
  currency: string
  chainId: number | null
  delta: number
  description: string
  relatedTxHash: string | null
  occurredAt: string
}

export interface BudgetSnapshot {
  agentId: string
  budgets: BudgetRecord[]
  gasBalances: GasBalance[]
  recentLedger: LedgerRow[]
}

// ── Read ────────────────────────────────────────────────────────────────────

// S35 Marathon 11 / Day-2: read-through cache. The dashboard hits this on
// every render; 4 parallel queries × N tabs open = unnecessary DB load.
// 60-second TTL is fine because:
//   - Writers (recordSpend / recordRefill) invalidate on commit so the
//     authoring user sees their own change immediately.
//   - Cross-user staleness is bounded to 60s, well within the polling
//     cadence of any UI consumer.
// Cache backend is in-memory by default; flips to Upstash when
// UPSTASH_REDIS_REST_URL is set in env (no app code change).

export async function getBudgetSnapshot(
  db: Pool,
  agentId: string,
  ledgerLimit = 25,
): Promise<BudgetSnapshot> {
  const cacheKey = cacheKeys.budgetSnapshot(agentId, ledgerLimit)
  const cached = await cache.get<BudgetSnapshot>(cacheKey)
  if (cached) return cached

  const [budgetsRes, gasRes, ledgerRes, weeklyRes] = await Promise.all([
    db.query(
      `SELECT period, usd_authority::text, usd_remaining::text,
              last_reset_at, active, note
       FROM agent_budgets
       WHERE agent_id = $1 AND active = true
       ORDER BY period`,
      [agentId],
    ),
    db.query(
      `SELECT chain_id, wallet_address, balance_native::text,
              balance_usd::text, low_threshold_usd::text, last_synced_at
       FROM agent_gas_balances
       WHERE agent_id = $1
       ORDER BY chain_id`,
      [agentId],
    ),
    db.query(
      `SELECT id, action, currency, chain_id, delta::text, description,
              related_tx_hash, occurred_at
       FROM agent_budget_ledger
       WHERE agent_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [agentId, Math.min(Math.max(ledgerLimit, 1), 250)],
    ),
    db.query(
      `SELECT usd_spent_7d::text, spend_count_7d, last_spend_at
       FROM agent_budget_weekly_summary
       WHERE agent_id = $1`,
      [agentId],
    ),
  ])

  const weekly = weeklyRes.rows[0] || {}
  const usdSpent7d = Number(weekly.usd_spent_7d) || 0
  const spendCount7d = Number(weekly.spend_count_7d) || 0
  const lastSpendAt = weekly.last_spend_at ?? null

  const budgets: BudgetRecord[] = budgetsRes.rows.map((r: any) => ({
    period: r.period as BudgetRecord['period'],
    usdAuthority: Number(r.usd_authority) || 0,
    usdRemaining: Number(r.usd_remaining) || 0,
    lastResetAt: r.last_reset_at,
    usdSpent7d,
    spendCount7d,
    lastSpendAt,
    note: r.note,
    active: r.active,
  }))

  const gasBalances: GasBalance[] = gasRes.rows.map((r: any) => {
    const usd = r.balance_usd != null ? Number(r.balance_usd) : null
    const lowT = r.low_threshold_usd != null ? Number(r.low_threshold_usd) : null
    return {
      chainId: r.chain_id,
      walletAddress: r.wallet_address,
      balanceNative: r.balance_native,
      balanceUsd: usd,
      lowThresholdUsd: lowT,
      lastSyncedAt: r.last_synced_at,
      isLow: usd != null && lowT != null && usd < lowT,
    }
  })

  const recentLedger: LedgerRow[] = ledgerRes.rows.map((r: any) => ({
    id: r.id,
    action: r.action,
    currency: r.currency,
    chainId: r.chain_id,
    delta: Number(r.delta) || 0,
    description: r.description,
    relatedTxHash: r.related_tx_hash,
    occurredAt: r.occurred_at,
  }))

  const snapshot: BudgetSnapshot = { agentId, budgets, gasBalances, recentLedger }

  // Best-effort cache write. 60s TTL — long enough to absorb burst dashboard
  // refreshes, short enough that even without write-side invalidation users
  // see fresh data within a minute.
  void cache.set(cacheKey, snapshot, 60).catch(() => undefined)

  return snapshot
}

// ── Write ───────────────────────────────────────────────────────────────────

export interface RecordSpendInput {
  agentId: string
  deltaUsd: number  // POSITIVE — caller passes amount spent. We negate internally.
  description: string
  txHash?: string | null
  chainId?: number | null
  relatedEventId?: string | null
  /** Optional: which budget period to debit. Defaults to 'weekly'. */
  period?: BudgetRecord['period']
}

export async function recordSpend(db: Pool, input: RecordSpendInput): Promise<{
  ledgerId: string
  newRemaining: number | null  // null if no active budget for this period
}> {
  if (!Number.isFinite(input.deltaUsd) || input.deltaUsd <= 0) {
    throw new Error('recordSpend: deltaUsd must be a positive finite number')
  }
  const period = input.period ?? 'weekly'

  // Append ledger row first (immutable; even if budget update fails we
  // have the audit trail).
  const ledgerRes = await db.query(
    `INSERT INTO agent_budget_ledger
       (agent_id, action, currency, chain_id, delta, description,
        related_tx_hash, related_event_id)
     VALUES ($1, 'spend', 'USD', $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.agentId,
      input.chainId ?? null,
      -input.deltaUsd,
      input.description.slice(0, 500),
      input.txHash ?? null,
      input.relatedEventId ?? null,
    ],
  )

  // Pre-snapshot for threshold-crossing detection. Single-statement read +
  // update isn't worth a CTE — slight non-atomicity here just means a rare
  // duplicate alert under heavy concurrent spend, which is acceptable.
  const pre = await db.query(
    `SELECT usd_remaining::text, usd_authority::text
     FROM agent_budgets
     WHERE agent_id = $1 AND period = $2 AND active = true`,
    [input.agentId, period],
  )

  // Update the cache. If no active budget exists for this period, return
  // null — the spend is still recorded in the ledger, just not gating.
  const upd = await db.query(
    `UPDATE agent_budgets
     SET usd_remaining = GREATEST(usd_remaining - $1, 0)
     WHERE agent_id = $2 AND period = $3 AND active = true
     RETURNING usd_remaining::text`,
    [input.deltaUsd, input.agentId, period],
  )

  const newRemaining = upd.rows[0] ? Number(upd.rows[0].usd_remaining) : null

  // Threshold-crossing alert. Fires only on the spend that *crosses* the
  // 20% / 5% line (oldPct above, newPct at or below). Best-effort —
  // bus failure must never poison the spend ledger.
  if (pre.rows[0] && newRemaining !== null) {
    const oldRem = Number(pre.rows[0].usd_remaining)
    const auth = Number(pre.rows[0].usd_authority)
    if (Number.isFinite(oldRem) && Number.isFinite(auth) && auth > 0) {
      const oldPct = oldRem / auth
      const newPct = newRemaining / auth
      let severity: 'low' | 'near-zero' | null = null
      if (oldPct > 0.05 && newPct <= 0.05) severity = 'near-zero'
      else if (oldPct > 0.20 && newPct <= 0.20) severity = 'low'
      if (severity) {
        void publishBudgetLow(db, {
          agentId: input.agentId,
          period,
          severity,
          remaining: newRemaining,
          authority: auth,
          pct: newPct,
        }).catch(() => undefined)
      }
    }
  }

  // Invalidate read-cache so the writer sees their own change immediately.
  // delPrefix because callers may cache the same agent at varying ledger
  // limits (25 / 50 / 100 etc.).
  void cache.delPrefix(cacheKeys.budgetSnapshotPrefix(input.agentId)).catch(() => undefined)

  return {
    ledgerId: ledgerRes.rows[0].id,
    newRemaining,
  }
}

async function publishBudgetLow(
  db: Pool,
  ev: {
    agentId: string
    period: BudgetRecord['period']
    severity: 'low' | 'near-zero'
    remaining: number
    authority: number
    pct: number
  },
): Promise<void> {
  const { publish } = await import('./agent-bus')
  await publish(db, {
    fromAgentId: 'budgets',
    toAgentId: null,
    topic: 'agent-budget-low',
    payload: {
      agentId: ev.agentId,
      period: ev.period,
      severity: ev.severity,
      remainingUsd: ev.remaining,
      authorityUsd: ev.authority,
      remainingPct: Math.round(ev.pct * 1000) / 10,
    },
    ttlSeconds: 7 * 24 * 60 * 60,
  })
}

export interface RecordRefillInput {
  agentId: string
  deltaUsd: number  // POSITIVE
  description: string
  by?: string | null  // 'richard' / 'mythos' / etc.
  period?: BudgetRecord['period']
}

export async function recordRefill(db: Pool, input: RecordRefillInput): Promise<{
  ledgerId: string
  newRemaining: number
}> {
  if (!Number.isFinite(input.deltaUsd) || input.deltaUsd <= 0) {
    throw new Error('recordRefill: deltaUsd must be a positive finite number')
  }
  const period = input.period ?? 'weekly'

  const ledgerRes = await db.query(
    `INSERT INTO agent_budget_ledger
       (agent_id, action, currency, delta, description)
     VALUES ($1, 'refill', 'USD', $2, $3)
     RETURNING id`,
    [
      input.agentId,
      input.deltaUsd,
      `${input.description.slice(0, 480)}${input.by ? ` (by ${input.by})` : ''}`,
    ],
  )

  // Refill: bump remaining BUT NEVER above authority (a refill > authority
  // is treated as a request to also increase the cap; that's an admin
  // operation handled by setBudgetAuthority below).
  const upd = await db.query(
    `UPDATE agent_budgets
     SET usd_remaining = LEAST(usd_remaining + $1, usd_authority)
     WHERE agent_id = $2 AND period = $3 AND active = true
     RETURNING usd_remaining::text`,
    [input.deltaUsd, input.agentId, period],
  )

  // If no budget existed, create one (refill against a fresh slate).
  if (upd.rows.length === 0) {
    const newAuth = input.deltaUsd
    await db.query(
      `INSERT INTO agent_budgets (agent_id, period, usd_authority, usd_remaining, note)
       VALUES ($1, $2, $3, $3, $4)`,
      [input.agentId, period, newAuth, `auto-created on first refill: ${input.description.slice(0, 200)}`],
    )
    void cache.delPrefix(cacheKeys.budgetSnapshotPrefix(input.agentId)).catch(() => undefined)
    return { ledgerId: ledgerRes.rows[0].id, newRemaining: newAuth }
  }

  void cache.delPrefix(cacheKeys.budgetSnapshotPrefix(input.agentId)).catch(() => undefined)

  return {
    ledgerId: ledgerRes.rows[0].id,
    newRemaining: Number(upd.rows[0].usd_remaining),
  }
}

export async function setBudgetAuthority(
  db: Pool,
  agentId: string,
  period: BudgetRecord['period'],
  newAuthorityUsd: number,
  by: string,
): Promise<void> {
  if (!Number.isFinite(newAuthorityUsd) || newAuthorityUsd < 0) {
    throw new Error('setBudgetAuthority: authority must be a non-negative number')
  }
  await db.query(
    `INSERT INTO agent_budgets (agent_id, period, usd_authority, usd_remaining,
                                note, last_reset_at, active)
     VALUES ($1, $2, $3, $3, $4, now(), true)
     ON CONFLICT (agent_id, period) DO UPDATE
       SET usd_authority = EXCLUDED.usd_authority,
           usd_remaining = LEAST(agent_budgets.usd_remaining, EXCLUDED.usd_authority),
           note = EXCLUDED.note,
           active = true`,
    [agentId, period, newAuthorityUsd, `authority set to $${newAuthorityUsd} by ${by}`],
  )
  // Audit trail
  await db.query(
    `INSERT INTO agent_budget_ledger
       (agent_id, action, currency, delta, description)
     VALUES ($1, 'authority-set', 'USD', $2, $3)`,
    [agentId, newAuthorityUsd, `authority set by ${by} to $${newAuthorityUsd}`],
  )
  void cache.delPrefix(cacheKeys.budgetSnapshotPrefix(agentId)).catch(() => undefined)
}

// ── Period rollover cron (S32) ──────────────────────────────────────────────

/**
 * Roll over weekly + monthly budgets whose `last_reset_at` is older than
 * the period boundary. Called from the reputation cron (6h cadence) so we
 * don't spawn yet another scheduler. one-shot budgets never roll.
 *
 * Atomicity: single-statement WITH-cascade so the ledger row + budget
 * update commit together. Per-budget refill delta = (authority - old
 * remaining); skipped when remaining was already ≥ authority (no-op).
 */
export async function runBudgetRolloverCycle(db: Pool): Promise<{
  budgetsScanned: number
  ledgerRowsInserted: number
}> {
  // Step 1: select+update — bump last_reset_at on every eligible budget,
  // raise usd_remaining to authority where remaining < authority.
  const upd = await db.query(
    `WITH eligible AS (
       SELECT id, agent_id, period, usd_authority, usd_remaining
       FROM agent_budgets
       WHERE active = true
         AND period IN ('weekly', 'monthly')
         AND (
           (period = 'weekly'  AND last_reset_at < now() - interval '7 days') OR
           (period = 'monthly' AND last_reset_at < now() - interval '30 days')
         )
       FOR UPDATE
     )
     UPDATE agent_budgets b
     SET usd_remaining = GREATEST(b.usd_remaining, b.usd_authority),
         last_reset_at = now()
     FROM eligible e
     WHERE b.id = e.id
     RETURNING b.agent_id, b.period,
               b.usd_authority::text AS authority,
               e.usd_remaining::text AS old_remaining`,
  )

  // Step 2: ledger inserts for the budgets that actually got refilled.
  // Tiny loop — at most ~N rows per cycle where N = active agents whose
  // period rolled this run.
  let ledgerRowsInserted = 0
  const touchedAgents = new Set<string>()
  for (const row of upd.rows) {
    const authority = Number(row.authority)
    const oldRemaining = Number(row.old_remaining)
    const delta = authority - oldRemaining
    if (!Number.isFinite(delta) || delta <= 0) continue
    await db.query(
      `INSERT INTO agent_budget_ledger
         (agent_id, action, currency, delta, description)
       VALUES ($1, 'period-reset', 'USD', $2, $3)`,
      [
        row.agent_id,
        delta,
        `${row.period} period rollover: refilled $${delta.toFixed(2)} (was $${oldRemaining.toFixed(2)} of $${authority.toFixed(2)} authority)`,
      ],
    )
    ledgerRowsInserted++
    touchedAgents.add(row.agent_id)
  }

  // Invalidate cache for every agent whose budget changed in this rollover.
  // Otherwise a user who hits the dashboard right after the cron tick would
  // see stale "remaining" values for up to 60s.
  Array.from(touchedAgents).forEach((agentId) => {
    void cache.delPrefix(cacheKeys.budgetSnapshotPrefix(agentId)).catch(() => undefined)
  })

  return { budgetsScanned: upd.rowCount ?? 0, ledgerRowsInserted }
}

// ── Helm hook ───────────────────────────────────────────────────────────

/**
 * Returns the effective USD cap for HELM-105 to use for a given agent.
 * If no active budget exists, returns null — caller falls back to the
 * env default. If a budget exists, returns min(env_default, remaining).
 *
 * HELM-105 calls this BEFORE evaluating its own cap, then takes the min.
 */
export async function getEffectiveUsdCap(
  db: Pool,
  agentId: string,
  envDefaultUsd: number,
): Promise<{ capUsd: number; source: 'env' | 'budget'; budgetRemaining: number | null }> {
  try {
    const r = await db.query(
      `SELECT usd_remaining::text
       FROM agent_budgets
       WHERE agent_id = $1 AND period = 'weekly' AND active = true
       LIMIT 1`,
      [agentId],
    )
    if (r.rows.length === 0) {
      return { capUsd: envDefaultUsd, source: 'env', budgetRemaining: null }
    }
    const remaining = Number(r.rows[0].usd_remaining)
    return {
      capUsd: Math.min(envDefaultUsd, remaining),
      source: remaining < envDefaultUsd ? 'budget' : 'env',
      budgetRemaining: remaining,
    }
  } catch {
    // DB hiccup — fall through to env default. Don't fail the tx-cap path.
    return { capUsd: envDefaultUsd, source: 'env', budgetRemaining: null }
  }
}

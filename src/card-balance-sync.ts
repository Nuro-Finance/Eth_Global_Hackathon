/**
 * ─── CARD BALANCE SYNC HELPER (Sprint D) ─────────────────────────────────────
 *
 * Centralizes the "read from Issuer, write-through to cards.balance" pattern
 * used in 3 places before Sprint D. Invariant: we ONLY write to cards.balance
 * after a successful Issuer API call — never from user input, never from local
 * calculation. If the Issuer call returns null, we do nothing.
 *
 * Drift ≥$10 triggers an admin warning (execution_log + reportWarning). Every
 * call logs an execution_log row for observability.
 */

import { Pool, PoolClient } from 'pg'
import { syncIssuerBalance } from './issuers'
import { reportWarning } from './error-reporter'

const DRIFT_ALERT_THRESHOLD_USD = 10

// Session 27 — rate-limit backoff. SD3 API throttles at ~3-5 req/s per key.
// Our 3 write-through paths (GET /cards, debit, sweep) were hammering the
// API, and prod logs show 429/503 was the dominant response for 3+ days,
// leaving users with stale balances forever. We now track consecutive
// failures in-memory per process and short-circuit until cooldown expires.
const BACKOFF_THRESHOLD_FAILURES = 3  // after this many consecutive failures…
const BACKOFF_DURATION_MS = 5 * 60 * 1000  // …skip calls for 5 min
let consecutiveFailures = 0
let backoffUntil = 0

export type SyncSource = 'get_cards' | 'debit' | 'sweep' | 'withdrawal-gate' | 'buy-from-card'

export interface SyncOutcome {
  newBalance: number | null   // null if Issuer returned nothing
  oldBalance: number           // value in DB before this call
  drift: number                // abs(newBalance - oldBalance); 0 if newBalance null
  updated: boolean             // true if we wrote to cards.balance
  source: SyncSource
}

export async function syncCardBalanceFromIssuer(
  db: Pool | PoolClient,
  cardId: string,
  issuerUserId: string,
  oldBalance: number,
  source: SyncSource
): Promise<SyncOutcome> {
  const outcome: SyncOutcome = {
    newBalance: null,
    oldBalance,
    drift: 0,
    updated: false,
    source,
  }

  // Rate-limit backoff — if SD3 is currently throttling us, don't even
  // try. Spares us from dogpiling their API during their rate-limit
  // window AND spares our execution_log from noise. Serves cached balance.
  if (Date.now() < backoffUntil) {
    await logSync(db, cardId, source, outcome, 'skipped', `in_backoff ${Math.ceil((backoffUntil - Date.now()) / 1000)}s remaining (after ${consecutiveFailures} consecutive failures)`)
    return outcome
  }

  let issuerBalanceCents: number | null = null
  try {
    issuerBalanceCents = await syncIssuerBalance(issuerUserId)
    // Reset the failure counter on success
    consecutiveFailures = 0
  } catch (err: any) {
    const statusCode = err?.response?.status
    const isRateLimited = statusCode === 429 || statusCode === 503
    if (isRateLimited) {
      consecutiveFailures++
      if (consecutiveFailures >= BACKOFF_THRESHOLD_FAILURES) {
        backoffUntil = Date.now() + BACKOFF_DURATION_MS
        console.warn(`[card-balance-sync] SD3 API 429/503 ×${consecutiveFailures} — entering backoff for ${BACKOFF_DURATION_MS / 1000 / 60}min`)
      }
    }
    await logSync(db, cardId, source, outcome, 'failed', err.message?.slice(0, 200) || 'issuer_fetch_failed')
    return outcome
  }

  if (issuerBalanceCents === null) {
    await logSync(db, cardId, source, outcome, 'skipped', 'Issuer returned null')
    return outcome
  }

  const issuerBalanceUsd = issuerBalanceCents / 100
  outcome.newBalance = issuerBalanceUsd
  outcome.drift = Math.abs(issuerBalanceUsd - oldBalance)

  if (outcome.drift < 0.01) {
    // No meaningful change — skip write, skip log noise
    return outcome
  }

  // High-drift alert: admin should investigate why our cache drifted this far
  if (outcome.drift >= DRIFT_ALERT_THRESHOLD_USD) {
    await reportWarning(
      'issuer',
      'balance_drift_high',
      cardId,
      `Balance drift $${outcome.drift.toFixed(2)} exceeds $${DRIFT_ALERT_THRESHOLD_USD} threshold. Issuer=$${issuerBalanceUsd.toFixed(2)}, cached=$${oldBalance.toFixed(2)}, source=${source}`
    ).catch(() => {})
  }

  const balanceSource = `issuer_sync:${source}`
  await db.query(
    `UPDATE cards SET
       balance = $1,
       balance_synced_at = now(),
       balance_last_drift = $2,
       balance_source = $3
     WHERE id = $4`,
    [issuerBalanceUsd, outcome.drift, balanceSource, cardId]
  )
  outcome.updated = true

  await logSync(db, cardId, source, outcome, 'success', null)
  return outcome
}

/**
 * Expose current backoff state for admin observability. Called by the
 * /admin/api/sd3-health endpoint so operators can see when we're throttled.
 */
export function getBackoffState(): {
  in_backoff: boolean
  backoff_remaining_sec: number
  consecutive_failures: number
} {
  const now = Date.now()
  return {
    in_backoff: now < backoffUntil,
    backoff_remaining_sec: Math.max(0, Math.ceil((backoffUntil - now) / 1000)),
    consecutive_failures: consecutiveFailures,
  }
}

async function logSync(
  db: Pool | PoolClient,
  cardId: string,
  source: SyncSource,
  outcome: SyncOutcome,
  status: 'success' | 'failed' | 'skipped',
  errorMessage: string | null
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
       VALUES (gen_random_uuid(), 'issuer_sync', $1, $2, $3, NULL, $4, $5, now())`,
      [
        cardId,
        `balance_sync:${source}`,
        status,
        outcome.newBalance !== null
          ? `drift=$${outcome.drift.toFixed(2)} issuer=$${outcome.newBalance.toFixed(2)} cached=$${outcome.oldBalance.toFixed(2)}`
          : `issuer returned null (cached=$${outcome.oldBalance.toFixed(2)})`,
        errorMessage,
      ]
    )
  } catch {
    // Logging must not block the sync path
  }
}

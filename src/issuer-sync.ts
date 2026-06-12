/**
 * ─── ISSUER TRANSACTION SYNC ─────────────────────────────────────────────────
 *
 * Pulls Visa spend data from SD3's /transactions endpoint and upserts into
 * card_transactions. Complements the webhook push path: whatever the webhook
 * missed, the sync pulls. When both see the same event (same issuer_transaction_id),
 * we flip source_verified=true as a trust signal.
 *
 * Cadence (from execution-dispatch sweep): every 60s loop, but per-user throttled
 * to a 15-minute interval via users.last_tx_synced_at.
 *
 * Pagination: uses SD3's postedAfter + cursor per Integration Guide §5.3.
 */

import { Pool, PoolClient } from 'pg'
import { getIssuerTransactionsPage } from './issuers'
import { extractEventData, mapSd3SpendToCardTx, CardTxInsert } from './issuer-mapping'
import { reportError, reportWarning } from './error-reporter'
import { sendThresholdAlertEmail } from './email'

export interface SyncSkipDiagnostic {
  reason:
    | 'envelope_unrecognized'
    | 'wrong_resource'
    | 'collateral_skipped'
    | 'no_sd3_card_id'
    | 'card_not_linked'
    | 'no_issuer_transaction_id'
  /** Truncated raw SD3 item (first 1KB JSON) — enough to diagnose, not enough to bloat. */
  raw?: any
  /** Extra context, e.g. the cardId that wasn't found. */
  detail?: string
}

export interface SyncResult {
  userId: string
  inserted: number
  updated: number
  skipped: number
  pages: number
  error?: string
  /**
   * Per-item skip diagnostics. Populated only when `withDiagnostics: true` is
   * passed to syncIssuerTransactions — the cron path leaves it undefined to
   * keep memory bounded under load. Admin/debug endpoints opt in to surface
   * which SD3 items were rejected and why.
   */
  diagnostics?: SyncSkipDiagnostic[]
}

const PAGE_SIZE = 100
const MAX_PAGES = 20  // safety cap — 2000 events per sync run is plenty

/**
 * Pull new Visa transactions for a user from SD3 and upsert into card_transactions.
 *
 * @param userId  Our internal user id (users.id)
 * @param opts.withDiagnostics  If true, populate result.diagnostics with one entry
 *                              per skipped SD3 item explaining why. Used by the admin
 *                              debug endpoint; cron-path leaves it off.
 */
export async function syncIssuerTransactions(
  db: Pool,
  userId: string,
  opts: { withDiagnostics?: boolean; forceFullPull?: boolean } = {}
): Promise<SyncResult> {
  const result: SyncResult = { userId, inserted: 0, updated: 0, skipped: 0, pages: 0 }
  const diagnostics: SyncSkipDiagnostic[] = []
  const recordSkip = (d: SyncSkipDiagnostic) => {
    if (opts.withDiagnostics) {
      // Cap the diagnostics list so a noisy SD3 response can't blow up memory.
      if (diagnostics.length < 100) diagnostics.push(d)
    }
  }
  const truncate = (obj: any) => {
    if (!opts.withDiagnostics || obj == null) return undefined
    try {
      const s = JSON.stringify(obj)
      return s.length > 1024 ? JSON.parse(s.slice(0, 1024) + '"}') : obj
    } catch {
      return { _unserializable: true }
    }
  }

  // Look up SD3 user id + since-cursor
  const userRes = await db.query(
    `SELECT id, sd3_user_id, issuer_user_id, last_tx_synced_at
     FROM users WHERE id = $1`,
    [userId]
  )
  if (!userRes.rows[0]) {
    result.error = 'user_not_found'
    return result
  }
  const user = userRes.rows[0]
  const sd3UserId: string | null = user.sd3_user_id || user.issuer_user_id
  if (!sd3UserId) {
    result.error = 'no_sd3_user_id'
    return result
  }

  // S35 M11 Day-3 evening: 24h lookback buffer. Earlier today (post-incident
  // fix) Richard noticed several Visa spends synced but Krispy Kreme didn't.
  // Symptom matches the watermark-too-tight failure mode: SD3 posts the
  // transaction with a `postedAt` that pre-dates when it actually appeared
  // in their /transactions feed (delayed posting, pending→posted transitions,
  // or clock skew between issuer/processor). When `postedAfter` is set to
  // exactly `last_tx_synced_at`, any tx posted-dated to before that point
  // gets filtered out forever.
  //
  // The fix: re-fetch the last 24h on every sync. Existing transactions are
  // upserted into card_transactions via the unique index on
  // issuer_transaction_id (migration 046 v2) — duplicates are no-ops.
  // Cost: ~100 extra SD3 API calls per active user per day. Accuracy:
  // catches any transaction that retroactively appears within 24h of its
  // SD3-claimed postedAt timestamp.
  const LOOKBACK_MS = 24 * 60 * 60 * 1000  // 24h
  const postedAfter: string | undefined = opts.forceFullPull
    ? undefined
    : user.last_tx_synced_at
      ? new Date(new Date(user.last_tx_synced_at).getTime() - LOOKBACK_MS).toISOString()
      : undefined

  let cursor: string | null = null
  let pages = 0

  try {
    do {
      const page = await getIssuerTransactionsPage(sd3UserId, {
        postedAfter,
        cursor: cursor || undefined,
        limit: PAGE_SIZE,
      })
      pages++
      result.pages = pages

      for (const evt of page.items) {
        const extracted = extractEventData(evt) || extractEventDataFromBareSpend(evt)
        if (!extracted) {
          result.skipped++
          recordSkip({ reason: 'envelope_unrecognized', raw: truncate(evt) })
          continue
        }
        if (extracted.resource !== 'transaction') {
          result.skipped++
          recordSkip({ reason: 'wrong_resource', raw: truncate(evt), detail: `resource=${extracted.resource}` })
          continue
        }
        const sd3Type = (extracted.data?.type || '').toLowerCase()
        // Skip collateral (monitor owns the deposit path)
        if (sd3Type === 'collateral') {
          result.skipped++
          recordSkip({ reason: 'collateral_skipped', raw: truncate(evt) })
          continue
        }

        const sd3CardId: string | undefined = extracted.data?.spend?.cardId
          || extracted.data?.fee?.cardId
          || extracted.data?.payment?.cardId
          || extracted.data?.cardId

        // Day-4 fix: SD3 `payment`-type events (USDC-bridge top-ups credited
        // to the user's card) are user-scoped, not card-scoped — their
        // payload has `payment.userId` but no `payment.cardId`. Skipping
        // them stranded all card-funding income forever (Richard's overview
        // chart read $0 income because every top-up was being silently
        // dropped). For these we fall back to the user's primary
        // issuer-linked card. Spend / fee / cardId-bearing events keep the
        // strict cardId match — only the no-cardId-payment case relaxes.
        let dbCardId: string | undefined
        if (sd3CardId) {
          const cardRes = await db.query(
            `SELECT id FROM cards WHERE issuer_card_id = $1 AND user_id = $2 LIMIT 1`,
            [sd3CardId, userId]
          )
          if (!cardRes.rows[0]) {
            await reportWarning(
              'issuer',
              'sync_unknown_card',
              sd3CardId,
              `Sync found SD3 card id not linked to user ${userId}`
            )
            result.skipped++
            recordSkip({ reason: 'card_not_linked', raw: truncate(evt), detail: `sd3CardId=${sd3CardId}` })
            continue
          }
          dbCardId = cardRes.rows[0].id
        } else if (sd3Type === 'payment') {
          // No cardId in payload — fall back to the user's primary
          // issuer-linked card. ORDER BY created_at picks the first one if
          // the user has multiple (rare). Phantom rows excluded by the
          // issuer_card_id filter so credits don't accidentally land on
          // demo-stack cards.
          const cardRes = await db.query(
            `SELECT id FROM cards WHERE user_id = $1 AND issuer_card_id IS NOT NULL ORDER BY created_at LIMIT 1`,
            [userId]
          )
          if (!cardRes.rows[0]) {
            result.skipped++
            recordSkip({ reason: 'card_not_linked', raw: truncate(evt), detail: 'payment with no cardId and user has no issuer-linked card' })
            continue
          }
          dbCardId = cardRes.rows[0].id
        } else {
          result.skipped++
          recordSkip({ reason: 'no_sd3_card_id', raw: truncate(evt), detail: `type=${sd3Type}` })
          continue
        }

        // TS narrowing: every reachable path above either assigned dbCardId
        // or `continue`'d.
        const row = mapSd3SpendToCardTx(extracted.data, dbCardId as string, userId)
        if (!row.issuerTransactionId) {
          result.skipped++
          recordSkip({ reason: 'no_issuer_transaction_id', raw: truncate(evt) })
          continue
        }

        const outcome = await upsertCardTransaction(db, row, /* viaSync */ true)
        if (outcome === 'inserted') result.inserted++
        else if (outcome === 'updated') result.updated++
        else result.skipped++
      }

      cursor = page.nextCursor
    } while (cursor && pages < MAX_PAGES)

    // Only advance the watermark once the full pagination succeeded.
    await db.query(
      `UPDATE users SET last_tx_synced_at = now() WHERE id = $1`,
      [userId]
    )
  } catch (err: any) {
    result.error = err.message?.slice(0, 200) || 'sync_failed'
    await reportError('issuer', 'sync_transactions', userId, `Issuer tx sync failed`, err)
  }

  if (opts.withDiagnostics) result.diagnostics = diagnostics
  return result
}

/**
 * Some SD3 responses for /transactions return bare transaction objects (no envelope).
 * This reshapes them into the { resource, action, data } form expected by mappers.
 */
function extractEventDataFromBareSpend(tx: any): { resource: string; action: string; data: any; eventId: string | null } | null {
  if (!tx || typeof tx !== 'object') return null
  // Heuristic — a bare transaction has a type field matching our known set
  const type = (tx.type || '').toLowerCase()
  if (!['spend', 'fee', 'payment', 'collateral'].includes(type)) return null
  return {
    resource: 'transaction',
    action: 'completed',
    data: tx,
    eventId: tx.id || null,
  }
}

type UpsertOutcome = 'inserted' | 'updated' | 'skipped'

/**
 * Idempotent upsert keyed on issuer_transaction_id. Shared by webhook handler
 * and sync pull — when both see the same event, source_verified flips true.
 *
 * Detailed on-conflict diff is logged to execution_log only when meaningful
 * fields changed (status or amount); zero-diff updates are silent.
 */
export async function upsertCardTransaction(
  db: Pool | PoolClient,
  row: CardTxInsert,
  viaSync: boolean
): Promise<UpsertOutcome> {
  // Look up existing row for conflict-diff logging
  const existingRes = await db.query(
    `SELECT id, status, amount, merchant_name, source_verified
     FROM card_transactions WHERE issuer_transaction_id = $1 LIMIT 1`,
    [row.issuerTransactionId]
  )
  const existing = existingRes.rows[0]

  if (existing) {
    const statusChanged = existing.status !== row.status
    const amountChanged = Number(existing.amount) !== row.amount
    const wouldVerify = viaSync && !existing.source_verified  // sync confirms prior webhook insert

    if (!statusChanged && !amountChanged && !wouldVerify) {
      return 'skipped'
    }

    // Detailed conflict logging — captures the delta
    if (statusChanged || amountChanged) {
      try {
        await db.query(
          `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
           VALUES (gen_random_uuid(), 'issuer_webhook', $1, 'webhook_conflict_resolved', 'success', $2, now())`,
          [
            row.issuerTransactionId,
            JSON.stringify({
              old: { status: existing.status, amount: existing.amount, merchant_name: existing.merchant_name },
              new: { status: row.status, amount: row.amount, merchant_name: row.merchantName },
              via: viaSync ? 'sync' : 'webhook',
            }).slice(0, 1800),
          ]
        )
      } catch {
        // Logging must not block the upsert
      }
    }

    await db.query(
      `UPDATE card_transactions SET
         status = $1,
         amount = $2,
         merchant_name = COALESCE(merchant_name, $3),
         merchant_category_raw = COALESCE(merchant_category_raw, $4),
         category = $5,
         source_verified = CASE WHEN $6::boolean THEN true ELSE source_verified END,
         updated_at = now()
       WHERE issuer_transaction_id = $7`,
      [
        row.status,
        row.amount,
        row.merchantName,
        row.merchantCategoryRaw,
        row.category,
        wouldVerify,
        row.issuerTransactionId,
      ]
    )
    return 'updated'
  }

  // S35 M11 incident hardening: explicit `WHERE issuer_transaction_id IS NOT NULL`
  // on the ON CONFLICT predicate. This makes the upsert work against EITHER a
  // partial unique index (migration 016 shape: `... WHERE issuer_transaction_id
  // IS NOT NULL`) OR a non-partial one (migration 046 shape) — Postgres arbiter
  // inference accepts a non-partial index as a superset of any predicate.
  // Without this, a fresh DB that ran only migration 016 fails every upsert
  // with "no unique or exclusion constraint matching the ON CONFLICT
  // specification" — the exact incident that bit us on Day-2.
  //
  // We deliberately do NOT coerce empty-string issuer_transaction_id to NULL
  // here: that would create an asymmetry with the existing-row SELECT above
  // (which still does `WHERE issuer_transaction_id = $1`), breaking dedup for
  // any caller that somehow passed empty string. Both the sync path and the
  // webhook path filter empty strings upstream, so this defensive note is the
  // safety check.
  await db.query(
    `INSERT INTO card_transactions (
        id, card_id, user_id, name, type, amount, is_incoming, category, status,
        issuer_transaction_id, merchant_category_raw, merchant_name,
        transaction_type, source_verified,
        created_at, date, updated_at
     ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13,
        now(), $14, now()
     )
     ON CONFLICT (issuer_transaction_id) WHERE issuer_transaction_id IS NOT NULL DO NOTHING`,
    [
      row.cardId, row.userId,
      row.name, row.type, row.amount, row.isIncoming, row.category, row.status,
      row.issuerTransactionId, row.merchantCategoryRaw, row.merchantName,
      row.transactionType, row.sourceVerified,
      row.occurredAt,
    ]
  )

  // Day-5 fix: spend-threshold alert on the production sync path. The direct
  // POST /card-transactions handler in nuro-routes.ts:1540 already fires this
  // alert, but real transactions arrive via SD3 webhook + sync, both of which
  // route through THIS function — and previously skipped the check entirely.
  // So the user's "Spend Threshold Alert" setting persisted but never
  // produced an alert on a real charge. Best-effort; never blocks the upsert.
  //
  // Debits only — incoming top-ups (USDC bridge, payment events) shouldn't
  // trigger spend alerts. row.amount is signed (negative for purchase/fee),
  // so we compare against the absolute value.
  if (!row.isIncoming) {
    try {
      // Auto-upsert card_controls so the threshold check has a row to read.
      // Mirrors the auto-upsert in POST /card-transactions; kept here for
      // when the controls row hasn't been created yet (first transaction).
      await db.query(
        `INSERT INTO card_controls (card_id, user_id) VALUES ($1, $2) ON CONFLICT (card_id) DO NOTHING`,
        [row.cardId, row.userId]
      )
      const ctrlRes = await db.query(
        `SELECT alert_threshold, alert_enabled FROM card_controls WHERE card_id = $1`,
        [row.cardId]
      )
      const ctrl = ctrlRes.rows[0]
      const absAmount = Math.abs(Number(row.amount))
      if (ctrl && ctrl.alert_enabled && Number(ctrl.alert_threshold) > 0 && absAmount >= Number(ctrl.alert_threshold)) {
        const merchant = (row.merchantName || row.name || 'merchant').toString().trim()
        await db.query(
          `INSERT INTO card_alerts (id, card_id, user_id, alert_type, amount, description)
           VALUES (gen_random_uuid(), $1, $2, 'high_value', $3, $4)`,
          [
            row.cardId, row.userId, absAmount,
            `High-value transaction: $${absAmount.toFixed(2)} at ${merchant} — category=${row.category || 'other'}`,
          ]
        )

        // Day-5: also email the registered account so the alert reaches the
        // user even when they're not in the dashboard. Pulls email + last4
        // in one query. sendThresholdAlertEmail no-ops when RESEND_API_KEY
        // isn't set (dev / pre-config); audit row records both outcomes.
        try {
          const userInfo = await db.query(
            `SELECT u.email, c.card_last_4
               FROM users u
               LEFT JOIN cards c ON c.id = $1
              WHERE u.id = $2
              LIMIT 1`,
            [row.cardId, row.userId]
          )
          const recipient = userInfo.rows[0]?.email
          const last4 = userInfo.rows[0]?.card_last_4 ?? null
          if (recipient) {
            const result = await sendThresholdAlertEmail({
              email: recipient,
              cardLast4: last4,
              amount: absAmount,
              threshold: Number(ctrl.alert_threshold),
              merchant,
              category: row.category || 'other',
              occurredAt: row.occurredAt instanceof Date ? row.occurredAt : new Date(),
            })
            await db.query(
              `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
               VALUES ('card', $1, 'threshold_email', $2, $3)`,
              [
                String(row.cardId).slice(0, 100),
                result.ok ? 'success' : 'skipped',
                JSON.stringify({
                  to: String(recipient).slice(0, 80),
                  amount: absAmount,
                  threshold: Number(ctrl.alert_threshold),
                  detail: result.detail,
                }).slice(0, 1800),
              ]
            ).catch(() => {})
          }
        } catch (emailErr: any) {
          console.warn('[issuer-sync] threshold email send failed:', emailErr?.message)
        }
      }
    } catch (err: any) {
      console.warn('[issuer-sync] spend-threshold alert insert failed:', err?.message)
    }
  }
  return 'inserted'
}

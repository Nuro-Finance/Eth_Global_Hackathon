/**
 * ─── OPS ALERTS — Sprint 6.5 Observability ───────────────────────────────────
 *
 * Cron that pings admin Telegram when transactions get stuck.
 *
 * Rule: status = 'pending' AND created_at < now() - 30 minutes
 * AND not already alerted (dedup via execution_log).
 *
 * Runs every 10 minutes. De-dup key = (entity_type='ops_alert',
 * action='stuck_pending', entity_id=<tx_id>). Once a tx is alerted we
 * never re-alert for the same tx id, so the admin channel stays clean.
 *
 * Reuses the bot token + ADMIN_CHAT_ID already wired into the growth
 * agent (TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID). Silent no-op if
 * either env var is missing — ops alerts are best-effort, they must
 * never take down the poller.
 *
 * CHAIN_ID_TO_NAME is inlined (not imported from FE) so this module
 * stays server-side only.
 */

import type { Pool } from 'pg'
import { sendTelegramMessage } from './lib/telegram'
import { CONFIG } from './config'

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''

// Session 26 polish — when monitor is paused (POLL_INTERVAL_MS > 1h),
// "pending > 30min" is expected behavior, not an incident. Ops alerts
// should hush until we flip back to active polling.
const MONITOR_PAUSED = CONFIG.POLL_INTERVAL_MS > 60 * 60 * 1000

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BSC',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
}

function chainLabel(id: number | null | undefined): string {
  if (id === null || id === undefined) return 'unknown'
  return CHAIN_NAMES[id] || `chain-${id}`
}

/**
 * Scan for stuck pending transactions. For each one not yet alerted,
 * fire a Telegram message to the admin channel and record the alert
 * in execution_log so we never re-alert the same tx.
 */
export async function checkStuckPendingTxs(db: Pool): Promise<{
  scanned: number
  alerted: number
  skipped: number
}> {
  if (!ADMIN_CHAT_ID) {
 // Env not configured — skip silently. First boot after a key rotation
 // shouldn't spam the log.
    return { scanned: 0, alerted: 0, skipped: 0 }
  }

  if (MONITOR_PAUSED) {
 // Monitor-paused mode: pending rows may sit for hours by design.
 // Don't fire false-positive stuck alerts. Resume when POLL_INTERVAL_MS
 // drops back under 1h.
    return { scanned: 0, alerted: 0, skipped: 0 }
  }

  let scanned = 0
  let alerted = 0
  let skipped = 0

  try {
 // Pull stuck pending txs. LEFT JOIN execution_log on (ops_alert,
 // stuck_pending, tx_id) so we can filter out already-alerted rows
 // in one query instead of N+1.
    const result = await db.query(
      `SELECT t.id, t.user_id, t.source_chain, t.dest_chain, t.token,
              t.amount, t.route, t.created_at,
              EXTRACT(EPOCH FROM (now() - t.created_at))::int AS age_sec,
              el.id AS alerted_id
       FROM transactions t
       LEFT JOIN execution_log el
         ON el.entity_type = 'ops_alert'
        AND el.action = 'stuck_pending'
        AND el.entity_id = t.id::text
       WHERE t.status = 'pending'
         AND t.created_at < now() - interval '30 minutes'
         AND t.created_at > now() - interval '48 hours'
       ORDER BY t.created_at ASC
       LIMIT 20`
    )

    scanned = result.rowCount || 0

    for (const row of result.rows) {
      if (row.alerted_id) {
        skipped++
        continue
      }

      const ageMin = Math.round(row.age_sec / 60)
      const src = chainLabel(row.source_chain)
      const dst = chainLabel(row.dest_chain)
      const amt = Number(row.amount).toFixed(4)
      const route = row.route || 'unknown'
      const userShort = String(row.user_id || '').slice(0, 8)

      const text =
        `⚠️ <b>Stuck pending transaction</b>\n\n` +
        `<b>Age:</b> ${ageMin} min\n` +
        `<b>Route:</b> ${src} → ${dst} (${route})\n` +
        `<b>Amount:</b> ${amt} ${row.token || 'USDC'}\n` +
        `<b>User:</b> <code>${userShort}…</code>\n` +
        `<b>Tx ID:</b> <code>${row.id}</code>\n\n` +
        `Investigate in admin console → Dashboard → Deposit Funnel.`

      const sent = await sendTelegramMessage(ADMIN_CHAT_ID, text)

 // Always record the dedup row — even if Telegram send failed,
 // we don't want to retry-spam. Operator can re-check via admin
 // console; rate-limiting wins over completeness here.
      await db.query(
        `INSERT INTO execution_log
           (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES
           (gen_random_uuid(), 'ops_alert', $1, 'stuck_pending', $2, $3, now())`,
        [
          row.id,
          sent ? 'success' : 'failed',
          `age=${ageMin}min route=${src}->${dst} amount=${amt} ${row.token}`,
        ]
      ).catch(err => {
        console.error('[ops-alerts] Failed to write dedup row:', err.message?.slice(0, 80))
      })

      if (sent) alerted++
    }

    if (scanned > 0) {
      console.log(
        `[ops-alerts] Stuck pending scan: ${scanned} found, ${alerted} alerted, ${skipped} already-alerted`
      )
    }
  } catch (err: any) {
    console.error('[ops-alerts] Scan error:', err.message?.slice(0, 100))
  }

  return { scanned, alerted, skipped }
}

/**
 * Boot the ops-alerts cron. Safe to call at startup — will no-op if
 * TELEGRAM_ADMIN_CHAT_ID is unset. Interval: every 10 minutes.
 */
export function startOpsAlerts(db: Pool): void {
  if (!ADMIN_CHAT_ID) {
    console.log('[ops-alerts] Disabled — TELEGRAM_ADMIN_CHAT_ID not set')
    return
  }

  if (MONITOR_PAUSED) {
    console.log(`[ops-alerts] Enabled but hushed — monitor is paused (POLL_INTERVAL_MS=${CONFIG.POLL_INTERVAL_MS}ms). Scans will no-op until poll resumes under 1h.`)
 // Still start the interval so we auto-resume when env changes on
 // restart — the scan self-checks MONITOR_PAUSED each cycle (caller
 // would need to re-import CONFIG to pick it up, but at boot time
 // this is correct).
  }

 // First scan 2 min after boot (let the system settle), then every 10 min.
  setTimeout(() => {
    checkStuckPendingTxs(db).catch(err =>
      console.error('[ops-alerts] First scan error:', err.message?.slice(0, 80))
    )
  }, 2 * 60 * 1000)

  setInterval(() => {
    checkStuckPendingTxs(db).catch(err =>
      console.error('[ops-alerts] Periodic scan error:', err.message?.slice(0, 80))
    )
  }, 10 * 60 * 1000)

  console.log('[ops-alerts] Enabled — scanning stuck pending txs every 10 min')
}

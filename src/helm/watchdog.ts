// ─────────────────────────────────────────────────────────────────────────────
// HELM WATCHDOG — self-monitoring (HELM-CTRL-001)
//
// S31 H2. The "always watching" axis of True Helm starts with the
// realization: HELM ITSELF can fail silently. If the log-scanner
// crashes, the egress observer's interceptor doesn't get registered on
// new clients, the DB pool dies and event inserts get swallowed, etc.
//
// The watchdog runs a periodic self-check:
//   - Has Helm emitted ANY event in the last N hours? (where N is
//     calibrated against the system's observed event rate — for our
//     setup, anything > 2 hrs of total silence is suspicious)
//   - Are the per-rule modules still installed? (egress observer flag,
//     log-scanner armed flag, etc.)
//   - Does a heartbeat insert succeed? (verifies DB writability)
//
// Failures fire a "Helm is silent" Telegram alert. This is the
// canonical way operators learn Helm isn't watching anymore.
//
// HELM-CTRL-001 isn't in the original 52-rule catalog because it's
// "watching the watcher." It lives in the gjallarhorn category for
// reporting purposes. Logged via the existing logHelmEvent() so
// it shows up in the same admin event stream.

import type { Pool } from 'pg'
import { logHelmEvent } from './core'
import { sendTelegramMessage } from '../growth-agent/skills/telegram'
import { isEgressObserverInstalled } from './egress'
import { isLogScannerInstalled } from './log-scanner'

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''

// S32 calibration: bumped from 2h → 24h. With most rules in observe mode +
// the system intentionally quiet (POLL_INTERVAL_MS=86400000, observe-only
// hardening defenders), real Helm silence of <24h is a normal state,
// not a failure signal. The 2h threshold was generating ~12 false-positive
// alerts/day. Override via HELM_WATCHDOG_SILENCE_HOURS env.
const DEFAULT_SILENCE_THRESHOLD_HOURS = 24

let _lastAlertedSilenceMs = 0
// S32: dedupe to 1×/6h (was 1×/1h). Operator only needs the alert ONCE
// when silence first crosses; subsequent reminders within 6h are noise.
const ALERT_DEDUPE_MS = 6 * 60 * 60 * 1000

interface WatchdogResult {
  silenceHours: number
  egressArmed: boolean
  logScannerArmed: boolean
  heartbeatOk: boolean
  alertFired: boolean
}

/**
 * Insert a heartbeat row. Lets us distinguish "no real events" (peaceful)
 * from "events aren't reaching the DB" (problem).
 */
async function emitHeartbeat(): Promise<boolean> {
  try {
    await logHelmEvent({
      ruleId: 'HELM-CTRL',
      subject: 'watchdog heartbeat',
      context: { kind: 'heartbeat', source: 'watchdog' },
      actionOverride: 'log-only',
    })
    return true
  } catch {
    return false
  }
}

async function lastEventAgeHours(db: Pool): Promise<number> {
  try {
    const res = await db.query(
      `SELECT EXTRACT(EPOCH FROM (now() - MAX(occurred_at))) / 3600 AS hours
       FROM heimdall_events
       WHERE rule_id != 'HELM-CTRL' OR subject != 'watchdog heartbeat'`,
    )
    const h = Number(res.rows[0]?.hours)
    return Number.isFinite(h) ? h : Number.POSITIVE_INFINITY
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function thresholdHours(): number {
  const n = Number(process.env.HELM_WATCHDOG_SILENCE_HOURS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SILENCE_THRESHOLD_HOURS
}

export async function runWatchdogCycle(db: Pool): Promise<WatchdogResult> {
  const silence = await lastEventAgeHours(db)
  const egressArmed = isEgressObserverInstalled()
  const logScannerArmed = isLogScannerInstalled()
  const heartbeatOk = await emitHeartbeat()

  const result: WatchdogResult = {
    silenceHours: Number.isFinite(silence) ? Math.round(silence * 10) / 10 : 999,
    egressArmed,
    logScannerArmed,
    heartbeatOk,
    alertFired: false,
  }

  const limit = thresholdHours()
  const now = Date.now()
  const triggers: string[] = []
  if (silence > limit) triggers.push(`no events for ${result.silenceHours}h (>${limit}h threshold)`)
  if (!egressArmed) triggers.push('egress observer is NOT installed')
  if (!logScannerArmed) triggers.push('log-scanner is NOT armed')
  if (!heartbeatOk) triggers.push('heartbeat DB insert FAILED')

  if (triggers.length === 0) {
    return result
  }

  // Don't spam the operator on a sustained silence window — dedupe to
  // 1 alert / hour while the condition persists.
  if (now - _lastAlertedSilenceMs < ALERT_DEDUPE_MS) {
    return result
  }
  _lastAlertedSilenceMs = now

  const subject = `Helm watchdog: ${triggers.length} trigger(s) — ${triggers[0]}`
  void logHelmEvent({
    ruleId: 'HELM-CTRL',
    subject,
    context: {
      triggers,
      silenceHours: result.silenceHours,
      egressArmed,
      logScannerArmed,
      heartbeatOk,
      action: 'log-alert',
    },
    actionOverride: 'log-alert',
  })

  if (ADMIN_CHAT_ID) {
    const text = [
      `🔭 <b>Helm watchdog — silence detected</b>`,
      `<b>Triggers</b>:`,
      ...triggers.map((t) => `  • ${t}`),
      ``,
      `If Helm has been redeployed, this should clear within the next cycle. If not, check pm2 logs nuro-api for errors and the heimdall_events table directly.`,
    ].join('\n')
    await sendTelegramMessage(ADMIN_CHAT_ID, text, 'HTML').catch((err) =>
      console.warn(`[helm:watchdog] telegram alert failed: ${err?.message?.slice(0, 100)}`),
    )
  }
  result.alertFired = true
  return result
}

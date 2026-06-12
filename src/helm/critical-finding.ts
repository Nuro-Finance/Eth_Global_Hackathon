// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL FINDING NOTIFIER (S32)
//
// Closes the gap between "Mythos found a security issue via code review"
// and "operator has visibility + audit trail." Until S32, when an audit
// surfaced a P0 (e.g. the balance-spoof → withdraw exploit chain), the
// finding lived in chat history and a Decision Journal entry — but didn't
// hit the heimdall_events table, didn't fire Telegram, and didn't show
// in the admin Mythos POV. This module fixes that.
//
// Three integrations per call:
//   1. Insert heimdall_events row with rule_id='HELM-CRITICAL-FINDING',
//      severity='critical', context={kind:'critical-finding', ...}
//   2. Fire Telegram alert to TELEGRAM_ADMIN_CHAT_ID with red banner
//   3. Return the event id so caller can attach DJ entry / fix commit SHA
//      via a follow-up update
//
// Caller is expected to also write a Decision Journal entry (the Mythos
// memory layer) — this module doesn't write to filesystem because that's
// session-context-dependent.
//
// Idempotency: every call gets a fresh event id. If you want dedup,
// pass `dedupeKey` and the helper will skip if the same key fired in
// the last 6 hours.
//
// Usage:
//   await logCriticalFinding(db, {
//     subject: 'balance-spoof → withdraw exploit chain',
//     impact: 'authed user can drain treasury USDC',
//     locations: ['nuro-routes.ts:647', 'nuro-routes.ts:2774', 'nuro-routes.ts:3061'],
//     foundBy: 'mythos-audit-agent',
//     fixCommit: 'ef17863',
//     djEntry: '2026-04-25_006.md',
//   })
// ─────────────────────────────────────────────────────────────────────────────

import type { Pool } from 'pg'

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''
const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000  // 6 hours

const _recentDedupeKeys = new Map<string, number>()

export interface CriticalFindingInput {
  /** One-line summary, ~120 chars max. Becomes Telegram subject + DB subject. */
  subject: string
  /** What's at risk if exploited / why this is critical. 1-3 sentences. */
  impact: string
  /** File:line references for forensics. e.g. ['nuro-routes.ts:647', 'foo.ts:123']. */
  locations: string[]
  /** Who found it. 'mythos-audit-agent' / 'heimdall-rule-XXX' / 'richard' / etc. */
  foundBy: string
  /** Fix commit SHA if the patch landed before logging this. Otherwise null. */
  fixCommit?: string | null
  /** Decision Journal filename (e.g. '2026-04-25_006.md') if the operator
   *  has already written one. The DJ link surfaces in the Telegram alert. */
  djEntry?: string | null
  /** Optional dedup key. If the same key fired in the last 6h, this call
   *  is a silent no-op. Used to prevent spam if a finding fires repeatedly
   *  (e.g. a recurring scanner detection). */
  dedupeKey?: string
  /** Optional severity downgrade. Defaults to 'critical' (matches the
   *  helper's name). Pass 'high' for findings that aren't immediate-action. */
  severity?: 'critical' | 'high'
}

export interface CriticalFindingResult {
  eventId: string | null
  telegramFired: boolean
  deduped: boolean
}

export async function logCriticalFinding(
  _db: Pool,
  input: CriticalFindingInput,
): Promise<CriticalFindingResult> {
  // Dedup check.
  if (input.dedupeKey) {
    const last = _recentDedupeKeys.get(input.dedupeKey)
    if (last && Date.now() - last < DEDUPE_WINDOW_MS) {
      return { eventId: null, telegramFired: false, deduped: true }
    }
    _recentDedupeKeys.set(input.dedupeKey, Date.now())
    // Cap the dedup map size — drop oldest if > 200 entries.
    if (_recentDedupeKeys.size > 200) {
      const oldest = Array.from(_recentDedupeKeys.entries()).sort((a, b) => a[1] - b[1])[0]
      if (oldest) _recentDedupeKeys.delete(oldest[0])
    }
  }

  const severity = input.severity ?? 'critical'
  let eventId: string | null = null

  // Step 1: insert heimdall_events row directly. Uses HELM-CTRL as the
  // catalog rule_id (matches the watchdog pattern for control-plane
  // events that aren't in the 50-rule catalog). The kind='critical-finding'
  // distinguishes from other HELM-CTRL events at query time.
  try {
    const context = {
      kind: 'critical-finding',
      impact: input.impact.slice(0, 1000),
      locations: input.locations.slice(0, 20),
      foundBy: input.foundBy,
      fixCommit: input.fixCommit ?? null,
      djEntry: input.djEntry ?? null,
      dedupeKey: input.dedupeKey ?? null,
    }
    const r = await _db.query<{ id: string }>(
      `INSERT INTO heimdall_events
         (rule_id, category, severity, action, agent_id, subject, context)
       VALUES ('HELM-CTRL', 'gjallarhorn', $1, 'log-alert', $2, $3, $4::jsonb)
       RETURNING id`,
      [
        severity,
        input.foundBy.slice(0, 64),
        input.subject.slice(0, 128),
        JSON.stringify(context),
      ],
    )
    eventId = r.rows[0]?.id ?? null
    process.stderr.write(`[helm] HELM-CRITICAL-FINDING ${severity.toUpperCase()} log-alert — ${input.subject.slice(0, 120)}\n`)
  } catch (err: any) {
    console.error(`[critical-finding] heimdall_events insert failed: ${err?.message?.slice(0, 200)}`)
  }

  // Step 2: fire Telegram. Best-effort — log failure but don't throw.
  let telegramFired = false
  if (ADMIN_CHAT_ID) {
    try {
      const { sendTelegramMessage } = await import('../growth-agent/skills/telegram')
      const icon = severity === 'critical' ? '🚨' : '⚠️'
      const text = [
        `${icon} <b>${severity === 'critical' ? 'CRITICAL FINDING' : 'HIGH-PRIORITY FINDING'}</b>`,
        ``,
        `<b>Subject</b>: ${escapeHtml(input.subject.slice(0, 200))}`,
        ``,
        `<b>Impact</b>: ${escapeHtml(input.impact.slice(0, 500))}`,
        ``,
        `<b>Locations</b>:`,
        ...input.locations.slice(0, 10).map((l) => `  • <code>${escapeHtml(l)}</code>`),
        ``,
        `<b>Found by</b>: <code>${escapeHtml(input.foundBy)}</code>`,
        input.fixCommit ? `<b>Fix commit</b>: <code>${escapeHtml(input.fixCommit)}</code>` : '',
        input.djEntry ? `<b>Decision Journal</b>: <code>${escapeHtml(input.djEntry)}</code>` : '',
      ].filter(Boolean).join('\n')
      await sendTelegramMessage(ADMIN_CHAT_ID, text, 'HTML')
      telegramFired = true
    } catch (err: any) {
      console.warn(`[critical-finding] telegram alert failed: ${err?.message?.slice(0, 200)}`)
    }
  }

  return { eventId, telegramFired, deduped: false }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

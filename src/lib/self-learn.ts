/**
 * .self_learn signal emission + reader helpers.
 *
 * Spec: AFI/Neural Net/Claude Memory/Self-Learn Financial Neural Net Spec.md
 * Schema: migration 052_self_learn_signals.sql
 *
 * Server-side signal emission is the COMPLEMENT to the DB triggers in 052.
 * Triggers cover events that naturally land in a CREATE/UPDATE on cards,
 * card_agent_messages, users.kyc_status. For other events (reload completed,
 * withdraw completed, plan upgraded, balance shift, etc.) we emit explicitly
 * via emitSignal() at the relevant code path.
 *
 * Signal types are stable strings. Adding new ones is just convention - the
 * DB has no enum, so new code can start writing a new signal_type without a
 * migration. Document the new type in this file's SIGNAL_TYPES block so
 * future code can find it.
 */

import type { Pool } from 'pg'

/**
 * Canonical list of signal types in use. Update when adding new ones.
 * Format: 'domain.verb' (lowercase, dot-separated).
 */
export const SIGNAL_TYPES = {
  CARD_CREATED:           'card.created',           // trigger (cards)
  CARD_FROZEN:            'card.frozen',
  CARD_UNFROZEN:          'card.unfrozen',
  CARD_LIMIT_CHANGED:     'card.limit_changed',
  CARD_PERSONA_CHANGED:   'card.persona_changed',
  CARD_CHAT_MESSAGE:      'card.chat_message',      // trigger (card_agent_messages)
  CARD_MEMORY_RESET:      'card.memory_reset',
  TRANSACTION_POSTED:     'transaction.posted',
  BALANCE_SHIFT_50PCT:    'balance.shift_50pct',
  KYC_STARTED:            'kyc.started',
  KYC_COMPLETED:          'kyc.completed',          // trigger (users.kyc_status)
  RELOAD_COMPLETED:       'reload.completed',
  WITHDRAW_COMPLETED:     'withdraw.completed',
  WALLET_CONNECTED:       'wallet.connected',
  PLAN_UPGRADED:          'plan.upgraded',
  PLAN_DOWNGRADED:        'plan.downgraded',
} as const

export type SignalType = (typeof SIGNAL_TYPES)[keyof typeof SIGNAL_TYPES] | string

export type SignalSource = 'server' | 'webhook' | 'user_action' | 'mcp_tool' | 'scheduled'

interface EmitSignalArgs {
  db: Pool
  userId: string
  type: SignalType
  payload?: Record<string, unknown>
  source?: SignalSource
}

/**
 * Append a single signal row. Idempotent at the DB layer (append-only); the
 * caller decides whether to deduplicate at the application layer.
 *
 * Fire-and-forget pattern: the caller MUST NOT await this in latency-critical
 * paths. Use voidSafe() below for those.
 */
export async function emitSignal(args: EmitSignalArgs): Promise<void> {
  const { db, userId, type, payload = {}, source = 'server' } = args
  try {
    await db.query(
      `INSERT INTO user_signals (user_id, signal_type, payload, source)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [userId, type, JSON.stringify(payload), source],
    )
  } catch (err) {
 // .self_learn must never block a user-facing path. Log + swallow.
    console.warn(
      `[self_learn] emitSignal failed (user=${userId} type=${type}):`,
      (err as Error)?.message?.slice(0, 200),
    )
  }
}

/**
 * Fire-and-forget wrapper. Use in latency-critical paths so signal emission
 * never blocks user response time. Example:
 *
 * voidSafe(emitSignal({ db, userId, type: 'reload.completed', payload: {...} }))
 *
 * Equivalent to `void emitSignal(...).catch(() => {})` but cleaner at the
 * call site.
 */
export function voidSafe(promise: Promise<unknown>): void {
  promise.catch((err) => {
    console.warn('[self_learn] background signal failed:', (err as Error)?.message?.slice(0, 200))
  })
}

// ─── Reader helpers (for chat context injection + report generation) ───────

/**
 * Single signal row as returned to consumers. Note we never expose the raw
 * `payload` JSONB to MCP/clients - payload can carry transaction amounts,
 * merchant names, etc. that are user-private. Internal callers (chat
 * system-prompt builder, report generator) get the full row.
 */
export interface UserSignal {
  id: number
  user_id: string
  signal_type: string
  payload: Record<string, unknown>
  source: string
  created_at: string
}

/**
 * Load the most recent N signals for a user. Default 30 - enough to give the
 * chat agent context about recent behavior without bloating the prompt.
 * Reverse-chronological (newest first); callers can re-sort.
 */
export async function loadRecentSignals(
  db: Pool,
  userId: string,
  limit = 30,
): Promise<UserSignal[]> {
  try {
    const res = await db.query(
      `SELECT id, user_id, signal_type, payload, source, created_at
       FROM user_signals
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    )
    return res.rows as UserSignal[]
  } catch (err) {
    console.warn(
      `[self_learn] loadRecentSignals failed (user=${userId}):`,
      (err as Error)?.message?.slice(0, 200),
    )
    return []
  }
}

/**
 * Load all signals for a user since a given ISO timestamp, up to `limit`.
 * Used by the report generator to slice "weekly" / "quarterly" / "yearly"
 * windows. Returns newest first.
 *
 * Phase 2 .self_learn (2026-05-26).
 */
export async function loadSignalsInWindow(
  db: Pool,
  userId: string,
  sinceIso: string,
  limit = 500,
): Promise<UserSignal[]> {
  try {
    const res = await db.query(
      `SELECT id, user_id, signal_type, payload, source, created_at
       FROM user_signals
       WHERE user_id = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, sinceIso, limit],
    )
    return res.rows as UserSignal[]
  } catch (err) {
    console.warn(
      `[self_learn] loadSignalsInWindow failed (user=${userId} since=${sinceIso}):`,
      (err as Error)?.message?.slice(0, 200),
    )
    return []
  }
}

/**
 * Cadence → ISO timestamp for the "since" boundary. Custom cadences are
 * routed to a separate path that asks Claude to interpret the description
 * (we pass the full 365-day window in that case and let the model focus).
 */
export function cadenceToSinceIso(cadence: 'weekly' | 'quarterly' | 'yearly' | 'custom'): string {
  const now = Date.now()
  const day = 86_400_000
  switch (cadence) {
    case 'weekly':    return new Date(now - 7   * day).toISOString()
    case 'quarterly': return new Date(now - 90  * day).toISOString()
    case 'yearly':    return new Date(now - 365 * day).toISOString()
    case 'custom':    return new Date(now - 365 * day).toISOString() // full year, model interprets the user's description
  }
}

/**
 * Format a slice of signals as a compact human-readable bullet list for
 * injection into an LLM system prompt. Keeps token cost low and the LLM
 * doesn't see raw JSON. Example output:
 *
 * - 2 hours ago: chatted with Amazon Orders card ("how much spent...")
 * - yesterday: KYC completed
 * - 3 days ago: card "Hyper Liquid Agent" created
 *
 * Truncates noisy details to keep the prompt tight.
 */
export function formatSignalsForPrompt(signals: UserSignal[]): string {
  if (signals.length === 0) return '(no recent activity yet)'
  return signals
    .slice(0, 15) // hard cap regardless of input length
    .map((s) => `- ${humanizeAgo(s.created_at)}: ${humanizeSignal(s)}`)
    .join('\n')
}

function humanizeSignal(s: UserSignal): string {
  const p = s.payload || {}
  switch (s.signal_type) {
    case SIGNAL_TYPES.CARD_CREATED:
      return `card created: ${String(p.card_name || p.card_type || 'unnamed')}`
    case SIGNAL_TYPES.CARD_FROZEN:
      return `froze card ${String(p.card_name || p.card_id || '')}`
    case SIGNAL_TYPES.CARD_UNFROZEN:
      return `unfroze card ${String(p.card_name || p.card_id || '')}`
    case SIGNAL_TYPES.CARD_LIMIT_CHANGED:
      return `changed limit on ${String(p.card_name || p.card_id || '')} to $${p.new_limit || '?'}`
    case SIGNAL_TYPES.CARD_PERSONA_CHANGED:
      return `swapped agent persona to ${String(p.new_persona || '?')}`
    case SIGNAL_TYPES.CARD_CHAT_MESSAGE: {
      const snippet = String(p.snippet || '').slice(0, 80).replace(/\s+/g, ' ').trim()
      return `chatted with ${String(p.card_name || 'a card')}${snippet ? ` ("${snippet}${snippet.length >= 80 ? '...' : ''}")` : ''}`
    }
    case SIGNAL_TYPES.CARD_MEMORY_RESET:
      return `reset memory on ${String(p.card_name || p.card_id || 'a card')}`
    case SIGNAL_TYPES.TRANSACTION_POSTED:
      return `transaction: $${p.amount_usd || '?'} at ${String(p.merchant || 'unknown merchant')}`
    case SIGNAL_TYPES.BALANCE_SHIFT_50PCT:
      return `balance moved from $${p.old_balance || '?'} to $${p.new_balance || '?'}`
    case SIGNAL_TYPES.KYC_STARTED:
      return 'started identity verification'
    case SIGNAL_TYPES.KYC_COMPLETED:
      return 'cleared identity verification'
    case SIGNAL_TYPES.RELOAD_COMPLETED:
      return `reloaded ${String(p.card_name || 'a card')} with $${p.amount_usd || '?'}`
    case SIGNAL_TYPES.WITHDRAW_COMPLETED:
      return `withdrew $${p.amount_usd || '?'} from ${String(p.card_name || 'a card')}`
    case SIGNAL_TYPES.WALLET_CONNECTED:
      return `connected external wallet ${String(p.address || '').slice(0, 10)}...`
    case SIGNAL_TYPES.PLAN_UPGRADED:
      return `upgraded plan to ${String(p.new_plan || '?')}`
    case SIGNAL_TYPES.PLAN_DOWNGRADED:
      return `downgraded plan to ${String(p.new_plan || '?')}`
    default:
      return s.signal_type
  }
}

function humanizeAgo(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime()
  const now = Date.now()
  const diffMs = now - then
  const min = Math.floor(diffMs / 60_000)
  const hr = Math.floor(diffMs / 3_600_000)
  const day = Math.floor(diffMs / 86_400_000)
  if (min < 2) return 'just now'
  if (min < 60) return `${min} min ago`
  if (hr < 24) return `${hr} hr ago`
  if (day < 30) return `${day}d ago`
  return new Date(isoTimestamp).toISOString().slice(0, 10)
}

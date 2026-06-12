// ─────────────────────────────────────────────────────────────────────────────
// AGENT-BUS — inter-agent message bus (signed envelopes)
//
// S31 H2. Foundation for agent-to-agent coordination without human mediation.
// Per Marathon 8 / HELM-008: every envelope MUST be signed; verification
// happens before delivery; bad sigs fire HELM-008 critical events.
//
// API surface:
//   - publish({...}) → uuid             — sign + insert + NOTIFY
//   - subscribe(agentId, topic)         — declare interest (idempotent)
//   - unsubscribe(agentId, topic)
//   - listSubscriptions(agentId)
//   - read(agentId, opts)               — pull pending messages, verify each
//   - markDelivered(messageId)
//   - markRead(messageId)
//   - replyTo(parentId, payload, ...)   — convenience wrapper
//   - subscribeLive(agentId, topic, cb) — pg LISTEN handler for real-time
//
// Bookkeeping:
//   - On publish, signature_verified column is left NULL — verification
//     happens at READ time (not write time), so a tampered DB row gets
//     caught by every fresh reader.
//   - On read, each row is verified individually; a verify-fail logs
//     HELM-008 + does NOT include the message in the returned set.
//   - delivered_at flips on first successful read; read_at flips on
//     explicit ack from the consumer.

import type { Pool } from 'pg'
import { logHelmEvent } from '../helm'
import { ensureAgentKey, signEnvelope, verifyEnvelope } from './sign'

// ── Types ───────────────────────────────────────────────────────────────────

export interface PublishInput {
  /** Sender — must have an agent_keys row (auto-provisioned if missing). */
  fromAgentId: string
  /** Recipient — null for broadcast (subscribers filter by topic). */
  toAgentId?: string | null
  /** Topic identifier. Subscribers subscribe by topic; convention is
   *  hyphenated kebab-case ("lz-doc-drift", "high-value-tx-proposed"). */
  topic: string
  /** Arbitrary JSON payload. Stored as JSONB. Try to keep < 16KB to avoid
   *  TOAST overhead and to stay friendly to alert summaries. */
  payload: Record<string, unknown>
  /** Optional reply linkage to a parent message. */
  replyTo?: string | null
  /** Optional TTL — message reaped if not delivered+read within ttlSeconds. */
  ttlSeconds?: number | null
}

export interface PublishResult {
  id: string
  sentAt: string
}

export interface InboxMessage {
  id: string
  senderAgentId: string
  recipientAgentId: string | null
  topic: string
  payload: Record<string, unknown>
  replyTo: string | null
  sentAt: string
  signatureVerified: boolean
  keyMatched: 'current' | 'previous' | null
}

// ── topic pricing (S33 X4) ─────────────────────────────────────────────────

export interface TopicPricing {
  topic: string
  priceUsd: number
  recipientAgentId: string
  description: string | null
  active: boolean
}

/**
 * Returns active pricing for a topic, or null if free. Cached briefly
 * so high-volume bus topics don't hammer the lookup table on every
 * publish; bus traffic is dominated by free topics today.
 */
const _pricingCache = new Map<string, { row: TopicPricing | null; ts: number }>()
const PRICING_CACHE_MS = 30_000

export async function getTopicPricing(db: Pool, topic: string): Promise<TopicPricing | null> {
  const cached = _pricingCache.get(topic)
  if (cached && Date.now() - cached.ts < PRICING_CACHE_MS) return cached.row
  const r = await db.query(
    `SELECT topic, price_usd, recipient_agent_id, description, active
       FROM agent_bus_topic_pricing
      WHERE topic = $1 AND active = true`,
    [topic],
  )
  const row: TopicPricing | null = r.rows[0]
    ? {
        topic: r.rows[0].topic,
        priceUsd: Number(r.rows[0].price_usd),
        recipientAgentId: r.rows[0].recipient_agent_id,
        description: r.rows[0].description,
        active: r.rows[0].active,
      }
    : null
  _pricingCache.set(topic, { row, ts: Date.now() })
  return row
}

/** Operator-callable: invalidate the cache after a write (admin endpoints
 *  call this so the new price takes effect immediately rather than
 *  waiting up to 30s for the entry to expire). */
export function invalidateTopicPricingCache(topic?: string): void {
  if (topic) _pricingCache.delete(topic)
  else _pricingCache.clear()
}

// ── publish ────────────────────────────────────────────────────────────────

/**
 * Publish a signed message to the bus. Idempotency model: every publish
 * yields a fresh UUID (not idempotent by default); senders that need
 * idempotency should embed an idempotency_key in the payload + check
 * for prior matching messages before publishing.
 *
 * S33 X4: if the topic has active pricing in agent_bus_topic_pricing,
 * publish charges the sender (recordSpend) and credits the recipient
 * (recordRefill) — off-chain ledger debits, no on-chain settlement.
 * Sender insufficient-budget → throw InsufficientBudgetError; caller
 * decides how to surface (HTTP 402 from the route).
 */
export class InsufficientBudgetError extends Error {
  constructor(public agentId: string, public required: number) {
    super(`agent ${agentId} has insufficient budget for $${required.toFixed(4)}`)
    this.name = 'InsufficientBudgetError'
  }
}

export async function publish(db: Pool, input: PublishInput): Promise<PublishResult> {
  // S33 Tier 1 #13: scan payload text for prompt-injection patterns.
  // Agent-to-agent messages are a poisoning vector — a compromised
  // agent can send an "ignore previous instructions" payload via bus
  // and downstream agents that consume it will see it. Stringified
  // payload is the surface; per-field scanning would be more precise
  // but text-mass over the whole payload catches the common attacks.
  // Observe-only by default (HELM_INGRESS_ENFORCE flips to block).
  try {
    const { scanAndEmit } = await import('../helm/ingress-scanner')
    await scanAndEmit({
      text: JSON.stringify(input.payload).slice(0, 50_000),
      source: `bus-publish:${input.topic}`,
      agentId: input.fromAgentId,
    })
  } catch (err: any) {
    // In enforce mode, blocking findings throw. Surface back to caller
    // with the rule context so route handler can return 422.
    if (err?.action === 'block' || err?.action === 'quarantine') {
      throw err
    }
    // Non-blocking errors (DB outage on event insert) are logged but
    // shouldn't kill the publish — the bus must stay reliable even when
    // Helm observability has issues.
  }

  // Ensure sender has a key (auto-provisioned on first publish per agent).
  await ensureAgentKey(db, input.fromAgentId)

  // S33 X4: pricing check + debit. Runs BEFORE the message INSERT so a
  // payment failure doesn't leave a phantom message in the bus.
  const pricing = await getTopicPricing(db, input.topic)
  let paymentLedgerId: string | null = null
  if (pricing && pricing.priceUsd > 0) {
    // recordSpend lazy-imported to avoid pulling budgets into every
    // bus consumer that doesn't use pricing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recordSpend, recordRefill } = require('../budgets') as typeof import('../budgets')
    try {
      const spend = await recordSpend(db, {
        agentId: input.fromAgentId,
        deltaUsd: pricing.priceUsd,
        description: `bus-pay topic=${input.topic} → ${pricing.recipientAgentId}`,
      })
      paymentLedgerId = spend.ledgerId
      // Best-effort credit to recipient. If this fails (e.g. recipient has
      // no budget row yet), the sender's spend stands; operator
      // reconciles. Better than rolling back the spend half-completed.
      await recordRefill(db, {
        agentId: pricing.recipientAgentId,
        deltaUsd: pricing.priceUsd,
        description: `bus-recv topic=${input.topic} ← ${input.fromAgentId} (ledger=${spend.ledgerId})`,
        by: 'agent-bus',
      }).catch((err: Error) => {
        console.warn(
          `[agent-bus] recipient credit failed for ${pricing.recipientAgentId}: ${err?.message?.slice(0, 100)}`,
        )
      })
    } catch (err: any) {
      // recordSpend throws on bad input; budget cap exhaustion may bubble
      // depending on policy. Treat any failure as InsufficientBudget for
      // the caller's benefit — real reason in err.message.
      throw new InsufficientBudgetError(input.fromAgentId, pricing.priceUsd)
    }
  }

  // sent_at must be locked BEFORE signing — otherwise the canonical string
  // for sig is computed against a different timestamp than we INSERT.
  const sentAt = new Date().toISOString()
  const recipientAgentId = input.toAgentId ?? null
  const replyTo = input.replyTo ?? null

  // S33 X4: stash payment metadata on the payload so consumers can see
  // the audit trail at read time. Non-priced topics get an empty merge
  // (no behavior change for free messages).
  const payloadWithPayment = paymentLedgerId
    ? {
        ...input.payload,
        _payment: {
          priceUsd: pricing!.priceUsd,
          recipientAgentId: pricing!.recipientAgentId,
          ledgerId: paymentLedgerId,
        },
      }
    : input.payload

  const sig = await signEnvelope(db, {
    senderAgentId: input.fromAgentId,
    recipientAgentId,
    topic: input.topic,
    payload: payloadWithPayment,
    replyTo,
    sentAt,
  })

  const r = await db.query(
    `INSERT INTO agent_messages
       (sender_agent_id, recipient_agent_id, topic, payload,
        signature, signature_alg, sender_key_version, reply_to,
        ttl_seconds, sent_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
     RETURNING id, sent_at`,
    [
      input.fromAgentId,
      recipientAgentId,
      input.topic,
      JSON.stringify(payloadWithPayment),
      sig.signature,
      sig.signatureAlg,
      sig.senderKeyVersion,
      replyTo,
      input.ttlSeconds ?? null,
      sentAt,
    ],
  )

  // Best-effort NOTIFY — the channel name matches the topic for live
  // subscribers. Subscribers running subscribeLive() pick this up.
  // Payload kept small (just the message id; full body is in the table).
  try {
    const ch = pgChannelForTopic(input.topic)
    await db.query(`SELECT pg_notify($1, $2)`, [ch, r.rows[0].id])
  } catch {
    // NOTIFY failure shouldn't fail publish — readers polling will pick up.
  }

  return { id: r.rows[0].id, sentAt: r.rows[0].sent_at }
}

// ── subscribe / unsubscribe ─────────────────────────────────────────────────

export async function subscribe(db: Pool, agentId: string, topic: string): Promise<void> {
  await db.query(
    `INSERT INTO agent_subscriptions (agent_id, topic)
     VALUES ($1, $2)
     ON CONFLICT (agent_id, topic) DO NOTHING`,
    [agentId, topic],
  )
}

export async function unsubscribe(db: Pool, agentId: string, topic: string): Promise<void> {
  await db.query(
    `DELETE FROM agent_subscriptions WHERE agent_id = $1 AND topic = $2`,
    [agentId, topic],
  )
}

export async function listSubscriptions(db: Pool, agentId: string): Promise<string[]> {
  const r = await db.query(
    `SELECT topic FROM agent_subscriptions WHERE agent_id = $1 ORDER BY topic`,
    [agentId],
  )
  return r.rows.map((row) => row.topic)
}

// ── read inbox ──────────────────────────────────────────────────────────────

export interface ReadOptions {
  /** How many messages to return (max 100). Default 25. */
  limit?: number
  /** Only messages newer than this. Optional cursor for pagination. */
  sinceMs?: number
  /** Filter to specific topic; default: all topics this agent is subscribed to. */
  topic?: string
  /** Auto-flip delivered_at on returned messages. Default true. */
  markDeliveredOnFetch?: boolean
  /** If true, only return messages where delivered_at IS NULL. Combined with
   *  markDeliveredOnFetch=true (the default), this gives at-most-once
   *  semantics for poll-based subscribers. Default false (back-compat). */
  undeliveredOnly?: boolean
}

/**
 * Pull messages addressed to `agentId` (direct + topic-broadcast). Each
 * row's signature is verified individually; mismatches fire HELM-008
 * and are filtered from the returned set so callers only ever see
 * provably-authentic messages.
 */
export async function read(
  db: Pool,
  agentId: string,
  opts: ReadOptions = {},
): Promise<InboxMessage[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100)
  const sinceTs = opts.sinceMs ? new Date(opts.sinceMs).toISOString() : null

  // Direct messages OR subscribed-topic broadcasts.
  const where: string[] = [
    `(m.recipient_agent_id = $1 OR (m.recipient_agent_id IS NULL AND m.topic IN
        (SELECT topic FROM agent_subscriptions WHERE agent_id = $1)))`,
  ]
  const params: any[] = [agentId]
  if (sinceTs) {
    params.push(sinceTs)
    where.push(`m.sent_at > $${params.length}`)
  }
  if (opts.topic) {
    params.push(opts.topic)
    where.push(`m.topic = $${params.length}`)
  }
  if (opts.undeliveredOnly) {
    where.push(`m.delivered_at IS NULL`)
  }
  where.push(`(m.ttl_seconds IS NULL OR m.sent_at + (m.ttl_seconds || ' seconds')::interval > now())`)
  params.push(limit)
  const limitParam = `$${params.length}`

  const r = await db.query(
    `SELECT m.id, m.sender_agent_id, m.recipient_agent_id, m.topic,
            m.payload, m.signature, m.signature_alg, m.sender_key_version,
            m.reply_to, m.sent_at, m.delivered_at, m.signature_verified
     FROM agent_messages m
     WHERE ${where.join(' AND ')}
     ORDER BY m.sent_at DESC
     LIMIT ${limitParam}`,
    params,
  )

  const out: InboxMessage[] = []
  for (const row of r.rows) {
    const verifyResult = await verifyEnvelope(db, {
      senderAgentId: row.sender_agent_id,
      recipientAgentId: row.recipient_agent_id,
      topic: row.topic,
      payload: row.payload,
      replyTo: row.reply_to,
      sentAt:
        row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at),
      signature: row.signature,
      signatureAlg: row.signature_alg,
      senderKeyVersion: row.sender_key_version,
    })

    if (!verifyResult.ok) {
      // HELM-008: signature verification failure on inter-agent envelope.
      void logHelmEvent({
        ruleId: 'HELM-008',
        subject: `bad sig: ${row.sender_agent_id} → ${row.recipient_agent_id ?? row.topic}`,
        agentId: row.sender_agent_id,
        context: {
          messageId: row.id,
          reason: verifyResult.reason ?? 'unknown',
          topic: row.topic,
          alg: row.signature_alg,
          keyVersion: row.sender_key_version,
        },
      })
      // Persist the verdict so admins can see it without re-verifying.
      await db
        .query(
          `UPDATE agent_messages SET signature_verified = false WHERE id = $1`,
          [row.id],
        )
        .catch(() => undefined)
      continue
    }

    // Persist verdict.
    if (row.signature_verified !== true) {
      await db
        .query(
          `UPDATE agent_messages SET signature_verified = true WHERE id = $1`,
          [row.id],
        )
        .catch(() => undefined)
    }

    out.push({
      id: row.id,
      senderAgentId: row.sender_agent_id,
      recipientAgentId: row.recipient_agent_id,
      topic: row.topic,
      payload: row.payload as Record<string, unknown>,
      replyTo: row.reply_to,
      sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : String(row.sent_at),
      signatureVerified: true,
      keyMatched: verifyResult.keyMatched ?? null,
    })
  }

  if (opts.markDeliveredOnFetch !== false && out.length > 0) {
    await db
      .query(
        `UPDATE agent_messages SET delivered_at = now()
         WHERE id = ANY($1::uuid[]) AND delivered_at IS NULL`,
        [out.map((m) => m.id)],
      )
      .catch(() => undefined)
  }

  return out
}

// ── ack helpers ─────────────────────────────────────────────────────────────

export async function markDelivered(db: Pool, messageId: string): Promise<void> {
  await db.query(
    `UPDATE agent_messages SET delivered_at = COALESCE(delivered_at, now())
     WHERE id = $1`,
    [messageId],
  )
}

export async function markRead(db: Pool, messageId: string): Promise<void> {
  await db.query(
    `UPDATE agent_messages SET read_at = COALESCE(read_at, now()),
                                delivered_at = COALESCE(delivered_at, now())
     WHERE id = $1`,
    [messageId],
  )
}

// ── reply convenience ──────────────────────────────────────────────────────

export async function replyTo(
  db: Pool,
  parentMessageId: string,
  fromAgentId: string,
  payload: Record<string, unknown>,
  topic?: string,
): Promise<PublishResult> {
  // Look up the parent for sender + topic defaults.
  const r = await db.query(
    `SELECT sender_agent_id, topic FROM agent_messages WHERE id = $1`,
    [parentMessageId],
  )
  if (r.rows.length === 0) throw new Error(`replyTo: parent ${parentMessageId} not found`)
  const parent = r.rows[0]
  return publish(db, {
    fromAgentId,
    toAgentId: parent.sender_agent_id,
    topic: topic ?? parent.topic,
    payload,
    replyTo: parentMessageId,
  })
}

// ── live subscription via LISTEN/NOTIFY ─────────────────────────────────────

/** Postgres channel names have constraints; normalize topic → channel. */
export function pgChannelForTopic(topic: string): string {
  // pg channel names: max 63 bytes, must not contain quote chars.
  // Use a 'agent_bus_' prefix + sanitized topic.
  const safe = topic.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  return `agent_bus_${safe}`
}

/**
 * Subscribe via LISTEN/NOTIFY for live delivery. Returns an unsubscribe
 * function. Caller is responsible for calling it on shutdown to release
 * the dedicated client back to the pool.
 *
 * On notification, we re-fetch the message + verify before invoking
 * the callback; the LISTEN payload is ONLY the message id (avoids
 * leaking unverified content through pg's notification queue).
 */
export async function subscribeLive(
  db: Pool,
  topic: string,
  agentId: string,
  callback: (msg: InboxMessage) => void | Promise<void>,
): Promise<() => Promise<void>> {
  const channel = pgChannelForTopic(topic)
  // Acquire a dedicated client — LISTEN must not be released back to the
  // pool while still active.
  const client = await db.connect()
  await client.query(`LISTEN ${client.escapeIdentifier ? client.escapeIdentifier(channel) : '"' + channel.replace(/"/g, '""') + '"'}`)

  const handler = async (notification: { channel: string; payload?: string }) => {
    if (notification.channel !== channel) return
    const messageId = notification.payload
    if (!messageId) return
    try {
      const messages = await read(db, agentId, { limit: 1, topic, markDeliveredOnFetch: false })
      const match = messages.find((m) => m.id === messageId)
      if (match) {
        await callback(match)
      }
    } catch (err: any) {
      console.warn(`[agent-bus] subscribeLive callback error: ${err?.message?.slice(0, 100)}`)
    }
  }

  client.on('notification', handler)

  return async () => {
    try {
      client.removeListener('notification', handler)
      await client.query(`UNLISTEN *`)
    } finally {
      client.release()
    }
  }
}

// ── stats ───────────────────────────────────────────────────────────────────

export async function busStats(db: Pool): Promise<{
  sent1h: number
  sent24h: number
  badSigsTotal: number
  badSigs24h: number
  topics24h: number
  senders24h: number
}> {
  try {
    const r = await db.query(`SELECT * FROM agent_bus_recent_stats LIMIT 1`)
    const row = r.rows[0] || {}
    return {
      sent1h: Number(row.sent_1h) || 0,
      sent24h: Number(row.sent_24h) || 0,
      badSigsTotal: Number(row.bad_sigs_total) || 0,
      badSigs24h: Number(row.bad_sigs_24h) || 0,
      topics24h: Number(row.topics_24h) || 0,
      senders24h: Number(row.senders_24h) || 0,
    }
  } catch {
    return { sent1h: 0, sent24h: 0, badSigsTotal: 0, badSigs24h: 0, topics24h: 0, senders24h: 0 }
  }
}

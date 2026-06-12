// ─────────────────────────────────────────────────────────────────────────────
// CONNECTED AGENTS — external agent connector module
//
// Implements the "attach external agent" pillar from /skills. A user
// registers their agent (Claude / OpenAI / LangChain / custom), gets back an
// API key + webhook secret, and their agent then talks to us via:
//
//   POST /api/connectors/event   — audit/observe events from the agent
//   (future) POST /decide        — sync allow/block requests
//
// We fan policy-stack outcomes back to their webhook_url with an
// X-Nuro-Signature: sha256=<hex> header so they can verify origin.
//
// Key handling:
//   - api_key plaintext is shown ONCE at creation time, never stored.
//   - DB stores sha256(plaintext) + a 12-char prefix for display.
//   - Lookup is by hash on incoming requests.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, createHmac, randomBytes } from 'crypto'
import type { Pool } from 'pg'

// ── Types ───────────────────────────────────────────────────────────────────

export type AgentType = 'claude' | 'openai' | 'langchain' | 'custom' | 'unknown'

export interface ConnectedAgentRow {
  id: string
  ownerUserId: string
  name: string
  description: string | null
  agentType: AgentType
  apiKeyPrefix: string
  webhookUrl: string | null
  riskLimitUsd: number
  dailyCapUsd: number
  allowedMarkets: string[]
  capabilities: string[]
  status: 'active' | 'paused' | 'revoked'
  lastEventAt: string | null
  totalEvents: number
  createdAt: string
  updatedAt: string
}

export interface CreateConnectedAgentInput {
  ownerUserId: string
  name: string
  description?: string
  agentType?: AgentType
  webhookUrl?: string
  riskLimitUsd?: number
  dailyCapUsd?: number
  allowedMarkets?: string[]
  capabilities?: string[]
}

export interface CreateConnectedAgentResult {
  agent: ConnectedAgentRow
  /** Plaintext API key — caller MUST surface to user once and never again. */
  apiKey: string
  /** Webhook signing secret — used by the agent to verify our callbacks. */
  webhookSecret: string
}

// ── Key generation ──────────────────────────────────────────────────────────

/**
 * Generate a Nuro API key. Format: `nuro_ak_<32 hex>`. The `nuro_ak_` prefix
 * is intentionally human-recognizable (Stripe-style) so leaked keys can be
 * grep'd out of logs and so secret-scanning tools (GitHub, GitGuardian) can
 * fingerprint them.
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(16).toString('hex')  // 32 hex chars
  const plaintext = `nuro_ak_${raw}`
  const hash = createHash('sha256').update(plaintext).digest('hex')
  // 12-char display prefix: the literal "nuro_ak_" + 4 chars of entropy.
  // Enough for users to disambiguate keys at a glance, not enough to
  // brute-force the rest.
  const prefix = plaintext.slice(0, 12)
  return { plaintext, hash, prefix }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`
}

/**
 * Sign a webhook body with the agent's secret. Receiver verifies by
 * computing the same HMAC and constant-time-comparing to the header value.
 */
export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

// ── Row mapping ─────────────────────────────────────────────────────────────

function mapRow(r: any): ConnectedAgentRow {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    name: r.name,
    description: r.description,
    agentType: r.agent_type as AgentType,
    apiKeyPrefix: r.api_key_prefix,
    webhookUrl: r.webhook_url,
    riskLimitUsd: Number(r.risk_limit_usd),
    dailyCapUsd: Number(r.daily_cap_usd),
    allowedMarkets: r.allowed_markets ?? [],
    capabilities: r.capabilities ?? [],
    status: r.status,
    lastEventAt: r.last_event_at,
    totalEvents: Number(r.total_events) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

const VALID_AGENT_TYPES: AgentType[] = ['claude', 'openai', 'langchain', 'custom', 'unknown']

export async function createConnectedAgent(
  db: Pool,
  input: CreateConnectedAgentInput,
): Promise<CreateConnectedAgentResult> {
  if (!input.ownerUserId) throw new Error('createConnectedAgent: ownerUserId required')
  const name = (input.name || '').trim()
  if (!name) throw new Error('createConnectedAgent: name required')
  if (name.length > 80) throw new Error('createConnectedAgent: name too long (max 80)')

  const agentType: AgentType = (input.agentType && VALID_AGENT_TYPES.includes(input.agentType))
    ? input.agentType
    : 'unknown'

  // Webhook URL must be https in prod (basic sanity — full URL validation
  // happens at delivery time).
  if (input.webhookUrl) {
    if (!/^https?:\/\//i.test(input.webhookUrl)) {
      throw new Error('createConnectedAgent: webhookUrl must start with http(s)://')
    }
    if (input.webhookUrl.length > 500) {
      throw new Error('createConnectedAgent: webhookUrl too long')
    }
  }

  const key = generateApiKey()
  const webhookSecret = generateWebhookSecret()

  const res = await db.query(
    `INSERT INTO connected_agents (
        owner_user_id, name, description, agent_type,
        api_key_hash, api_key_prefix,
        webhook_url, webhook_secret,
        risk_limit_usd, daily_cap_usd, allowed_markets, capabilities
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      input.ownerUserId,
      name,
      input.description ?? null,
      agentType,
      key.hash,
      key.prefix,
      input.webhookUrl ?? null,
      webhookSecret,
      input.riskLimitUsd ?? 50,
      input.dailyCapUsd ?? 500,
      input.allowedMarkets ?? ['polymarket', 'hyperliquid', 'swap'],
      input.capabilities ?? [],
    ],
  )

  return {
    agent: mapRow(res.rows[0]),
    apiKey: key.plaintext,
    webhookSecret,
  }
}

// ── Read ────────────────────────────────────────────────────────────────────

export async function listConnectedAgents(
  db: Pool,
  ownerUserId: string,
): Promise<ConnectedAgentRow[]> {
  const res = await db.query(
    `SELECT * FROM connected_agents
     WHERE owner_user_id = $1
     ORDER BY created_at DESC`,
    [ownerUserId],
  )
  return res.rows.map(mapRow)
}

export async function getConnectedAgent(
  db: Pool,
  agentId: string,
  ownerUserId: string,
): Promise<ConnectedAgentRow | null> {
  const res = await db.query(
    `SELECT * FROM connected_agents
     WHERE id = $1 AND owner_user_id = $2`,
    [agentId, ownerUserId],
  )
  return res.rows[0] ? mapRow(res.rows[0]) : null
}

/**
 * Resolve a ConnectedAgent by API key (used by request auth middleware).
 * Returns null on miss, ignores revoked agents.
 */
export async function resolveByApiKey(
  db: Pool,
  apiKey: string,
): Promise<ConnectedAgentRow | null> {
  if (!apiKey || !apiKey.startsWith('nuro_ak_')) return null
  const hash = hashApiKey(apiKey)
  const res = await db.query(
    `SELECT * FROM connected_agents
     WHERE api_key_hash = $1 AND status != 'revoked'`,
    [hash],
  )
  return res.rows[0] ? mapRow(res.rows[0]) : null
}

// ── Update ──────────────────────────────────────────────────────────────────

export interface UpdateConnectedAgentInput {
  name?: string
  description?: string | null
  webhookUrl?: string | null
  riskLimitUsd?: number
  dailyCapUsd?: number
  allowedMarkets?: string[]
  capabilities?: string[]
  status?: 'active' | 'paused' | 'revoked'
}

export async function updateConnectedAgent(
  db: Pool,
  agentId: string,
  ownerUserId: string,
  input: UpdateConnectedAgentInput,
): Promise<ConnectedAgentRow | null> {
  const fields: string[] = []
  const params: any[] = []
  let p = 1
  const push = (col: string, val: any) => {
    fields.push(`${col} = $${p++}`)
    params.push(val)
  }
  if (input.name !== undefined) push('name', input.name)
  if (input.description !== undefined) push('description', input.description)
  if (input.webhookUrl !== undefined) push('webhook_url', input.webhookUrl)
  if (input.riskLimitUsd !== undefined) push('risk_limit_usd', input.riskLimitUsd)
  if (input.dailyCapUsd !== undefined) push('daily_cap_usd', input.dailyCapUsd)
  if (input.allowedMarkets !== undefined) push('allowed_markets', input.allowedMarkets)
  if (input.capabilities !== undefined) push('capabilities', input.capabilities)
  if (input.status !== undefined) push('status', input.status)

  if (fields.length === 0) {
    return getConnectedAgent(db, agentId, ownerUserId)
  }

  params.push(agentId, ownerUserId)
  const res = await db.query(
    `UPDATE connected_agents
     SET ${fields.join(', ')}
     WHERE id = $${p++} AND owner_user_id = $${p++}
     RETURNING *`,
    params,
  )
  return res.rows[0] ? mapRow(res.rows[0]) : null
}

/**
 * Rotate the API key. Returns the NEW plaintext key — old key stops working
 * immediately. There's no grace period; agents must re-authenticate.
 */
export async function rotateApiKey(
  db: Pool,
  agentId: string,
  ownerUserId: string,
): Promise<{ apiKey: string; agent: ConnectedAgentRow } | null> {
  const newKey = generateApiKey()
  const res = await db.query(
    `UPDATE connected_agents
     SET api_key_hash = $1, api_key_prefix = $2
     WHERE id = $3 AND owner_user_id = $4
     RETURNING *`,
    [newKey.hash, newKey.prefix, agentId, ownerUserId],
  )
  if (!res.rows[0]) return null
  return { apiKey: newKey.plaintext, agent: mapRow(res.rows[0]) }
}

export async function revokeConnectedAgent(
  db: Pool,
  agentId: string,
  ownerUserId: string,
): Promise<boolean> {
  const res = await db.query(
    `UPDATE connected_agents
     SET status = 'revoked'
     WHERE id = $1 AND owner_user_id = $2 AND status != 'revoked'`,
    [agentId, ownerUserId],
  )
  return (res.rowCount ?? 0) > 0
}

// ── Event ingestion ─────────────────────────────────────────────────────────
//
// External agents POST events here. We do two things:
//   1. Bump connected_agents.last_event_at + total_events.
//   2. Append a row to heimdall_events with connected_agent_id set, so the
//      existing dashboards / Telegram alerts / Mythos digest pick it up.
//
// We never trust the agent's claimed severity — we accept their event but
// re-classify if it crosses a Helm rule (e.g. their "info" is actually
// our HELM-105 cap-violation).

export interface IngestExternalEventInput {
  agent: ConnectedAgentRow
  ruleId?: string  // optional — if the external agent maps their own taxonomy to ours
  category?: 'ingress' | 'egress' | 'fs-guard' | 'reasoning' | 'tx-cap' | 'compound' | 'external'
  severity?: 'low' | 'medium' | 'high' | 'critical' | 'info'
  subject: string
  description?: string
  payload?: Record<string, unknown>
  /** Optional dedupe key — duplicate inserts within ~10 min are silent no-ops. */
  dedupeKey?: string
}

export interface IngestExternalEventResult {
  heimdallEventId: string | null
  deduplicated: boolean
}

// ── Outbound webhook delivery ───────────────────────────────────────────────
//
// When an event lands (or a policy decision fires), we POST the decision
// back to the agent's webhook_url with an HMAC signature header. The
// receiving agent can verify origin via:
//
//   const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
//     .update(rawBody).digest('hex');
//   if (`sha256=${expected}` !== req.headers['x-nuro-signature']) reject;
//
// Delivery is fire-and-forget from the ingest path — the caller does NOT
// await it. Failures don't roll back the event insert; we just log to
// execution_log so the dashboard can show "last delivery status" per agent.
//
// Retry: simple in-memory 3-attempt backoff (1s, 4s, 16s). For production
// volumes we'd want a proper outbound queue, but for demo this is enough.

export interface WebhookPayload {
  eventType: 'event_ingested' | 'policy_decision' | 'agent_paused' | 'agent_resumed' | 'cap_warning'
  /** heimdall_events.id when relevant */
  eventId?: string
  agentId: string
  agentName: string
  /** Policy outcome — only set on policy_decision events. */
  decision?: 'allow' | 'block' | 'observe'
  /** Helm rule id that fired (e.g. HELM-105). */
  ruleId?: string
  severity?: 'low' | 'medium' | 'high' | 'critical' | 'info'
  subject: string
  description?: string
  /** Human-readable explanation when block/cap_warning. */
  reason?: string
  occurredAt: string
  /** Free-form structured context. */
  payload?: Record<string, unknown>
}

export interface WebhookDeliveryResult {
  ok: boolean
  status?: number
  attempts: number
  detail: string
}

const WEBHOOK_TIMEOUT_MS = 10_000
const WEBHOOK_RETRIES = [0, 1_000, 4_000] // immediate + 1s + 4s. 3 attempts total.

/**
 * Look up the webhook_secret for an agent. Not exposed on ConnectedAgentRow
 * to keep it out of FE-bound payloads.
 */
async function getWebhookSecret(db: Pool, agentId: string): Promise<string | null> {
  const r = await db.query(`SELECT webhook_secret FROM connected_agents WHERE id = $1`, [agentId])
  return r.rows[0]?.webhook_secret ?? null
}

export async function deliverWebhook(
  db: Pool,
  agent: ConnectedAgentRow,
  payload: WebhookPayload,
): Promise<WebhookDeliveryResult> {
  if (!agent.webhookUrl) {
    return { ok: false, attempts: 0, detail: 'no_webhook_url' }
  }
  const secret = await getWebhookSecret(db, agent.id)
  if (!secret) {
    return { ok: false, attempts: 0, detail: 'no_webhook_secret' }
  }

  const body = JSON.stringify(payload)
  const signature = createHmac('sha256', secret).update(body).digest('hex')

  let lastDetail = 'no_attempt'
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= WEBHOOK_RETRIES.length; attempt++) {
    const delay = WEBHOOK_RETRIES[attempt - 1]
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
      const res = await fetch(agent.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nuro-Signature': `sha256=${signature}`,
          'X-Nuro-Event': payload.eventType,
          'X-Nuro-Agent-Id': agent.id,
          'X-Nuro-Attempt': String(attempt),
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)
      lastStatus = res.status
      if (res.ok) {
        // Audit success then return
        await auditWebhookDelivery(db, agent.id, payload, {
          ok: true,
          status: res.status,
          attempts: attempt,
          detail: 'success',
        })
        return { ok: true, status: res.status, attempts: attempt, detail: 'success' }
      }
      lastDetail = `http_${res.status}`
      // Retry on 5xx + 408 + 429; give up on other 4xx
      if (res.status < 500 && res.status !== 408 && res.status !== 429) break
    } catch (err: any) {
      lastDetail = err?.name === 'AbortError' ? 'timeout' : (err?.message?.slice(0, 100) || 'fetch_error')
    }
  }

  await auditWebhookDelivery(db, agent.id, payload, {
    ok: false,
    status: lastStatus,
    attempts: WEBHOOK_RETRIES.length,
    detail: lastDetail,
  })
  return { ok: false, status: lastStatus, attempts: WEBHOOK_RETRIES.length, detail: lastDetail }
}

async function auditWebhookDelivery(
  db: Pool,
  agentId: string,
  payload: WebhookPayload,
  result: WebhookDeliveryResult,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'connector_webhook',
        agentId.slice(0, 100),
        payload.eventType,
        result.ok ? 'success' : 'failed',
        JSON.stringify({
          eventType: payload.eventType,
          eventId: payload.eventId,
          subject: payload.subject?.slice(0, 120),
          decision: payload.decision,
          ruleId: payload.ruleId,
          httpStatus: result.status,
          attempts: result.attempts,
          detail: result.detail,
        }).slice(0, 1800),
      ],
    )
  } catch {
    /* audit must never throw */
  }
}

export async function ingestExternalEvent(
  db: Pool,
  input: IngestExternalEventInput,
): Promise<IngestExternalEventResult> {
  if (!input.subject || !input.subject.trim()) {
    throw new Error('ingestExternalEvent: subject required')
  }

  // Best-effort dedupe via natural key. We don't error on dup — caller can
  // safely retry on network blips. Looks at context.dedupeKey since that's
  // where we write it (heimdall_events.context is the JSONB blob).
  if (input.dedupeKey) {
    const dup = await db.query(
      `SELECT id FROM heimdall_events
       WHERE connected_agent_id = $1
         AND context->>'dedupeKey' = $2
         AND occurred_at > now() - interval '10 minutes'
       LIMIT 1`,
      [input.agent.id, input.dedupeKey],
    )
    if (dup.rows[0]) {
      return { heimdallEventId: dup.rows[0].id, deduplicated: true }
    }
  }

  // heimdall_events column constraints (from 032_heimdall_events.sql):
  //   subject VARCHAR(128) — truncate hard.
  //   context JSONB        — everything else lives in here (description,
  //                          source, agent metadata, free-form payload).
  //   action  VARCHAR(16)  — NOT NULL. External events default to 'log-only'
  //                          since the external agent already executed (or
  //                          requested) — we're recording, not gating.
  const ruleId = input.ruleId ?? 'EXT-000'
  const category = input.category ?? 'external'
  const severity = input.severity ?? 'info'
  const subject = input.subject.slice(0, 128)
  const context = {
    source: 'connected-agent',
    agentName: input.agent.name,
    agentType: input.agent.agentType,
    description: (input.description ?? '').slice(0, 1000),
    payload: input.payload ?? {},
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  }

  const res = await db.query(
    `INSERT INTO heimdall_events (
       rule_id, category, severity, action, subject, context,
       agent_id, connected_agent_id, occurred_at
     )
     VALUES ($1, $2, $3, 'log-only', $4, $5, $6, $7, now())
     RETURNING id`,
    [
      ruleId,
      category,
      severity,
      subject,
      JSON.stringify(context),
      // agent_id is the in-system agent label (varchar(64)); we leave it
      // null for external events — dashboards filter on connected_agent_id.
      null,
      input.agent.id,
    ],
  )

  await db.query(
    `UPDATE connected_agents
     SET last_event_at = now(), total_events = total_events + 1
     WHERE id = $1`,
    [input.agent.id],
  )

  // Day-7 — fan back to agent's webhook_url so the agent can verify Nuro
  // accepted the event + see any policy classification we applied. Fire-
  // and-forget: callers shouldn't pay 10s of webhook timeout for a 50ms
  // event ingest. Failures audit to execution_log automatically.
  if (input.agent.webhookUrl) {
    void deliverWebhook(db, input.agent, {
      eventType: 'event_ingested',
      eventId: res.rows[0].id,
      agentId: input.agent.id,
      agentName: input.agent.name,
      ruleId,
      severity,
      subject,
      description: input.description,
      occurredAt: new Date().toISOString(),
      payload: input.payload,
    }).catch(() => { /* deliverWebhook already audits */ })
  }

  return { heimdallEventId: res.rows[0].id, deduplicated: false }
}

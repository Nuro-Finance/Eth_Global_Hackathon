// ─────────────────────────────────────────────────────────────────────────────
// AGENT-BUS-ROUTES — REST surface over the inter-agent message bus
//
// S31 H2. Mounted under /api/agent-bus/* via createNuroRouter (same pattern
// as hl-routes). Powers:
//   - human operator inspection (admin UI)
//   - per-agent inbox/outbox APIs
//   - subscription management
//   - bus-level stats for the Mythos POV dashboard
//
// ENDPOINTS:
//   GET  /api/agent-bus/stats                       — admin only
//   GET  /api/agent-bus/topics                      — list all known topics + counts
//   POST /api/agent-bus/messages                    — publish (authed; sender must match auth subject OR admin)
//   GET  /api/agent-bus/messages/inbox?agentId=X    — pull inbox for agent X
//   POST /api/agent-bus/messages/:id/ack            — mark read
//   GET  /api/agent-bus/subscriptions?agentId=X     — list X's subscriptions
//   POST /api/agent-bus/subscriptions               — body: { agentId, topic } → subscribe
//   DELETE /api/agent-bus/subscriptions             — body: { agentId, topic } → unsubscribe
//   POST /api/agent-bus/keys/:agentId/rotate        — admin only — rotate the agent's HMAC key
//
// AUTH model: humans use the existing requireAuth (JWT-bearer); the
// "agent identity" comes from the JWT's user.id. Admin scope is required
// for cross-agent inspection + key rotation. Agent-side direct API
// access (rather than going through bus.publish() in-process) lands in
// Marathon 8 Phase 1 alongside agent-side service tokens.

import type { Router, Request, Response } from 'express'
import type { Pool } from 'pg'

type AuthedRequest = Request & { user?: { id: string; email?: string; role?: string } }

function isAdmin(req: AuthedRequest): boolean {
  if (req.user?.role === 'admin') return true
  // Fallback: shared admin key in query/header. Same convention as the
  // existing /admin/api/* routes — see admin-console.ts.
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return false
  const hdr = (req.headers['x-admin-key'] as string) || ''
  const q = (req.query.adminKey as string) || ''
  return hdr === adminKey || q === adminKey
}

export function mountAgentBusRoutes(router: Router, db: Pool, requireAuth: any): void {
  // ── GET /api/agent-bus/stats ─────────────────────────────────────────────
  router.get('/api/agent-bus/stats', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const { busStats } = await import('./agent-bus')
      const s = await busStats(db)
      res.json(s)
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 120) || 'internal' })
    }
  })

  // ── GET /api/agent-bus/topics ────────────────────────────────────────────
  router.get('/api/agent-bus/topics', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const r = await db.query(
        `SELECT topic,
                COUNT(*) AS message_count,
                COUNT(DISTINCT sender_agent_id) AS sender_count,
                MAX(sent_at) AS last_message_at
         FROM agent_messages
         WHERE sent_at >= now() - interval '7 days'
         GROUP BY topic
         ORDER BY last_message_at DESC NULLS LAST
         LIMIT 100`,
      )
      res.json({ topics: r.rows })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 120) || 'internal' })
    }
  })

  // ── POST /api/agent-bus/messages ─────────────────────────────────────────
  // Body: { fromAgentId, toAgentId?, topic, payload, replyTo?, ttlSeconds? }
  // Auth: caller must have admin scope OR fromAgentId must match the JWT's
  // user id (which doubles as that user's "agent identity" for now).
  router.post('/api/agent-bus/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body || {}
      const fromAgentId = String(body.fromAgentId || '').trim()
      const topic = String(body.topic || '').trim()
      if (!fromAgentId || !topic) {
        return res.status(400).json({ error: 'fromAgentId + topic required' })
      }
      if (!body.payload || typeof body.payload !== 'object') {
        return res.status(400).json({ error: 'payload (object) required' })
      }
      // Identity check — non-admins can only publish AS themselves.
      if (!isAdmin(req) && fromAgentId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot publish as another agent' })
      }
      const { publish, InsufficientBudgetError } = await import('./agent-bus')
      const out = await publish(db, {
        fromAgentId,
        toAgentId: body.toAgentId ?? null,
        topic,
        payload: body.payload,
        replyTo: body.replyTo ?? null,
        ttlSeconds: body.ttlSeconds ?? null,
      })
      res.json(out)
    } catch (err: any) {
      // S33 X4: 402 (Payment Required) when sender lacks budget for a
      // priced topic. Distinguishes from generic 500 so callers can
      // surface "top up your budget" UX vs "infrastructure failed".
      if (err?.name === 'InsufficientBudgetError' || err?.constructor?.name === 'InsufficientBudgetError') {
        return res.status(402).json({
          error: 'insufficient_budget',
          message: err.message,
          agentId: err.agentId,
          requiredUsd: err.required,
        })
      }
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── S33 X4: topic pricing CRUD (admin-only) ──────────────────────────────
  //
  // These routes accept admin-key auth ONLY (no JWT required) — matches
  // the convention of /admin/api/* routes elsewhere. Using requireAuth
  // here would force operator workflows to mint a JWT just to set a
  // topic price, which is friction we don't need on a control-plane API.
  // The x-admin-key check inside isAdmin() suffices for security.
  function adminOnlyKeyAuth(req: AuthedRequest, res: Response, next: () => void): void {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'admin only — set x-admin-key header or ?adminKey=' })
      return
    }
    next()
  }

  // GET /api/agent-bus/pricing — list all topic pricing rows
  router.get('/api/agent-bus/pricing', adminOnlyKeyAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const r = await db.query(
        `SELECT topic, price_usd, recipient_agent_id, description, active,
                created_at, updated_at
           FROM agent_bus_topic_pricing
          ORDER BY topic`,
      )
      res.json({
        pricing: r.rows.map((row: any) => ({
          topic: row.topic,
          priceUsd: Number(row.price_usd),
          recipientAgentId: row.recipient_agent_id,
          description: row.description,
          active: row.active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/agent-bus/pricing — set/upsert pricing for a topic
  // Body: { topic, priceUsd, recipientAgentId, description?, active? }
  router.post('/api/agent-bus/pricing', adminOnlyKeyAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const b = req.body || {}
      const topic = String(b.topic || '').trim()
      const priceUsd = Number(b.priceUsd)
      const recipientAgentId = String(b.recipientAgentId || '').trim()
      const description = b.description ? String(b.description).slice(0, 500) : null
      const active = b.active !== false

      if (!topic) return res.status(400).json({ error: 'topic required' })
      if (!Number.isFinite(priceUsd) || priceUsd < 0) return res.status(400).json({ error: 'priceUsd must be non-negative number' })
      if (!recipientAgentId) return res.status(400).json({ error: 'recipientAgentId required' })

      const r = await db.query(
        `INSERT INTO agent_bus_topic_pricing (topic, price_usd, recipient_agent_id, description, active, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (topic) DO UPDATE
         SET price_usd = EXCLUDED.price_usd,
             recipient_agent_id = EXCLUDED.recipient_agent_id,
             description = EXCLUDED.description,
             active = EXCLUDED.active,
             updated_at = now()
         RETURNING topic, price_usd, recipient_agent_id, description, active, created_at, updated_at`,
        [topic, priceUsd, recipientAgentId, description, active],
      )
      const { invalidateTopicPricingCache } = await import('./agent-bus')
      invalidateTopicPricingCache(topic)
      const row = r.rows[0]
      res.json({
        topic: row.topic,
        priceUsd: Number(row.price_usd),
        recipientAgentId: row.recipient_agent_id,
        description: row.description,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // DELETE /api/agent-bus/pricing/:topic — remove pricing entirely (vs
  // setting active=false, which preserves history). Use sparingly;
  // most operator workflows should toggle active for soft-delete.
  router.delete('/api/agent-bus/pricing/:topic', adminOnlyKeyAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const topic = String(req.params.topic || '').trim()
      if (!topic) return res.status(400).json({ error: 'topic required' })
      const r = await db.query(
        `DELETE FROM agent_bus_topic_pricing WHERE topic = $1 RETURNING topic`,
        [topic],
      )
      const { invalidateTopicPricingCache } = await import('./agent-bus')
      invalidateTopicPricingCache(topic)
      res.json({ deleted: r.rows.length > 0, topic })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── GET /api/agent-bus/messages/inbox ────────────────────────────────────
  // Query: agentId, sinceMs?, topic?, limit?
  // Auth: agentId must match auth subject OR admin.
  router.get('/api/agent-bus/messages/inbox', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const agentId = String(req.query.agentId || '').trim()
      if (!agentId) return res.status(400).json({ error: 'agentId query param required' })
      if (!isAdmin(req) && agentId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot read another agent\'s inbox' })
      }
      const { read } = await import('./agent-bus')
      const messages = await read(db, agentId, {
        limit: Number(req.query.limit) || 25,
        sinceMs: req.query.sinceMs ? Number(req.query.sinceMs) : undefined,
        topic: req.query.topic ? String(req.query.topic) : undefined,
        markDeliveredOnFetch: req.query.markDelivered !== 'false',
      })
      res.json({ messages })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── POST /api/agent-bus/messages/:id/ack ─────────────────────────────────
  router.post('/api/agent-bus/messages/:id/ack', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id)
      // Verify the caller is the recipient (or admin) before flipping read_at.
      const r = await db.query(
        `SELECT recipient_agent_id, topic FROM agent_messages WHERE id = $1`,
        [id],
      )
      if (r.rows.length === 0) return res.status(404).json({ error: 'not found' })
      const row = r.rows[0]
      if (!isAdmin(req) && row.recipient_agent_id && row.recipient_agent_id !== req.user?.id) {
        return res.status(403).json({ error: 'cannot ack another agent\'s message' })
      }
      const { markRead } = await import('./agent-bus')
      await markRead(db, id)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── Subscription management ─────────────────────────────────────────────
  router.get('/api/agent-bus/subscriptions', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const agentId = String(req.query.agentId || '').trim()
      if (!agentId) return res.status(400).json({ error: 'agentId query param required' })
      if (!isAdmin(req) && agentId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot read another agent\'s subscriptions' })
      }
      const { listSubscriptions } = await import('./agent-bus')
      res.json({ topics: await listSubscriptions(db, agentId) })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  router.post('/api/agent-bus/subscriptions', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body || {}
      const agentId = String(body.agentId || '').trim()
      const topic = String(body.topic || '').trim()
      if (!agentId || !topic) return res.status(400).json({ error: 'agentId + topic required' })
      if (!isAdmin(req) && agentId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot subscribe another agent' })
      }
      const { subscribe } = await import('./agent-bus')
      await subscribe(db, agentId, topic)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  router.delete('/api/agent-bus/subscriptions', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body || {}
      const agentId = String(body.agentId || '').trim()
      const topic = String(body.topic || '').trim()
      if (!agentId || !topic) return res.status(400).json({ error: 'agentId + topic required' })
      if (!isAdmin(req) && agentId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot unsubscribe another agent' })
      }
      const { unsubscribe } = await import('./agent-bus')
      await unsubscribe(db, agentId, topic)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── Key rotation (admin) ────────────────────────────────────────────────
  router.post('/api/agent-bus/keys/:agentId/rotate', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const agentId = String(req.params.agentId)
      const graceHours = Number(req.body?.graceWindowHours) || 24
      const { rotateAgentKey } = await import('./agent-bus/sign')
      const k = await rotateAgentKey(db, agentId, graceHours)
      res.json({
        ok: true,
        agentId: k.agentId,
        keyVersion: k.keyVersion,
        rotated: true,
        graceWindowHours: graceHours,
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })
}

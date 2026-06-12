// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX ROUTES — REST API surface (S32, M5)
//
// All endpoints admin-only. Mounted from nuro-routes.ts via mountSandboxRoutes.
//
//   POST   /api/sandbox/spawn             — create new session
//   GET    /api/sandbox                   — list active sessions
//   GET    /api/sandbox/:id               — get one session
//   POST   /api/sandbox/:id/advance       — fast-forward pinned clock
//   POST   /api/sandbox/:id/set-price     — pin native-token price
//   POST   /api/sandbox/:id/mine          — mine N blocks on the fork
//   POST   /api/sandbox/:id/exec          — run an action through sandbox scope
//   DELETE /api/sandbox/:id               — explicit teardown
//
// Per Sandbox Design v2, /exec is the integration-test surface: callers
// pass { method, path, body } — we route through the existing express
// app inside a runInSandbox() wrapper so every code path that uses
// sandbox-aware helpers (scope.ts) gets routed transparently.
// ─────────────────────────────────────────────────────────────────────────────

import type { Router, Request, Response } from 'express'
import type { Pool } from 'pg'
import {
  spawnSandbox,
  teardownSandbox,
  getSession,
  listActiveSessions,
  touchSession,
  type SandboxSessionRow,
} from './orchestrator'
import { cloneSchemaForSandbox } from './db'
import { runInSandbox, type SandboxContext } from './scope'

// ── Helpers ─────────────────────────────────────────────────────────────────

function isAdminCaller(req: Request): boolean {
  const headerKey = (req.headers['x-admin-key'] as string | undefined) ?? ''
  const queryKey = String((req.query.adminKey as string | undefined) ?? '')
  const adminKey = process.env.ADMIN_KEY ?? ''
  if (!adminKey) return false
  return headerKey === adminKey || queryKey === adminKey
}

function publicShape(s: SandboxSessionRow): Record<string, unknown> {
  return {
    id: s.id,
    status: s.status,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    lastActiveAt: s.lastActiveAt,
    ttlIdleSeconds: s.ttlIdleSeconds,
    forkChainId: s.forkChainId,
    forkBlock: s.forkBlock,
    rpcUrl: s.anvilPort ? `http://127.0.0.1:${s.anvilPort}` : null,
    dbSchemaName: s.dbSchemaName,
    pinnedTimeMs: s.pinnedTimeMs,
    pinnedPrices: s.pinnedPrices,
    note: s.note,
    errorMessage: s.errorMessage,
    tornDownAt: s.tornDownAt,
  }
}

// ── Mount ───────────────────────────────────────────────────────────────────

export function mountSandboxRoutes(router: Router, db: Pool): void {
  // POST /api/sandbox/spawn
  router.post('/api/sandbox/spawn', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const body = req.body || {}
      const createdBy = String(body.createdBy || 'admin').slice(0, 64)
      const ttlSeconds = typeof body.ttlSeconds === 'number' ? body.ttlSeconds : undefined
      const ttlIdleSeconds = typeof body.ttlIdleSeconds === 'number' ? body.ttlIdleSeconds : undefined
      const forkChainId = typeof body.forkChainId === 'number' ? body.forkChainId : undefined
      const forkBlock = typeof body.forkBlock === 'number' ? body.forkBlock : undefined
      const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined

      // Spawn Anvil + insert sandbox_sessions row.
      const session = await spawnSandbox(db, {
        createdBy,
        ttlSeconds,
        ttlIdleSeconds,
        forkChainId,
        forkBlock,
        note,
      })

      // Populate the scratch schema. Done after Anvil is ready so a
      // fork-RPC failure aborts cleanly without leaving a half-cloned
      // schema. If schema clone fails we tear down the whole session.
      try {
        const cloneResult = await cloneSchemaForSandbox(db, session.dbSchemaName)
        return res.status(201).json({
          ...publicShape(session),
          schemaClone: cloneResult,
        })
      } catch (cloneErr: any) {
        await teardownSandbox(db, session.id).catch(() => undefined)
        return res.status(500).json({
          error: `schema clone failed (session torn down): ${cloneErr?.message?.slice(0, 200)}`,
        })
      }
    } catch (err: any) {
      const status = err?.statusCode ?? 500
      return res.status(status).json({ error: err?.message?.slice(0, 300) || 'internal' })
    }
  })

  // GET /api/sandbox — list active sessions
  router.get('/api/sandbox', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const sessions = await listActiveSessions(db)
      res.json({
        count: sessions.length,
        sessions: sessions.map(publicShape),
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // GET /api/sandbox/:id
  router.get('/api/sandbox/:id', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const session = await getSession(db, String(req.params.id))
      if (!session) return res.status(404).json({ error: 'session not found' })
      res.json(publicShape(session))
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/sandbox/:id/advance — fast-forward pinned clock
  router.post('/api/sandbox/:id/advance', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const id = String(req.params.id)
      const seconds = Number(req.body?.seconds)
      if (!Number.isFinite(seconds) || seconds === 0) {
        return res.status(400).json({ error: 'seconds must be a non-zero number' })
      }
      const session = await getSession(db, id)
      if (!session) return res.status(404).json({ error: 'session not found' })
      if (session.status !== 'ready') {
        return res.status(400).json({ error: `session not ready (status=${session.status})` })
      }
      // Pin to the current pinned time + delta, OR to wall-clock + delta
      // if no pin set yet (first /advance call).
      const base = session.pinnedTimeMs ?? Date.now()
      const newPinned = base + Math.floor(seconds * 1000)
      await db.query(
        `UPDATE sandbox_sessions
         SET pinned_time_ms = $1, last_active_at = now()
         WHERE id = $2 AND status = 'ready'`,
        [newPinned, id],
      )
      const updated = await getSession(db, id)
      res.json(publicShape(updated!))
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/sandbox/:id/set-price — pin a CoinGecko native price override
  router.post('/api/sandbox/:id/set-price', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const id = String(req.params.id)
      const coinId = String(req.body?.coinId || '').trim()
      const usdPrice = Number(req.body?.usdPrice)
      if (!coinId) return res.status(400).json({ error: 'coinId required' })
      if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
        return res.status(400).json({ error: 'usdPrice must be a positive number' })
      }
      const session = await getSession(db, id)
      if (!session) return res.status(404).json({ error: 'session not found' })
      if (session.status !== 'ready') {
        return res.status(400).json({ error: `session not ready (status=${session.status})` })
      }
      const newPrices = { ...(session.pinnedPrices || {}), [coinId]: usdPrice }
      await db.query(
        `UPDATE sandbox_sessions
         SET pinned_prices = $1::jsonb, last_active_at = now()
         WHERE id = $2 AND status = 'ready'`,
        [JSON.stringify(newPrices), id],
      )
      const updated = await getSession(db, id)
      res.json(publicShape(updated!))
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/sandbox/:id/mine — advance the fork by N blocks
  router.post('/api/sandbox/:id/mine', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const id = String(req.params.id)
      const blocks = Math.max(1, Math.floor(Number(req.body?.blocks ?? 1)))
      if (!Number.isFinite(blocks)) return res.status(400).json({ error: 'blocks must be a positive integer' })
      const session = await getSession(db, id)
      if (!session) return res.status(404).json({ error: 'session not found' })
      if (session.status !== 'ready' || session.anvilPort == null) {
        return res.status(400).json({ error: `session not ready (status=${session.status})` })
      }
      // anvil_mine — mine N blocks instantly. Hex-encoded count.
      const rpcRes = await fetch(`http://127.0.0.1:${session.anvilPort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'anvil_mine',
          params: [`0x${blocks.toString(16)}`],
          id: 1,
        }),
      })
      const rpcBody = (await rpcRes.json()) as { result?: unknown; error?: { message?: string } }
      if (rpcBody.error) {
        return res.status(500).json({ error: `anvil_mine failed: ${rpcBody.error.message ?? 'unknown'}` })
      }
      void touchSession(db, id)
      // Fetch new block number for confirmation.
      const bnRes = await fetch(`http://127.0.0.1:${session.anvilPort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      })
      const bnBody = (await bnRes.json()) as { result?: string }
      const blockNumber = bnBody.result ? parseInt(bnBody.result, 16) : null
      res.json({ ok: true, mined: blocks, blockNumber })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/sandbox/:id/exec — run a SQL or RPC probe inside the session
  // scope. Body shapes:
  //
  //   { kind: 'sql', sql: 'SELECT ...', params?: [...] }
  //   { kind: 'rpc', method: 'eth_chainId', params?: [...] }
  //
  // The 'sql' kind runs against the per-session pg client (search_path
  // pinned to sandbox_<id>, public). The 'rpc' kind hits the Anvil fork.
  // Both confirm the session is wired correctly without requiring full
  // express-route routing.
  router.post('/api/sandbox/:id/exec', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })

    const id = String(req.params.id)
    const body = req.body || {}
    const kind = String(body.kind || '').trim()

    let session
    try {
      session = await getSession(db, id)
    } catch (err: any) {
      return res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }

    if (!session) return res.status(404).json({ error: 'session not found' })
    if (session.status !== 'ready' || session.anvilPort == null) {
      return res.status(400).json({ error: `session not ready (status=${session.status})` })
    }

    void touchSession(db, id)

    try {
      if (kind === 'sql') {
        const sql = String(body.sql || '').trim()
        if (!sql) return res.status(400).json({ error: 'sql required for kind=sql' })
        // Refuse multi-statement queries — too easy to escape the schema.
        // Postgres ; separator detection is imperfect (string literals can
        // contain ;) but a defensive guard catches the obvious cases.
        if (sql.replace(/'(?:[^']|'')*'/g, '').replace(/--.*?(\n|$)/g, '').includes(';')) {
          return res.status(400).json({ error: 'multi-statement sql not allowed' })
        }
        // Acquire a dedicated client for this scoped operation.
        const client = await db.connect()
        try {
          await client.query(`SET search_path TO "${session.dbSchemaName}", public`)
          const ctx: SandboxContext = {
            sessionId: session.id,
            schemaName: session.dbSchemaName,
            rpcUrl: `http://127.0.0.1:${session.anvilPort}`,
            forkChainId: session.forkChainId,
            pinnedTimeMs: session.pinnedTimeMs,
            pinnedPrices: session.pinnedPrices ?? {},
            client,
          }
          const result = await runInSandbox(ctx, async () => {
            const params: any[] = Array.isArray(body.params) ? body.params : []
            return params.length === 0
              ? await client.query(sql)
              : await client.query(sql, params)
          })
          return res.json({
            kind: 'sql',
            rowCount: result.rowCount ?? null,
            rows: result.rows ?? [],
          })
        } finally {
          client.release()
        }
      }

      if (kind === 'rpc') {
        const method = String(body.method || '').trim()
        if (!method) return res.status(400).json({ error: 'method required for kind=rpc' })
        const params = Array.isArray(body.params) ? body.params : []
        const rpcRes = await fetch(`http://127.0.0.1:${session.anvilPort}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        })
        const rpcBody = await rpcRes.json()
        return res.json({ kind: 'rpc', ...rpcBody })
      }

      return res.status(400).json({ error: `unknown exec kind: ${kind} (use 'sql' or 'rpc')` })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // DELETE /api/sandbox/:id — explicit teardown
  router.delete('/api/sandbox/:id', async (req: Request, res: Response) => {
    if (!isAdminCaller(req)) return res.status(403).json({ error: 'admin only' })
    try {
      const id = String(req.params.id)
      const session = await getSession(db, id)
      if (!session) return res.status(404).json({ error: 'session not found' })
      await teardownSandbox(db, id)
      const after = await getSession(db, id)
      res.json({ ok: true, status: after?.status ?? 'unknown' })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })
}

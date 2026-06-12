// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX ORCHESTRATOR — Anvil process lifecycle (S32, M2)
//
// Per Sandbox Design v2 (Neural Net/Claude Memory/Sandbox Design.md):
//   - Each sandbox session owns one Anvil fork process + one Postgres
//     scratch schema + a per-session pinned clock + pinned prices.
//   - This module is responsible for the Anvil half: spawn, port
//     allocation, PID tracking, teardown. DB schema spawn lives in
//     ./db.ts (M3); per-request routing lives in ./scope.ts (M4).
//
// Design decisions:
//   - Port pool: 18545–18554 (10 slots, matches concurrent-session cap).
//     Each spawn picks the lowest free port via DB query — collision-safe
//     because the partial index on anvil_port rejects duplicates among
//     active sessions.
//   - Anvil child process tracked via Node child_process.spawn + PID
//     persisted to sandbox_sessions row. Crash-recovery on middleware
//     reboot scans for status='ready' rows with dead PIDs and reaps them.
//   - Spawn waits up to 15s for Anvil to become responsive on its port
//     before flipping status='ready'. Anvil typically ready in 3-5s.
//   - Teardown is idempotent: SIGTERM → wait → SIGKILL fallback at 3s.
//
// What lives where (full module split):
//   orchestrator.ts → Anvil process + port pool (this file)
//   db.ts           → scratch schema spawn + teardown via pg_dump/restore
//   scope.ts        → AsyncLocalStorage routing for per-request DB+RPC+clock
//   routes.ts       → REST API surface
//
// Crash recovery: reconcileOrphanedSessions() runs on middleware boot,
// finds status='ready' rows whose anvil_pid is no longer alive on the
// system, marks them 'torn_down' + drops their schemas. Prevents a
// reboot loop from leaking resources.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, type ChildProcess } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'
import type { Pool } from 'pg'

// Port pool — matches the 10-session hard cap. Range chosen high enough
// to avoid common dev ports (3000, 5432, 8080) and low enough not to
// collide with Linux ephemeral port range (32768+).
const ANVIL_PORT_MIN = 18545
const ANVIL_PORT_MAX = 18554
const ANVIL_BIN_DEFAULT = '/home/cash/.foundry/bin/anvil'

// Hard cap on simultaneous active sessions (status IN ('spawning','ready')).
// Per Sandbox Design v2 sign-off — locked at 10.
export const MAX_CONCURRENT_SESSIONS = 10

// Default TTL — 4h per sign-off.
export const DEFAULT_TTL_SECONDS = 4 * 60 * 60

// Default idle TTL — 50% of session TTL, also per design doc.
export const DEFAULT_IDLE_TTL_RATIO = 0.5

// Active child processes by sessionId. NOT the source of truth — DB row
// is. This map only exists for fast in-process access during teardown
// (avoiding a DB query for the PID we just spawned).
const _liveProcesses = new Map<string, ChildProcess>()

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpawnSandboxInput {
  /** Operator id ('admin' / 'mythos' / agent_id). Audit attribution. */
  createdBy: string
  /** Custom session lifetime in seconds. Defaults to DEFAULT_TTL_SECONDS (4h). */
  ttlSeconds?: number
  /** Idle teardown threshold in seconds. Defaults to ttl × DEFAULT_IDLE_TTL_RATIO. */
  ttlIdleSeconds?: number
  /** Chain to fork. Defaults to Base (8453). */
  forkChainId?: number
  /** Specific block to fork at. NULL = latest. */
  forkBlock?: number
  /** Free-form operator note for forensics ("hl deposit smoke test"). */
  note?: string
}

export interface SandboxSessionRow {
  id: string
  status: 'spawning' | 'ready' | 'torn_down' | 'errored'
  createdBy: string
  createdAt: string
  expiresAt: string
  lastActiveAt: string
  ttlIdleSeconds: number
  anvilPort: number | null
  anvilPid: number | null
  forkChainId: number
  forkBlock: number | null
  dbSchemaName: string
  pinnedTimeMs: number | null
  pinnedPrices: Record<string, number>
  note: string | null
  errorMessage: string | null
  tornDownAt: string | null
}

// ── Spawn ───────────────────────────────────────────────────────────────────

/**
 * Spawn a new sandbox session. Returns the session row in 'spawning' or
 * 'ready' state — caller polls GET /api/sandbox/:id for the transition.
 *
 * Throws on:
 *   - hard-cap exceeded (10 concurrent active sessions)
 *   - no fork RPC URL configured for forkChainId
 *   - anvil binary missing
 *   - port pool exhausted (race between cap-check and port-pick — rare)
 *
 * Anvil spawn itself runs async; the row goes 'spawning' → 'ready' once
 * Anvil responds on its port (verified via eth_chainId probe).
 */
export async function spawnSandbox(
  db: Pool,
  input: SpawnSandboxInput,
): Promise<SandboxSessionRow> {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const ttlIdleSeconds = input.ttlIdleSeconds ?? Math.floor(ttlSeconds * DEFAULT_IDLE_TTL_RATIO)
  const forkChainId = input.forkChainId ?? 8453

  // Hard-cap check. Race-safe: if two callers both pass the COUNT check
  // and both try to insert, the partial unique index on anvil_port (when
  // we assign ports) catches the second one.
  const capRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sandbox_sessions
     WHERE status IN ('spawning','ready')`,
  )
  const activeCount = Number(capRes.rows[0]?.count ?? 0)
  if (activeCount >= MAX_CONCURRENT_SESSIONS) {
    const e: any = new Error(`sandbox session cap reached (${activeCount}/${MAX_CONCURRENT_SESSIONS}). Tear down an existing session before spawning a new one.`)
    e.code = 'SANDBOX_CAP_REACHED'
    e.statusCode = 429
    throw e
  }

  // Resolve fork RPC URL from the existing bridge.ts map (single source
  // of truth for chain → RPC). Lazy-import to avoid circular deps.
  const { RPC_URLS } = await import('../bridge')
  const forkUrl = RPC_URLS[forkChainId]
  if (!forkUrl) {
    throw new Error(`no fork RPC configured for chainId ${forkChainId}`)
  }

  // Pick lowest free port in the pool.
  const port = await pickFreePort(db)
  if (port === null) {
    throw new Error(`anvil port pool exhausted (race vs concurrent spawn). retry recommended`)
  }

  // Insert 'spawning' row first so the cap check + port reservation are
  // visible to other concurrent spawns.
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  // Schema name MUST match what db.ts will create. UUIDs have dashes
  // which Postgres dislikes in unquoted identifiers — strip them.
  const insRes = await db.query<{ id: string; schema: string }>(
    `INSERT INTO sandbox_sessions
       (status, created_by, expires_at, ttl_idle_seconds,
        anvil_port, fork_chain_id, fork_block, db_schema_name, note)
     VALUES ('spawning', $1, $2, $3, $4, $5, $6,
             'sandbox_' || replace(gen_random_uuid()::text, '-', ''), $7)
     RETURNING id, db_schema_name AS schema`,
    [
      input.createdBy,
      expiresAt,
      ttlIdleSeconds,
      port,
      forkChainId,
      input.forkBlock ?? null,
      input.note ?? null,
    ],
  )
  const sessionId = insRes.rows[0].id
  const schemaName = insRes.rows[0].schema

  // Spawn Anvil. Uses --silent to avoid log spam in our middleware logs.
  // --no-mining means blocks only advance on explicit /mine calls (per
  // Sandbox Design v2 — chain time freezes by default).
  const anvilBin = process.env.ANVIL_BIN || ANVIL_BIN_DEFAULT
  const anvilArgs = [
    '--fork-url', forkUrl,
    '--port', String(port),
    '--host', '127.0.0.1',
    '--silent',
    '--no-mining',
  ]
  if (input.forkBlock != null) {
    anvilArgs.push('--fork-block-number', String(input.forkBlock))
  }

  let child: ChildProcess
  try {
    child = spawn(anvilBin, anvilArgs, {
      detached: false,  // tied to middleware lifecycle; SIGTERM cascades
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err: any) {
    await markErrored(db, sessionId, `spawn failed: ${err?.message?.slice(0, 200)}`)
    throw err
  }

  // Capture child stderr for diagnostics; helpful when a fork fails for
  // RPC-specific reasons (rate-limited Alchemy, archive-node missing, etc.).
  let stderrBuf = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8')
    // Cap so a chatty Anvil doesn't OOM us
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192)
  })

  // Track unexpected exits — if Anvil dies before we mark 'ready', flip
  // to 'errored'; if it dies after, that's a teardown.
  let exited = false
  child.once('exit', (code, signal) => {
    exited = true
    void handleAnvilExit(db, sessionId, code, signal, stderrBuf).catch(() => undefined)
  })

  _liveProcesses.set(sessionId, child)

  // Poll for Anvil readiness. Up to 15s, 200ms intervals = 75 attempts.
  const ready = await waitForAnvilReady(`http://127.0.0.1:${port}`, 15_000, 200, () => exited)

  if (!ready) {
    // Spawn timed out OR child exited during wait. Force teardown.
    try { child.kill('SIGTERM') } catch { /* may already be dead */ }
    _liveProcesses.delete(sessionId)
    const detail = exited
      ? `anvil exited during boot: ${stderrBuf.slice(-400) || '(no stderr)'}`
      : `anvil did not respond on port ${port} within 15s`
    await markErrored(db, sessionId, detail)
    const e: any = new Error(detail)
    e.code = 'SANDBOX_SPAWN_TIMEOUT'
    throw e
  }

  // Anvil up — mark 'ready', persist PID.
  await db.query(
    `UPDATE sandbox_sessions
     SET status = 'ready',
         anvil_pid = $1,
         last_active_at = now()
     WHERE id = $2 AND status = 'spawning'`,
    [child.pid ?? null, sessionId],
  )

  return getSession(db, sessionId).then((s) => {
    if (!s) throw new Error(`session ${sessionId} disappeared after spawn — race with cleanup?`)
    return s
  })
}

// ── Teardown ────────────────────────────────────────────────────────────────

/**
 * Tear down a session: kill Anvil + drop scratch schema. Idempotent —
 * calling twice on the same session is a no-op the second time.
 */
export async function teardownSandbox(db: Pool, sessionId: string): Promise<void> {
  const session = await getSession(db, sessionId)
  if (!session) return  // never existed
  if (session.status === 'torn_down') return  // already done

  // Kill the Anvil process. Try in-memory map first (fast path), fall
  // back to PID from DB (covers post-restart teardown).
  const child = _liveProcesses.get(sessionId)
  const pid = session.anvilPid

  if (child) {
    await terminateChildProcess(child, 3_000)
    _liveProcesses.delete(sessionId)
  } else if (pid != null) {
    await terminatePidExternal(pid)
  }

  // Drop the DB scratch schema. Lazy-import db.ts to avoid circular dep
  // when scope.ts also imports from here.
  try {
    const { dropSandboxSchema } = await import('./db')
    await dropSandboxSchema(db, session.dbSchemaName)
  } catch (err: any) {
    console.warn(`[sandbox] schema drop for ${sessionId} failed: ${err?.message?.slice(0, 120)}`)
    // Continue — still mark torn_down so cleanup doesn't keep retrying.
  }

  await db.query(
    `UPDATE sandbox_sessions
     SET status = 'torn_down',
         torn_down_at = now()
     WHERE id = $1 AND status != 'torn_down'`,
    [sessionId],
  )
}

// ── Reconciliation (boot-time crash recovery) ───────────────────────────────

/**
 * Boot-time sweep. Finds 'ready' sessions whose Anvil PID is no longer
 * alive (middleware crashed + restarted, anvil child died with parent),
 * tears them down for real (drops schemas), marks 'torn_down'.
 *
 * Also catches 'spawning' rows older than 60s — those are spawns that
 * crashed mid-flight and never flipped to 'ready'.
 *
 * Safe to call multiple times. Run from src/index.ts on boot.
 */
export async function reconcileOrphanedSessions(db: Pool): Promise<{
  reapedReady: number
  reapedSpawning: number
}> {
  let reapedReady = 0
  let reapedSpawning = 0

  // Stuck 'spawning' — a spawn that died before flipping to 'ready'.
  const stuckSpawning = await db.query<{ id: string }>(
    `SELECT id FROM sandbox_sessions
     WHERE status = 'spawning'
       AND created_at < now() - interval '60 seconds'`,
  )
  for (const row of stuckSpawning.rows) {
    await markErrored(db, row.id, 'crash-recovery: spawn never completed')
    reapedSpawning++
  }

  // 'ready' sessions whose PID is dead.
  const readySessions = await db.query<{ id: string; anvil_pid: number | null; db_schema_name: string }>(
    `SELECT id, anvil_pid, db_schema_name FROM sandbox_sessions WHERE status = 'ready'`,
  )
  for (const row of readySessions.rows) {
    if (row.anvil_pid == null) continue  // shouldn't happen post-spawn but defensive
    if (isPidAlive(row.anvil_pid)) {
      // Still alive — sometimes happens after a graceful middleware
      // restart where Anvil children survived (detached: false should
      // prevent this, but we'd rather not assume).
      continue
    }
    // PID is dead — full teardown.
    try {
      const { dropSandboxSchema } = await import('./db')
      await dropSandboxSchema(db, row.db_schema_name)
    } catch (err: any) {
      console.warn(`[sandbox:reconcile] schema drop for ${row.id} failed: ${err?.message?.slice(0, 120)}`)
    }
    await db.query(
      `UPDATE sandbox_sessions
       SET status = 'torn_down',
           torn_down_at = now(),
           error_message = COALESCE(error_message, 'crash-recovery: PID was dead at reconcile')
       WHERE id = $1`,
      [row.id],
    )
    reapedReady++
  }

  return { reapedReady, reapedSpawning }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export async function getSession(
  db: Pool,
  sessionId: string,
): Promise<SandboxSessionRow | null> {
  const r = await db.query(
    `SELECT id, status, created_by, created_at, expires_at, last_active_at,
            ttl_idle_seconds, anvil_port, anvil_pid, fork_chain_id,
            fork_block, db_schema_name, pinned_time_ms, pinned_prices,
            note, error_message, torn_down_at
     FROM sandbox_sessions WHERE id = $1`,
    [sessionId],
  )
  if (r.rows.length === 0) return null
  const row = r.rows[0]
  return {
    id: row.id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    lastActiveAt: row.last_active_at instanceof Date ? row.last_active_at.toISOString() : String(row.last_active_at),
    ttlIdleSeconds: row.ttl_idle_seconds,
    anvilPort: row.anvil_port,
    anvilPid: row.anvil_pid,
    forkChainId: row.fork_chain_id,
    forkBlock: row.fork_block != null ? Number(row.fork_block) : null,
    dbSchemaName: row.db_schema_name,
    pinnedTimeMs: row.pinned_time_ms != null ? Number(row.pinned_time_ms) : null,
    pinnedPrices: row.pinned_prices ?? {},
    note: row.note,
    errorMessage: row.error_message,
    tornDownAt: row.torn_down_at
      ? (row.torn_down_at instanceof Date ? row.torn_down_at.toISOString() : String(row.torn_down_at))
      : null,
  }
}

export async function listActiveSessions(db: Pool): Promise<SandboxSessionRow[]> {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM sandbox_sessions
     WHERE status IN ('spawning','ready')
     ORDER BY created_at DESC`,
  )
  const out: SandboxSessionRow[] = []
  for (const { id } of r.rows) {
    const s = await getSession(db, id)
    if (s) out.push(s)
  }
  return out
}

export async function touchSession(db: Pool, sessionId: string): Promise<void> {
  await db.query(
    `UPDATE sandbox_sessions
     SET last_active_at = now()
     WHERE id = $1 AND status = 'ready'`,
    [sessionId],
  )
}

async function pickFreePort(db: Pool): Promise<number | null> {
  // Find ports already taken by active sessions.
  const r = await db.query<{ anvil_port: number }>(
    `SELECT anvil_port FROM sandbox_sessions
     WHERE status IN ('spawning','ready')
       AND anvil_port IS NOT NULL`,
  )
  const taken = new Set(r.rows.map((row) => row.anvil_port))
  for (let p = ANVIL_PORT_MIN; p <= ANVIL_PORT_MAX; p++) {
    if (!taken.has(p)) return p
  }
  return null
}

async function waitForAnvilReady(
  rpcUrl: string,
  timeoutMs: number,
  intervalMs: number,
  abortIfExited: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (abortIfExited()) return false
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
        signal: AbortSignal.timeout(intervalMs * 4),
      })
      if (res.ok) {
        const body = (await res.json()) as { result?: unknown }
        if (body && typeof body.result === 'string') return true
      }
    } catch {
      /* not ready yet — keep polling */
    }
    await sleep(intervalMs)
  }
  return false
}

async function terminateChildProcess(child: ChildProcess, killAfterMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return  // already dead
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
      resolve()
    }, killAfterMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function terminatePidExternal(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Already dead, or not ours anymore — both fine.
    return
  }
  // Wait briefly + try SIGKILL if needed.
  await sleep(2000)
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Most likely already exited from SIGTERM. Fine.
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)  // signal 0 = "are you there?" — no-op if alive
    return true
  } catch {
    return false
  }
}

async function markErrored(db: Pool, sessionId: string, message: string): Promise<void> {
  await db.query(
    `UPDATE sandbox_sessions
     SET status = 'errored',
         error_message = $1,
         torn_down_at = COALESCE(torn_down_at, now())
     WHERE id = $2 AND status NOT IN ('errored','torn_down')`,
    [message.slice(0, 1000), sessionId],
  )
}

async function handleAnvilExit(
  db: Pool,
  sessionId: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Promise<void> {
  // We're called by the child 'exit' listener. If the row is already
  // 'torn_down' or 'errored', this is the cleanup path catching up — no-op.
  const session = await getSession(db, sessionId)
  if (!session || session.status === 'torn_down' || session.status === 'errored') return

  // Unexpected death of an active session. Mark errored with diagnostic.
  const detail = `anvil exited unexpectedly (code=${code}, signal=${signal}). stderr tail: ${stderr.slice(-400) || '(empty)'}`
  await markErrored(db, sessionId, detail)
  _liveProcesses.delete(sessionId)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Ensure import resolves cleanly even when path module not used directly.
void resolvePath

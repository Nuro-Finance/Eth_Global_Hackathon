// ─────────────────────────────────────────────────────────────────────────────
// TIER-1 READ CACHE — agent_budgets / reputation / notifications hot reads
//
// Two backends, identical API:
//
//   1. In-memory Map     — default; dev, tests, single-process VPS.
//   2. Upstash Redis REST — prod; set UPSTASH_REDIS_REST_URL + _TOKEN.
//
// Switching: zero-config. If env vars are present at first import, we use
// Upstash. Otherwise we use the in-memory store. No app code changes.
//
// Why Upstash REST over ioredis:
//   - Pure HTTPS POST per get/set — no persistent socket pool to manage.
//   - Works on serverless / edge / VPS uniformly.
//   - Free tier (10K commands/day) covers ~2K dashboard views/day —
//     well above our pre-pitch DAU.
//   - No new npm dependency. Native fetch (Node ≥18).
//
// Read-through pattern (used by callers):
//
//   const cached = await cache.get<BudgetSnapshot>(key);
//   if (cached) return cached;
//   const fresh = await loadFromDb();
//   await cache.set(key, fresh, 60); // 60s TTL
//   return fresh;
//
// Write-invalidation pattern:
//
//   await db.query(...);            // write to Postgres
//   await cache.del(key);           // bust the cache so next read goes fresh
//
// All cache misses + Upstash errors fall back to "no cache" — never block
// the request. Cache-side failures are surfaced via console.warn but the
// caller proceeds as if the cache didn't exist.
// ─────────────────────────────────────────────────────────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const USE_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN)

// ── In-memory backend ───────────────────────────────────────────────────────
// Shared across all imports of this module within a single Node process.
// LRU-ish: caps at 5000 entries to prevent unbounded growth in long-running
// processes. Eviction policy is "oldest insertion" — `Map` preserves order.

const MEM_MAX = 5000
const mem = new Map<string, { v: unknown; expiresAt: number }>()

function memGet<T>(key: string): T | null {
  const entry = mem.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    mem.delete(key)
    return null
  }
  // Touch — bump to most-recently-used position.
  mem.delete(key)
  mem.set(key, entry)
  return entry.v as T
}

function memSet(key: string, val: unknown, ttlSec: number): void {
  if (mem.size >= MEM_MAX) {
    // Evict oldest.
    const first = mem.keys().next().value
    if (first !== undefined) mem.delete(first)
  }
  mem.set(key, { v: val, expiresAt: Date.now() + ttlSec * 1000 })
}

function memDel(key: string): void {
  mem.delete(key)
}

function memDelPrefix(prefix: string): void {
  // Snapshot keys first — mutating Map during for-of would skip entries.
  const keys = Array.from(mem.keys())
  for (const k of keys) {
    if (k.startsWith(prefix)) mem.delete(k)
  }
}

// ── Upstash backend ─────────────────────────────────────────────────────────
// REST API: https://docs.upstash.com/redis/features/restapi
// Each command is a POST to {base}/{cmd}/{arg}/{arg}... with bearer auth.
// We use the /pipeline endpoint when batching (delPrefix) for one round trip.

async function upstash<T = unknown>(cmd: string[]): Promise<T | null> {
  if (!USE_UPSTASH) return null
  try {
    const res = await fetch(`${UPSTASH_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      // 1.5s budget — cache is a "fast path or skip" thing. We'd rather
      // miss the cache than block the request on a slow Upstash region.
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: T; error?: string }
    if (json.error) {
      console.warn('[cache] upstash error:', json.error)
      return null
    }
    return (json.result ?? null) as T | null
  } catch (e: any) {
    // Don't poison the request on cache outages. Log, fall through.
    if (!String(e?.message || '').includes('aborted')) {
      console.warn('[cache] upstash failure:', e?.message || e)
    }
    return null
  }
}

async function upstashGet<T>(key: string): Promise<T | null> {
  const raw = await upstash<string>(['get', key])
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function upstashSet(key: string, val: unknown, ttlSec: number): Promise<void> {
  // SET key value EX ttl
  const json = JSON.stringify(val)
  await upstash(['set', key, json, 'EX', String(ttlSec)])
}

async function upstashDel(key: string): Promise<void> {
  await upstash(['del', key])
}

async function upstashDelPrefix(prefix: string): Promise<void> {
  // Upstash REST doesn't expose KEYS/SCAN cheaply on free tier without
  // burning commands. We use the PIPELINE endpoint to scan + del in one
  // round trip. For prefix-invalidation on free tier, we keep an index set:
  //   each set(key) also adds key to "idx:{prefix}" set
  // and delPrefix iterates that set + deletes both the keys and the index.
  //
  // For now, we punt on cross-key invalidation in the Upstash backend — most
  // call sites pass exact keys. If we hit a real need for prefix-invalidate
  // in prod, switch on the index pattern above.
  console.warn('[cache] upstashDelPrefix not implemented; consider switching to exact-key invalidation. prefix=' + prefix)
}

// ── Public API ──────────────────────────────────────────────────────────────

export const cache = {
  /**
   * Fetch a cached value. Returns null on miss, expiry, or cache error.
   * Never throws — callers can safely treat null as "go to source of truth".
   */
  async get<T>(key: string): Promise<T | null> {
    if (USE_UPSTASH) return upstashGet<T>(key)
    return memGet<T>(key)
  },

  /**
   * Store a value with a TTL in seconds. Errors are swallowed (logged).
   */
  async set<T>(key: string, val: T, ttlSec: number): Promise<void> {
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) return
    if (USE_UPSTASH) return upstashSet(key, val, ttlSec)
    memSet(key, val, ttlSec)
  },

  /**
   * Delete a single key. Used after writes that change the value.
   */
  async del(key: string): Promise<void> {
    if (USE_UPSTASH) return upstashDel(key)
    memDel(key)
  },

  /**
   * Invalidate all keys with a prefix. In-memory backend only — Upstash
   * backend logs a warning and no-ops (callers should use exact keys).
   */
  async delPrefix(prefix: string): Promise<void> {
    if (USE_UPSTASH) return upstashDelPrefix(prefix)
    memDelPrefix(prefix)
  },

  /** Diagnostic — current backend, used by /health and admin views. */
  backend(): 'upstash' | 'memory' {
    return USE_UPSTASH ? 'upstash' : 'memory'
  },

  /** Diagnostic — current memory-cache size. */
  memSize(): number {
    return USE_UPSTASH ? -1 : mem.size
  },
}

// ── Key helpers — keep namespace under control ──────────────────────────────
// Every cache key MUST come through one of these helpers. This makes it
// trivial to grep for "what's in the cache" and to bulk-invalidate via
// delPrefix during admin operations.

export const cacheKeys = {
  budgetSnapshot: (agentId: string, ledgerLimit: number) =>
    `nuro:budget:snap:${agentId}:l${ledgerLimit}`,

  /**
   * All snapshot keys for an agent — call delPrefix() with this on writes
   * that change budget state. The ledgerLimit suffix means a single agentId
   * can have multiple snapshot keys cached at varying limits.
   */
  budgetSnapshotPrefix: (agentId: string) => `nuro:budget:snap:${agentId}:`,

  reputation: (agentId: string) => `nuro:rep:${agentId}`,

  notifications: (agentId: string) => `nuro:notif:${agentId}`,

  cardBalance: (cardId: string) => `nuro:card:bal:${cardId}`,
}

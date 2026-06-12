// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX SCOPE — AsyncLocalStorage routing for per-request DB + RPC + clock + prices (S32, M4)
//
// The wedge that lets existing app code run inside a sandbox without
// touching every call site.
//
// Pattern:
//   1. routes.ts /api/sandbox/:id/exec acquires a dedicated pg client,
//      issues `SET search_path TO sandbox_<id>, public` on that client,
//      bundles into a SandboxContext, and wraps the existing route
//      execution with `runInSandbox(context, () => ...)`.
//   2. Existing code calls `sandboxAware*()` helpers in this module
//      where it would otherwise use raw `pool.query` / `Date.now()` /
//      `RPC_URLS[chainId]` / `nativeUsdPrice(chainId)`.
//   3. Helpers check AsyncLocalStorage; if a context is active, return
//      the sandbox-scoped resource. If not, fall back to production.
//
// Migration: existing code paths NOT yet using `sandboxAware*` helpers
// will read/write production resources even inside an exec-call. That's
// fine — sandbox scope is opt-in for now. The smoke test (M7) shows
// the integration pattern on hl-routes.ts; full migration of every code
// path is a follow-on effort.
//
// Why a dedicated module: AsyncLocalStorage import is small, but more
// importantly the module is intentionally devoid of heavy imports so
// it can be lazy-imported from anywhere (db.ts, native-price.ts) without
// creating circular dep loops.
// ─────────────────────────────────────────────────────────────────────────────

import { AsyncLocalStorage } from 'node:async_hooks'
import type { PoolClient } from 'pg'

// ── Context shape ───────────────────────────────────────────────────────────

export interface SandboxContext {
  /** Session UUID. Used for log attribution + cross-checks. */
  sessionId: string
  /** Schema name in Postgres (sandbox_<hex>). */
  schemaName: string
  /** Forked Anvil RPC URL — http://127.0.0.1:<port>. Replaces RPC_URLS lookup
   *  for this session's chainId only. */
  rpcUrl: string
  /** Chain id the fork mirrors. Other chains fall through to production. */
  forkChainId: number
  /** Pinned wall-clock time (ms). NULL = use real Date.now(). */
  pinnedTimeMs: number | null
  /** Pinned native-token prices keyed by CoinGecko coin id (matches
   *  native-price.nativeCoinIdForChain output). */
  pinnedPrices: Record<string, number>
  /** Dedicated pg client with `SET search_path TO <schema>, public` active.
   *  All sandbox-scoped DB ops use this client to keep the search_path
   *  pinned across queries (a pooled connection-per-query pattern would
   *  reset search_path between queries). */
  client: PoolClient
}

// ── Storage ─────────────────────────────────────────────────────────────────

const _als = new AsyncLocalStorage<SandboxContext>()

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run `callback` inside a sandbox scope. All AsyncLocalStorage-aware
 * helpers below pick up the context for the duration. Nesting throws —
 * sandboxes within sandboxes would be a footgun (which DB? which RPC?
 * which clock?). Use a flat scope.
 */
export function runInSandbox<T>(
  context: SandboxContext,
  callback: () => Promise<T> | T,
): Promise<T> | T {
  if (_als.getStore() != null) {
    throw new Error('runInSandbox: nested sandbox scopes are not supported')
  }
  return _als.run(context, callback)
}

/** Returns the active sandbox context, or undefined when not in a sandbox. */
export function getSandboxContext(): SandboxContext | undefined {
  return _als.getStore()
}

/**
 * Sandbox-aware Date.now() replacement. Returns ctx.pinnedTimeMs when
 * active, else real Date.now().
 *
 * Usage in code paths that need time-pinning:
 *   import { sandboxAwareNow } from './sandbox/scope'
 *   const now = sandboxAwareNow()
 *
 * Most code paths can leave Date.now() alone — only paths whose tests
 * depend on time advancement (CCTP attestation polling, epoch-locked
 * withdrawals, "X minutes ago" labels) need to migrate.
 */
export function sandboxAwareNow(): number {
  const ctx = _als.getStore()
  if (ctx && ctx.pinnedTimeMs != null) return ctx.pinnedTimeMs
  return Date.now()
}

/**
 * Sandbox-aware RPC URL resolver. If a sandbox context is active AND it
 * forked the requested chainId, returns the Anvil fork URL. Otherwise
 * returns the default (production) URL.
 *
 * Pass-through pattern: existing code does
 *   const url = RPC_URLS[chainId]
 *   const provider = new ethers.providers.JsonRpcProvider(url)
 *
 * Sandbox-aware code does
 *   const url = sandboxAwareRpcUrl(chainId, RPC_URLS[chainId])
 *   const provider = new ethers.providers.JsonRpcProvider(url)
 *
 * Returns undefined only when defaultUrl is undefined.
 */
export function sandboxAwareRpcUrl(
  chainId: number,
  defaultUrl: string | undefined,
): string | undefined {
  const ctx = _als.getStore()
  if (ctx && ctx.forkChainId === chainId) return ctx.rpcUrl
  return defaultUrl
}

/**
 * Sandbox-aware native-price override. Returns the pinned price for the
 * native token of `chainId` if set; otherwise returns `defaultPrice`
 * (which the caller computed via nativeUsdPrice() or its own feed).
 *
 * Use:
 *   const livePrice = await nativeUsdPrice(chainId)
 *   const finalPrice = sandboxAwareNativePrice(chainId, livePrice)
 */
export function sandboxAwareNativePrice(
  chainId: number,
  defaultPrice: number | null,
): number | null {
  const ctx = _als.getStore()
  if (!ctx) return defaultPrice
  // Translate chainId → CoinGecko coin id via the existing mapping.
  // Lazy require to keep this module's import surface tiny.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeCoinIdForChain } = require('../native-price') as typeof import('../native-price')
  const coinId = nativeCoinIdForChain(chainId)
  if (coinId && coinId in ctx.pinnedPrices) {
    return ctx.pinnedPrices[coinId]
  }
  return defaultPrice
}

/**
 * Returns the dedicated pg client for the current sandbox session, or
 * undefined when not in a sandbox.
 *
 * Sandbox-aware DB pattern:
 *   const client = getSandboxClient()
 *   if (client) {
 *     await client.query('INSERT INTO hl_vault_positions ...')
 *   } else {
 *     await pool.query('INSERT INTO hl_vault_positions ...')
 *   }
 *
 * Or via the wrapper:
 *   await sandboxAwareQuery(pool, 'INSERT ...', [args])
 */
export function getSandboxClient(): PoolClient | undefined {
  return _als.getStore()?.client
}

/**
 * Drop-in `pool.query` replacement that auto-routes to the sandbox
 * client when a context is active. Code paths that don't import the
 * pool directly (using a passed-in `db` arg) can replace
 * `db.query(...)` with `sandboxAwareQuery(db, ...)`.
 */
export async function sandboxAwareQuery<T extends import('pg').QueryResultRow = any>(
  fallback: { query: import('pg').Pool['query'] },
  text: string,
  params?: any[],
): Promise<import('pg').QueryResult<T>> {
  const client = getSandboxClient()
  if (client) {
    // Cast — PoolClient.query signature is functionally the same as
    // Pool.query for our usage (text, params).
    return params == null
      ? (client.query(text) as Promise<import('pg').QueryResult<T>>)
      : (client.query(text, params) as Promise<import('pg').QueryResult<T>>)
  }
  return params == null
    ? (fallback.query(text) as Promise<import('pg').QueryResult<T>>)
    : (fallback.query(text, params) as Promise<import('pg').QueryResult<T>>)
}

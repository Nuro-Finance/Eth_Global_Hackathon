// ─── JUPITER CLIENT ─────────────────────────────────────────────────────────
//
// Session 30 - Phase 1 of the multi-quote aggregator build. Jupiter is the
// canonical Solana DEX aggregator; it routes across Raydium, Orca, Meteora,
// Phoenix, Pump, Lifinity, and every meaningful Solana DEX. For Nuro's
// "pay with any token on any chain" goal, Jupiter is to Solana what 0x is
// to EVM.
//
// This client is preview-only for Phase 1 - it powers the quote UX so users
// see real numbers for Solana memecoins (PENGU-sol, BONK, WIF, etc.)
// instead of "Quote unavailable". Phase 3 will layer on /v6/swap for tx
// construction + Privy Solana signer + CCTP bridge for the full
// Solana-meme-→-EVM-card-reload flow.
//
// API: https://station.jup.ag/docs/apis/swap-api
// - Public endpoint, no auth required
// - POST / GET on https://quote-api.jup.ag/v6/quote
// - No new npm deps; uses axios already imported in the stack
//
// Cache: 20s TTL in-process. Jupiter price-impact math updates faster than
// 0x quotes because Solana blocks are 400ms, but 20s is plenty for UI
// preview - users won't perceive a 20s-old quote as wrong.

import axios, { AxiosInstance } from 'axios'
import { pool as dbPool } from './db'

// Jupiter's public/free tier. The old `quote-api.jup.ag/v6/quote` host was
// deprecated; `lite-api.jup.ag/swap/v1/quote` is the current free endpoint.
// A paid tier lives at `api.jup.ag` with higher rate limits - swap via env
// if we ever need it. Response shape is identical across endpoints.
const JUPITER_API_BASE = 'https://lite-api.jup.ag'
const JUPITER_QUOTE_PATH = '/swap/v1/quote'

let _client: AxiosInstance | null = null
function client(): AxiosInstance {
  if (_client) return _client
  _client = axios.create({
    baseURL: JUPITER_API_BASE,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  })
 // Helm egress-observe - track outbound requests. Observe-only unless
 // HELM_EGRESS_ENFORCE=on.
  try {
 // Lazy require so modules that import jupiter-client at test-time
 // don't need the full security boot chain.
 // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_client, 'jupiter-client')
  } catch { /* heimdall not initialized yet - skip */ }
  return _client
}

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

/** Wrapped-SOL mint - Jupiter uses this when the user wants to sell raw SOL. */
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112'

/** USDC on Solana - default output mint for our quote-preview flow. */
export const USDC_SOLANA_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

/**
 * Solana SPL token catalog - DB-backed via the `solana_allowlist` table
 * (migration 030). Mirrors the erc20_allowlist pattern in swap.ts: a 60s
 * in-memory snapshot keeps lookups synchronous + cheap, refresh happens
 * lazily via ensureSolanaAllowlistFresh().
 *
 * Pre-Phase-2.5 this was a hardcoded array. Moving to DB lets admin
 * toggle `enabled` per-token without redeploy - critical for memecoin
 * volatility / rug response.
 *
 * Symbols collide across chains (e.g. PENGU on Ethereum OFT AND PENGU
 * on Solana native). Resolution is ALWAYS by mint address downstream;
 * symbol-keyed lookups are convenience for the UI.
 */
export interface SolanaTokenInfo {
  symbol: string
  name: string
  mint: string
  decimals: number
  category: 'native' | 'stablecoin' | 'bluechip' | 'memecoin'
}

const ALLOWLIST_TTL_MS = 60_000
let solanaAllowlistSnapshot: SolanaTokenInfo[] = []
let solanaAllowlistBySymbol: Map<string, SolanaTokenInfo> = new Map()
let solanaAllowlistByMint: Map<string, SolanaTokenInfo> = new Map()
let solanaAllowlistLastRefresh = 0

async function refreshSolanaAllowlistSnapshot(): Promise<void> {
  try {
    const result = await dbPool.query(
      `SELECT symbol, display_name, mint_address, decimals, category
       FROM solana_allowlist
       WHERE enabled = true
       ORDER BY category, symbol`,
    )
    const next: SolanaTokenInfo[] = result.rows.map((row: any) => ({
      symbol: row.symbol,
      name: row.display_name,
      mint: row.mint_address,
      decimals: Number(row.decimals),
      category: row.category,
    }))
    solanaAllowlistSnapshot = next
    solanaAllowlistBySymbol = new Map(next.map((t) => [t.symbol.toUpperCase(), t]))
    solanaAllowlistByMint = new Map(next.map((t) => [t.mint, t]))
    solanaAllowlistLastRefresh = Date.now()
  } catch (err: any) {
 // Keep previous snapshot on error - safer than wiping the allowlist
 // (which would disable every Solana quote silently). Log so audit
 // trails pick it up.
    console.warn(`[jupiter] Solana allowlist refresh failed: ${err.message?.slice(0, 80)}`)
  }
}

/** Idempotent + cheap: only hits DB if cached snapshot is >60s old. */
export async function ensureSolanaAllowlistFresh(): Promise<void> {
  if (Date.now() - solanaAllowlistLastRefresh > ALLOWLIST_TTL_MS) {
    await refreshSolanaAllowlistSnapshot()
  }
}

/** Force-refresh now. Call after admin writes so changes propagate <60s. */
export async function forceRefreshSolanaAllowlist(): Promise<void> {
  await refreshSolanaAllowlistSnapshot()
}

/** Sync read of the snapshot. Await ensureSolanaAllowlistFresh() first if
 * freshness matters (admin panel, monitor poll). */
export function getSolanaAllowlist(): SolanaTokenInfo[] {
  return solanaAllowlistSnapshot
}

export function findSolanaTokenBySymbol(symbol: string): SolanaTokenInfo | null {
  return solanaAllowlistBySymbol.get(symbol.toUpperCase()) || null
}
export function findSolanaTokenByMint(mint: string): SolanaTokenInfo | null {
  return solanaAllowlistByMint.get(mint) || null
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface JupiterQuoteRaw {
  inputMint: string
  outputMint: string
  inAmount: string         // raw (smallest units)
  outAmount: string        // raw (smallest units)
  otherAmountThreshold: string // minimum out amount with slippage applied
  swapMode: 'ExactIn' | 'ExactOut'
  slippageBps: number
  priceImpactPct: string   // decimal string e.g. "0.0023" = 0.23%
  routePlan: Array<{
    swapInfo: {
      ammKey: string
      label: string
      inputMint: string
      outputMint: string
      inAmount: string
      outAmount: string
      feeAmount: string
      feeMint: string
    }
    percent: number
  }>
  contextSlot?: number
  timeTaken?: number
}

export interface JupiterQuoteResult {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  buyAmountUsd: number      // outAmount / 10^outputDecimals (assumes output is USDC)
  minBuyAmountUsd: number   // otherAmountThreshold / 10^outputDecimals
  priceImpactBps: number    // rounded to bps for UX
  slippageBps: number
  routeCount: number        // how many hops - surfaces as a UX badge
  routeLabels: string[]     // DEX names the route traversed ("Raydium", "Orca", ...)
  source: 'jupiter'
}

// ─── CORE QUOTE CALL ────────────────────────────────────────────────────────

/**
 * Fetch an ExactIn quote from Jupiter. Returns null on any error so the
 * caller can fall back to an aggregator's next source without throwing.
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountRaw: string,
  slippageBps: number = 50,
): Promise<JupiterQuoteResult | null> {
  try {
    const res = await client().get<JupiterQuoteRaw>(JUPITER_QUOTE_PATH, {
      params: {
        inputMint,
        outputMint,
        amount: amountRaw,
        slippageBps,
        swapMode: 'ExactIn',
        restrictIntermediateTokens: true, // avoid routing through low-liquidity intermediaries
      },
    })
    const data = res.data
    if (!data || !data.outAmount) return null

 // Output is USDC (6 decimals) in our Phase 1 flow. We hardcode the
 // decimals lookup against our Solana catalog so that if we ever quote
 // against a non-USDC output (Phase 2+), this stays correct.
    const outputInfo = findSolanaTokenByMint(data.outputMint)
    const outDecimals = outputInfo?.decimals ?? 6
    const buyAmountUsd = Number(data.outAmount) / 10 ** outDecimals
    const minBuyAmountUsd = Number(data.otherAmountThreshold) / 10 ** outDecimals

    const priceImpactPct = Number(data.priceImpactPct) || 0
    const priceImpactBps = Math.round(priceImpactPct * 10_000)

    const routeLabels = Array.from(
      new Set((data.routePlan || []).map(r => r.swapInfo?.label).filter((x): x is string => Boolean(x)))
    )

    return {
      inputMint: data.inputMint,
      outputMint: data.outputMint,
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      buyAmountUsd,
      minBuyAmountUsd,
      priceImpactBps,
      slippageBps: data.slippageBps,
      routeCount: (data.routePlan || []).length,
      routeLabels,
      source: 'jupiter',
    }
  } catch (err: any) {
 // 422 = no route found for pair; 400 = bad mint; all network errors here
 // are non-fatal - caller falls back to next source.
    const status = err?.response?.status
    if (status && status >= 400 && status < 500) {
      console.warn(`[jupiter] no route ${inputMint}→${outputMint} (HTTP ${status})`)
    } else {
      console.warn(`[jupiter] quote error:`, err?.message || err)
    }
    return null
  }
}

// ─── CACHE WRAPPER ──────────────────────────────────────────────────────────

interface CachedEntry<T> { value: T; expiresAt: number }
const _cache = new Map<string, CachedEntry<unknown>>()

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = _cache.get(key) as CachedEntry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value
  const value = await fn()
 // Don't cache null - we want retries on the next call if Jupiter blipped.
  if (value !== null && value !== undefined) {
    _cache.set(key, { value, expiresAt: now + ttlMs })
  }
  return value
}

/**
 * 20s-cached wrapper around getJupiterQuote. Safe to call per-keystroke in
 * the UI - cache absorbs the burst.
 */
export async function getJupiterQuoteCached(
  inputMint: string,
  outputMint: string,
  amountRaw: string,
  slippageBps: number = 50,
): Promise<JupiterQuoteResult | null> {
  const key = `jup:${inputMint}:${outputMint}:${amountRaw}:${slippageBps}`
  return cached(key, 20_000, () => getJupiterQuote(inputMint, outputMint, amountRaw, slippageBps))
}

// ─── SWAP TX CONSTRUCTION (Phase 3a) ────────────────────────────────────────
//
// Jupiter's /v6/swap (POST) takes a quote response + the user's wallet +
// optional destinationTokenAccount and returns a base64-encoded versioned
// transaction the user can sign.
//
// The destinationTokenAccount parameter is the magic that lets us do a
// one-signature flow:
// - User's wallet signs ONE Solana tx
// - Tx swaps PENGU/BONK/etc → USDC AND deposits the output USDC at OUR
// Nuro Solana USDC ATA (associated token account)
// - Existing CCTP monitor sees USDC arrive at our deposit address →
// burns USDC on Solana → mints USDC on Arbitrum → credits card
//
// Without destinationTokenAccount, Jupiter would deposit the swap output
// in the user's own ATA, requiring a SECOND user signature for an SPL
// transfer. One sig vs two is a meaningful UX delta.
//
// The Jupiter swap endpoint expects the FULL quote response object (not
// just a quote ID), so we re-fetch the quote here with skipUserAccounts=
// false to get a payload we can hand off. Fresh quote also avoids the
// "expired quote" race that 30s-old cached quotes can trigger.

const JUPITER_SWAP_PATH = '/swap/v1/swap'

export interface JupiterSwapTxResult {
 /** Base64-encoded versioned Solana transaction. FE deserializes with
 * VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64')). */
  swapTransaction: string
 /** When this quote/tx becomes invalid. Solana blockhashes have a ~150-slot
 * validity window (~60s). Past this, sign+send will fail with
 * BlockhashNotFound and we re-fetch. */
  lastValidBlockHeight?: number
 /** Mirror back the input/output mints + amounts so the FE doesn't have
 * to re-derive from the original quote. */
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  minOutAmount: string
  routeLabels: string[]
  source: 'jupiter'
}

/**
 * Construct a signed-by-user Jupiter swap tx that deposits the output
 * directly into a destination token account (default: user's own ATA).
 *
 * Phase 3a usage: pass the user's Privy Solana address as `userPublicKey`
 * and our Nuro deposit address's USDC ATA as `destinationTokenAccount`.
 * The user signs once; the swap output lands in our deposit account and
 * the existing CCTP monitor takes it from there.
 *
 * Returns null on quote-not-found, wallet-empty-token-balance, or
 * Jupiter-side error. Callers should treat null as "user-actionable
 * failure, surface a fresh-quote retry button."
 */
export async function getJupiterSwapTx(opts: {
  inputMint: string
  outputMint: string
  amountRaw: string
  slippageBps: number
  userPublicKey: string
  destinationTokenAccount?: string
}): Promise<JupiterSwapTxResult | null> {
 // Fetch a fresh quote (uncached - 60s blockhash window means we don't want
 // to reuse a 30s-old quote for tx construction).
  let quote: JupiterQuoteRaw
  try {
    const quoteRes = await client().get<JupiterQuoteRaw>(JUPITER_QUOTE_PATH, {
      params: {
        inputMint: opts.inputMint,
        outputMint: opts.outputMint,
        amount: opts.amountRaw,
        slippageBps: opts.slippageBps,
        swapMode: 'ExactIn',
        restrictIntermediateTokens: true,
      },
    })
    if (!quoteRes.data?.outAmount) return null
    quote = quoteRes.data
  } catch (err: any) {
    console.warn('[jupiter swap] fresh quote fetch failed:', err?.message || err)
    return null
  }

 // Construct the swap tx
  try {
    const swapBody: any = {
      quoteResponse: quote,
      userPublicKey: opts.userPublicKey,
 // Wraps SOL automatically and unwraps any leftover. Sane default.
      wrapAndUnwrapSol: true,
 // Provider-suggested compute unit pricing - Jupiter picks a sane
 // value based on current network congestion.
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
      asLegacyTransaction: false, // versioned tx - required for routes >2 hops
    }
    if (opts.destinationTokenAccount) {
      swapBody.destinationTokenAccount = opts.destinationTokenAccount
    }
    const res = await client().post<{
      swapTransaction: string
      lastValidBlockHeight?: number
    }>(JUPITER_SWAP_PATH, swapBody)
    if (!res.data?.swapTransaction) return null

    const routeLabels = Array.from(
      new Set((quote.routePlan || []).map((r) => r.swapInfo?.label).filter((x): x is string => Boolean(x))),
    )

    return {
      swapTransaction: res.data.swapTransaction,
      lastValidBlockHeight: res.data.lastValidBlockHeight,
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      minOutAmount: quote.otherAmountThreshold,
      routeLabels,
      source: 'jupiter',
    }
  } catch (err: any) {
    const status = err?.response?.status
    const body = err?.response?.data
    console.warn(
      `[jupiter swap] /swap failed status=${status} body=${JSON.stringify(body || {}).slice(0, 200)}`,
    )
    return null
  }
}

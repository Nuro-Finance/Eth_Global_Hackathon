// ─── QUOTE AGGREGATOR ───────────────────────────────────────────────────────
//
// Session 30 Phase 2 - unified entry point for swap-quote previews. Before
// this, FE components had to know which backend endpoint to call based on
// chain:
// - Ethereum/Base/Arbitrum/… → /quote/swap (0x)
// - Solana (chainId -1) → /quote/swap-solana (Jupiter)
//
// This module hides that dispatch. Callers submit a provider-agnostic
// QuoteRequest; we run every applicable source and return the best result
// plus runner-up alternatives. The FE can then:
// (a) show a single "you'll receive: $X" number, or
// (b) surface "routed via Jupiter · 2.1% better than 0x" badges.
//
// Today's sources:
// - zerox - our existing previewSwapQuote() in swap.ts
// - jupiter - getJupiterQuoteCached() in jupiter-client.ts
//
// Same-chain parallel fan-out (0x + 1inch + Uniswap-direct for EVM, for
// example) is the natural next expansion - this module's shape is ready
// for it: just add a new QuoteProbe entry.
//
// Failure model: any source that errors or times out is logged and
// excluded. If at least one source succeeds, we return the best; if all
// fail, we return null so the route handler can emit {degraded: true}.

import { ethers } from 'ethers'
import { CONFIG } from './config'
import { NATIVE_TOKENS, findErc20, previewSwapQuote, ensureAllowlistFresh } from './swap'
import {
  findSolanaTokenBySymbol,
  findSolanaTokenByMint,
  getJupiterQuoteCached,
  USDC_SOLANA_MINT,
  ensureSolanaAllowlistFresh,
} from './jupiter-client'
import {
  getOneInchQuoteCached,
  isOneInchSupportedChain,
  ONEINCH_NATIVE_SENTINEL,
} from './oneinch-client'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type QuoteSource = 'zerox' | 'jupiter' | 'uniswap' | '1inch'

export interface QuoteRequest {
  chainId: number            // EVM chainId or -1 for Solana
  sellToken: string          // symbol ('ETH', 'PENGU') OR address ('0x…' / base58 mint)
  amount: string             // human-readable ('1.5', '100000')
  buyToken?: string          // defaults to USDC per chain
}

export interface UnifiedQuote {
  source: QuoteSource
  chainId: number
  chainName: string
  buyAmountUsd: number
  minBuyAmountUsd: number    // after slippage
  meetsThreshold: boolean    // buyAmountUsd >= SWAP_MIN_USD
  slippageBps: number
  priceImpactBps?: number    // only Jupiter today; 0x doesn't return this directly
  routeCount?: number        // only Jupiter
  routeLabels?: string[]     // only Jupiter - "Raydium", "Orca", etc.
  minSwapUsd: number
  fetchedAtMs: number
}

export interface AggregatedQuote extends UnifiedQuote {
 /** Quotes from other sources that DID succeed but lost on buyAmountUsd.
 * Lets the UI surface savings-vs-worst or "same price on {other}". */
  alternatives: UnifiedQuote[]
 /** Sources that were probed but failed or timed out. For debug + UX hints. */
  failedSources: Array<{ source: QuoteSource; reason: string }>
 /** Fan-out latency - useful for server-side SLA tracking. */
  elapsedMs: number
}

// Per-source hard ceiling. Slow providers shouldn't block the fast one.
const PROBE_TIMEOUT_MS = 4_000

// ─── PROBES ─────────────────────────────────────────────────────────────────
// Each probe is `(req) => Promise<UnifiedQuote | null>`. Null = "this source
// doesn't apply to this request" (e.g. Jupiter for chainId=1 is a no-op).
// Errors bubble; aggregator wraps with timeout + logs.

async function probeZeroX(req: QuoteRequest): Promise<UnifiedQuote | null> {
  if (req.chainId === -1) return null // 0x is EVM-only
  const nativeInfo = NATIVE_TOKENS[req.chainId]
  if (!nativeInfo) return null

  let sellTokenParam: string
  let decimals: number
  const st = req.sellToken.trim()
  if (st === 'native' || st === nativeInfo.nativeSymbol) {
    sellTokenParam = 'native'
    decimals = nativeInfo.nativeDecimals
  } else {
    await ensureAllowlistFresh()
    const erc20 = findErc20(req.chainId, st)
    if (!erc20) return null
    sellTokenParam = erc20.address
    decimals = erc20.decimals
  }

  const amountNum = parseFloat(req.amount)
  if (!isFinite(amountNum) || amountNum <= 0) return null
  const sellAmountRaw = ethers.utils.parseUnits(req.amount, decimals).toString()

  const preview = await previewSwapQuote(req.chainId, sellTokenParam, sellAmountRaw)
  if (!preview) return null

  return {
    source: 'zerox',
    chainId: req.chainId,
    chainName: nativeInfo.chainName,
    buyAmountUsd: preview.buyAmountUsd,
    minBuyAmountUsd: preview.minBuyAmountUsd,
    meetsThreshold: preview.buyAmountUsd >= CONFIG.SWAP_MIN_USD,
    slippageBps: CONFIG.ZEROX_SLIPPAGE_BPS,
    minSwapUsd: CONFIG.SWAP_MIN_USD,
    fetchedAtMs: Date.now(),
  }
}

async function probeJupiter(req: QuoteRequest): Promise<UnifiedQuote | null> {
  if (req.chainId !== -1) return null // Jupiter is Solana-only

 // Phase 2.5 - refresh the DB-backed allowlist before lookups so admin
 // enable/disable propagates without restart.
  await ensureSolanaAllowlistFresh()

  const st = req.sellToken.trim()
  const bySymbol = findSolanaTokenBySymbol(st)
  const byMint = findSolanaTokenByMint(st)
  const tokenInfo = bySymbol || byMint
  if (!tokenInfo) return null

  const buyTokenParam = (req.buyToken || 'USDC').trim()
  const buyBySymbol = findSolanaTokenBySymbol(buyTokenParam)
  const buyByMint = findSolanaTokenByMint(buyTokenParam)
  const outputMint = buyBySymbol?.mint || buyByMint?.mint || USDC_SOLANA_MINT

 // Human → raw with BigInt math (meme decimals can be 5 → easy overflow).
  const parts = req.amount.split('.')
  const whole = parts[0] || '0'
  const frac = (parts[1] || '').padEnd(tokenInfo.decimals, '0').slice(0, tokenInfo.decimals)
  const amountRaw = (BigInt(whole) * BigInt(10) ** BigInt(tokenInfo.decimals) + BigInt(frac || '0')).toString()

  const quote = await getJupiterQuoteCached(
    tokenInfo.mint,
    outputMint,
    amountRaw,
    CONFIG.ZEROX_SLIPPAGE_BPS,
  )
  if (!quote) return null

  return {
    source: 'jupiter',
    chainId: -1,
    chainName: 'Solana',
    buyAmountUsd: quote.buyAmountUsd,
    minBuyAmountUsd: quote.minBuyAmountUsd,
    meetsThreshold: quote.buyAmountUsd >= CONFIG.SWAP_MIN_USD,
    slippageBps: quote.slippageBps,
    priceImpactBps: quote.priceImpactBps,
    routeCount: quote.routeCount,
    routeLabels: quote.routeLabels,
    minSwapUsd: CONFIG.SWAP_MIN_USD,
    fetchedAtMs: Date.now(),
  }
}

async function probeOneInch(req: QuoteRequest): Promise<UnifiedQuote | null> {
  if (req.chainId === -1) return null // 1inch is EVM-only
  if (!isOneInchSupportedChain(req.chainId)) return null
  const nativeInfo = NATIVE_TOKENS[req.chainId]
  if (!nativeInfo) return null

  let sellAddress: string
  let decimals: number
  const st = req.sellToken.trim()
  if (st === 'native' || st === nativeInfo.nativeSymbol) {
    sellAddress = ONEINCH_NATIVE_SENTINEL
    decimals = nativeInfo.nativeDecimals
  } else {
    await ensureAllowlistFresh()
    const erc20 = findErc20(req.chainId, st)
    if (!erc20) return null
    sellAddress = erc20.address
    decimals = erc20.decimals
  }

  const sellAmountRaw = ethers.utils.parseUnits(req.amount, decimals).toString()
  const quote = await getOneInchQuoteCached(
    req.chainId,
    sellAddress,
    sellAmountRaw,
    CONFIG.ZEROX_SLIPPAGE_BPS,
  )
  if (!quote) return null

  return {
    source: '1inch',
    chainId: req.chainId,
    chainName: nativeInfo.chainName,
    buyAmountUsd: quote.buyAmountUsd,
    minBuyAmountUsd: quote.minBuyAmountUsd,
    meetsThreshold: quote.buyAmountUsd >= CONFIG.SWAP_MIN_USD,
    slippageBps: quote.slippageBps,
 // 1inch's "protocols" list doubles as routeLabels for UX parity
 // with Jupiter's routeLabels surface.
    routeLabels: quote.routeProtocols.slice(0, 5),
    minSwapUsd: CONFIG.SWAP_MIN_USD,
    fetchedAtMs: Date.now(),
  }
}

// Declarative probe registry. Add Uniswap-direct / Kyber here when they
// land; aggregator iterates this list in parallel. 1inch is inert when
// ONEINCH_API_KEY is not set in the env - the probe returns null silently.
const PROBES: Array<{ source: QuoteSource; run: (r: QuoteRequest) => Promise<UnifiedQuote | null> }> = [
  { source: 'zerox',   run: probeZeroX   },
  { source: 'jupiter', run: probeJupiter },
  { source: '1inch',   run: probeOneInch },
]

// ─── ORCHESTRATOR ───────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

/**
 * Run every applicable probe in parallel, pick the best by buyAmountUsd,
 * attach runner-ups as alternatives. Returns null if every probe returned
 * null or threw.
 *
 * Probes that return null (not applicable to this chain) are silently
 * omitted - only actual failures show in failedSources.
 */
export async function getBestQuote(req: QuoteRequest): Promise<AggregatedQuote | null> {
  const started = Date.now()

  const results = await Promise.all(
    PROBES.map(async ({ source, run }) => {
      try {
        const q = await withTimeout(run(req), PROBE_TIMEOUT_MS)
        return { source, q, err: null as null | string }
      } catch (err: any) {
        return { source, q: null as UnifiedQuote | null, err: err?.message || String(err) }
      }
    }),
  )

  const wins = results.filter((r): r is { source: QuoteSource; q: UnifiedQuote; err: null } => !!r.q)
  const failures = results
    .filter((r) => !r.q && r.err) // applicable source that actually failed
    .map((r) => ({ source: r.source, reason: r.err! }))

  if (wins.length === 0) {
    if (failures.length > 0) {
      console.warn('[aggregator] all applicable sources failed:', failures)
    }
    return null
  }

  wins.sort((a, b) => b.q.buyAmountUsd - a.q.buyAmountUsd)
  const best = wins[0].q
  const alternatives = wins.slice(1).map((w) => w.q)

  return {
    ...best,
    alternatives,
    failedSources: failures,
    elapsedMs: Date.now() - started,
  }
}

/**
 * Convenience: get only the winning source without the alternative array.
 * Equivalent to getBestQuote(req).then(r => r ? r : null) but drops the
 * aggregator metadata for callers that don't need it.
 */
export async function getBestQuoteCompact(req: QuoteRequest): Promise<UnifiedQuote | null> {
  const agg = await getBestQuote(req)
  if (!agg) return null
  const { alternatives: _a, failedSources: _f, elapsedMs: _e, ...unified } = agg
  return unified
}

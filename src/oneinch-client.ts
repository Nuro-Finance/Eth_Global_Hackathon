// ─── 1INCH CLIENT ───────────────────────────────────────────────────────────
//
// Session 30 Phase 2 extension - 1inch probe for the multi-quote aggregator.
// Companion to src/jupiter-client.ts (Solana) and the existing previewSwapQuote
// in src/swap.ts (0x for EVM). Parallel fan-out lets users see the BEST quote
// across 0x + 1inch + Jupiter, not just one aggregator's answer.
//
// API: https://portal.1inch.dev/documentation/apis/swap/swap-v6
// - Requires an API key (free tier, ~500 req/day). Set ONEINCH_API_KEY.
// - GET /swap/v6.0/{chainId}/quote?src=<addr>&dst=<addr>&amount=<raw>
// - Response: { dstAmount, gas, protocols: [[{name, part, ...}]] }
//
// Design:
// - Env-gated: when ONEINCH_API_KEY is missing, every call returns null so
// the aggregator silently skips this source. Mirrors the Google OAuth
// pattern - no "accidentally-active-on-missing-key" footgun.
// - 20s in-process cache keyed on (chainId, src, dst, amount). Safe to
// call per-keystroke.
// - Returns null on any error so the aggregator's failedSources surface
// captures the "1inch errored but 0x won" case without throwing.

import axios, { AxiosInstance } from 'axios'

const ONEINCH_API_BASE = 'https://api.1inch.dev'

let _client: AxiosInstance | null = null
function client(): AxiosInstance | null {
  const apiKey = process.env.ONEINCH_API_KEY
  if (!apiKey) return null
  if (_client) return _client
  _client = axios.create({
    baseURL: ONEINCH_API_BASE,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    timeout: 8000,
  })
  try {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_client, 'oneinch-client')
  } catch { /* skip */ }
  return _client
}

// Canonical USDC contract per chain. Matches the addresses 0x resolves
// to; required because 1inch's /quote returns `dstAmount` in raw units
// of whatever we asked for. We always ask for USDC, so outDecimals = 6.
const USDC_BY_CHAIN: Record<number, string> = {
  1:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
  10:    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
  137:   '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon native USDC
  56:    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC (USDC on BSC = USDT-like; 1inch supports)
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche
  324:   '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', // zkSync Era
}

// Native token sentinel 1inch accepts in `src` to swap from the chain's
// native currency (ETH / MATIC / BNB / etc.). Same constant across chains.
const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

export interface OneInchQuoteResult {
  chainId: number
  buyAmountUsd: number
  minBuyAmountUsd: number
  slippageBps: number
  routeProtocols: string[]     // e.g. ['UNISWAP_V3', 'CURVE_V2']
  source: '1inch'
}

export async function getOneInchQuote(
  chainId: number,
  sellTokenAddress: string,          // '0x…' or NATIVE_SENTINEL
  sellAmountRaw: string,             // raw smallest-units
  slippageBps: number = 50,
): Promise<OneInchQuoteResult | null> {
  const c = client()
  if (!c) return null // ONEINCH_API_KEY unset → silent skip

  const usdc = USDC_BY_CHAIN[chainId]
  if (!usdc) {
 // Chain not in our 1inch support map. Silently skip; aggregator
 // keeps 0x's answer (or degrades). Log only once per chain so we
 // don't spam on high-traffic unsupported paths.
    return null
  }

  try {
    const res = await c.get<{
      dstAmount: string
      protocols?: Array<Array<Array<{ name: string; part: number }>>>
    }>(`/swap/v6.0/${chainId}/quote`, {
      params: {
        src: sellTokenAddress,
        dst: usdc,
        amount: sellAmountRaw,
        includeTokensInfo: false,
        includeProtocols: true,
      },
    })
    const data = res.data
    if (!data?.dstAmount) return null

 // USDC is 6 decimals on every supported chain.
    const buyAmountUsd = Number(data.dstAmount) / 1e6
 // 1inch doesn't return a worst-case out of the box - we apply our
 // own slippage envelope so the aggregator's comparison is fair.
    const minBuyAmountUsd = buyAmountUsd * (1 - slippageBps / 10_000)

 // Flatten protocols nested [[[...]]] into a flat unique list of
 // venue names for the route badge.
    const routeProtocols = Array.from(
      new Set(
        (data.protocols || []).flatMap((path) =>
          path.flatMap((hop) => hop.map((step) => step.name)),
        ),
      ),
    )

    return {
      chainId,
      buyAmountUsd,
      minBuyAmountUsd,
      slippageBps,
      routeProtocols,
      source: '1inch',
    }
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 400 || status === 404) {
 // "No route" or unsupported pair - fall through silently.
      return null
    }
    if (status === 401 || status === 403) {
 // Bad / exhausted API key. Log once prominently, then fail silent
 // for subsequent calls so we don't flood the log.
      console.warn('[1inch] auth failure - API key missing or exhausted?')
      return null
    }
    console.warn(`[1inch] quote error chain=${chainId}:`, err?.message || err)
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
  if (value !== null && value !== undefined) {
    _cache.set(key, { value, expiresAt: now + ttlMs })
  }
  return value
}

export async function getOneInchQuoteCached(
  chainId: number,
  sellTokenAddress: string,
  sellAmountRaw: string,
  slippageBps: number = 50,
): Promise<OneInchQuoteResult | null> {
  const key = `1inch:${chainId}:${sellTokenAddress}:${sellAmountRaw}:${slippageBps}`
  return cached(key, 20_000, () => getOneInchQuote(chainId, sellTokenAddress, sellAmountRaw, slippageBps))
}

/** Sentinel + types re-exported so callers don't need to know the internals. */
export const ONEINCH_NATIVE_SENTINEL = NATIVE_SENTINEL
export function isOneInchSupportedChain(chainId: number): boolean {
  return chainId in USDC_BY_CHAIN
}

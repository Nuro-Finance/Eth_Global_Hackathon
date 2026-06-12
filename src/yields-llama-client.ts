// ─────────────────────────────────────────────────────────────────────────────
// YIELDS-LLAMA CLIENT — DeFi yield aggregator proxy
//
// S31 H2. Per Richard's call ("LP-Yield is pretty standard at this point"),
// we surface AMM-style LP yields for HyperSwap V2/V3 pools. Rolling our own
// (= read pool reserves + scan 24h Swap events from HyperEVM RPC) is
// expensive — HyperEVM has 1s blocks so 24h = ~86k blocks, well past
// eth_getLogs caps. Subgraph isn't trivially available either.
//
// DefiLlama already does this math correctly + tracks 151 HyperSwap pools.
// We proxy + filter + cache. Their `/pools` endpoint returns:
//   { data: [{ pool, project, chain, symbol, tvlUsd, apy, apyBase,
//              apyReward, ilRisk, exposure, ... }] }
//
// We filter to project="hyperswap-v2"|"hyperswap-v3" + chain="Hyperliquid L1"
// and reshape into our own Pool type. Cached 5min — pool data updates
// hourly on DefiLlama's side, so 5min is plenty fresh + keeps us well below
// any rate-limit even at heavy admin-page traffic.

import axios, { AxiosInstance } from 'axios'

const YIELDS_LLAMA_BASE = 'https://yields.llama.fi'

let _client: AxiosInstance | null = null
function client(): AxiosInstance {
  if (_client) return _client
  _client = axios.create({
    baseURL: YIELDS_LLAMA_BASE,
    timeout: 15_000,
    headers: { Accept: 'application/json' },
  })
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_client, 'yields-llama-client')
  } catch { /* skip */ }
  return _client
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LpPool {
  poolId: string                  // DefiLlama uuid; stable
  symbol: string                  // e.g. "WHYPE-USDC"
  project: 'hyperswap-v2' | 'hyperswap-v3' | string
  chain: string                   // 'Hyperliquid L1'
  tvlUsd: number
  apy: number                     // total APY % including rewards
  apyBase: number                 // base trading-fee APY only
  apyReward: number | null        // incentive APR (token emissions)
  ilRisk: 'no' | 'yes' | null
  exposure: 'single' | 'multi' | null
  // Display extras
  rewardTokens: string[]
  underlyingTokens: string[]
}

interface RawLlamaPool {
  pool: string
  symbol?: string | null
  project?: string | null
  chain?: string | null
  tvlUsd?: number | null
  apy?: number | null
  apyBase?: number | null
  apyReward?: number | null
  ilRisk?: string | null
  exposure?: string | null
  rewardTokens?: string[] | null
  underlyingTokens?: string[] | null
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let _cache: { value: LpPool[]; expiresAt: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch + filter HyperSwap V2/V3 pools on Hyperliquid L1. Sorted by TVL
 * descending. Cached 5min. Returns empty list (NOT throw) on DefiLlama
 * outage so the FE Yield page degrades gracefully.
 */
export async function getHyperSwapPoolsCached(): Promise<LpPool[]> {
  const now = Date.now()
  if (_cache && _cache.expiresAt > now) return _cache.value
  try {
    const res = await client().get<{ data: RawLlamaPool[] }>('/pools')
    const all = Array.isArray(res.data?.data) ? res.data.data : []
    const filtered = all
      .filter(
        (p) =>
          (p.project === 'hyperswap-v2' || p.project === 'hyperswap-v3') &&
          p.chain === 'Hyperliquid L1',
      )
      .map<LpPool>((p) => ({
        poolId: String(p.pool),
        symbol: p.symbol ?? '',
        project: (p.project as LpPool['project']) ?? 'unknown',
        chain: p.chain ?? '',
        tvlUsd: Number(p.tvlUsd) || 0,
        apy: Number(p.apy) || 0,
        apyBase: Number(p.apyBase) || 0,
        apyReward: p.apyReward != null ? Number(p.apyReward) : null,
        ilRisk: (p.ilRisk as LpPool['ilRisk']) ?? null,
        exposure: (p.exposure as LpPool['exposure']) ?? null,
        rewardTokens: p.rewardTokens ?? [],
        underlyingTokens: p.underlyingTokens ?? [],
      }))
      .sort((a, b) => b.tvlUsd - a.tvlUsd)

    _cache = { value: filtered, expiresAt: now + CACHE_TTL_MS }
    return filtered
  } catch (err: any) {
    console.warn(`[yields-llama] HyperSwap pools fetch failed: ${err?.message?.slice(0, 100)}`)
    // Soft-fail: return last good cache if any, else empty.
    return _cache?.value ?? []
  }
}

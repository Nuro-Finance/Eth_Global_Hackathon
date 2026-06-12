// ─── HYPERLIQUID CLIENT ─────────────────────────────────────────────────────
//
// Session 30 — thin axios wrapper around Hyperliquid's public `/info` API.
// Feeds the Yield → Hyperliquid page with:
//   • Perp funding rates (current + hourly) — the "short side earns" signal
//   • Vault index with APR deltas
//   • HYPE staking context
//
// Architecture follows the established pattern (issuers.ts, plaid-client.ts,
// dwolla-client.ts): axios-only, no new npm deps. Hyperliquid's public API
// is stateless POST with JSON body `{ type: "..." }` — no auth, no API key,
// no rate-limit sign-in. Safe to query freely; we cache server-side to keep
// request volume low.
//
// Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

import axios, { AxiosInstance } from 'axios'

const HYPERLIQUID_API_BASE = 'https://api.hyperliquid.xyz'

let _client: AxiosInstance | null = null
function client(): AxiosInstance {
  if (_client) return _client
  _client = axios.create({
    baseURL: HYPERLIQUID_API_BASE,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  })
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_client, 'hyperliquid-client')
  } catch { /* skip */ }
  return _client
}

// ─── TYPES (subset of HL response shapes — only fields we consume) ──────────

export interface HlPerpAsset {
  name: string            // e.g. "BTC", "ETH"
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
}

export interface HlPerpAssetCtx {
  funding: string          // current funding rate (hourly, fractional — e.g. "0.0000125")
  openInterest: string
  markPx: string
  midPx?: string | null
  prevDayPx: string
  dayNtlVlm: string
  premium?: string | null
  oraclePx?: string
}

export interface HlVaultSummary {
  vaultAddress: string
  name: string
  leader: string
  tvl: string              // USDC notional
  apr: number              // fractional (0.15 = 15%)
  isClosed: boolean
}

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

/**
 * Perp universe metadata + current ctx (funding, mark, OI) for every perp
 * listed on Hyperliquid. This is the primary "yield" data source — funding
 * rates indicate who is paying whom per hour.
 *
 * Response shape: [{universe: HlPerpAsset[]}, HlPerpAssetCtx[]]
 * The two arrays are parallel — index i of assetCtxs matches universe[i].
 */
export async function getPerpMetaAndCtxs(): Promise<{
  universe: HlPerpAsset[]
  assetCtxs: HlPerpAssetCtx[]
}> {
  const res = await client().post('/info', { type: 'metaAndAssetCtxs' })
  const data = res.data
  // Hyperliquid returns [{ universe: [...] }, [ctx0, ctx1, ...]]
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error(`Unexpected HL metaAndAssetCtxs shape: ${JSON.stringify(data).slice(0, 120)}`)
  }
  const universe = (data[0]?.universe || []) as HlPerpAsset[]
  const assetCtxs = (data[1] || []) as HlPerpAssetCtx[]
  return { universe, assetCtxs }
}

/**
 * Compute annualized funding rate from HL's hourly fractional rate.
 * funding * 24 * 365 = annual rate (ignoring compounding — HL pays hourly
 * which at typical rates is close enough to simple for display).
 */
export function annualizeFundingRate(hourlyFraction: string | number): number {
  const n = typeof hourlyFraction === 'string' ? Number(hourlyFraction) : hourlyFraction
  if (!Number.isFinite(n)) return 0
  return n * 24 * 365
}

/**
 * Return top N perp markets by absolute funding rate (most impactful for
 * yield seekers — high positive = shorts earn, high negative = longs earn).
 * Sorted by |funding| descending. Includes both sides so the UI can color
 * positive/negative distinctly.
 */
export async function getTopFundingRates(limit: number = 10): Promise<
  Array<{
    symbol: string
    fundingHourly: number
    fundingApr: number
    markPx: number
    openInterestUsd: number
    dayVolumeUsd: number
  }>
> {
  const { universe, assetCtxs } = await getPerpMetaAndCtxs()
  const rows = universe.map((asset, i) => {
    const ctx = assetCtxs[i] || ({} as HlPerpAssetCtx)
    const fundingHourly = Number(ctx.funding) || 0
    const markPx = Number(ctx.markPx) || 0
    const oi = Number(ctx.openInterest) || 0
    return {
      symbol: asset.name,
      fundingHourly,
      fundingApr: fundingHourly * 24 * 365,
      markPx,
      openInterestUsd: oi * markPx,
      dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
    }
  })
  // Sort by magnitude (absolute) so both extremes surface
  rows.sort((a, b) => Math.abs(b.fundingApr) - Math.abs(a.fundingApr))
  return rows.slice(0, limit)
}

// ─── SPOT MARKETS ───────────────────────────────────────────────────────────

export interface HlSpotUniverseEntry {
  name: string           // e.g. "PURR/USDC"
  index: number
  isCanonical: boolean
  tokens: number[]       // [baseIdx, quoteIdx] into tokens[]
}

export interface HlSpotToken {
  name: string
  index: number
  tokenId: string
  isCanonical: boolean
  fullName: string | null
  szDecimals: number
  weiDecimals: number
  evmContract?: { address: string; evm_extra_wei_decimals: number }
}

export interface HlSpotAssetCtx {
  coin: string           // e.g. "PURR/USDC"
  markPx: string
  midPx?: string
  prevDayPx: string
  dayBaseVlm: string     // base volume (tokens)
  dayNtlVlm: string      // notional volume (USDC)
  circulatingSupply: string
  totalSupply: string
}

export async function getSpotMetaAndCtxs(): Promise<{
  universe: HlSpotUniverseEntry[]
  tokens: HlSpotToken[]
  assetCtxs: HlSpotAssetCtx[]
}> {
  const res = await client().post('/info', { type: 'spotMetaAndAssetCtxs' })
  const data = res.data
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('Unexpected HL spotMetaAndAssetCtxs shape')
  }
  return {
    universe: data[0]?.universe || [],
    tokens: data[0]?.tokens || [],
    assetCtxs: data[1] || [],
  }
}

/**
 * Top spot markets by 24h notional volume. Returns price + 24h change +
 * volume per pair. Safe default for the Yield page "HL Spot" panel.
 *
 * Filters out zero-volume + broken-price rows so the UI doesn't show
 * flatline garbage. isCanonical flag filters to HL's curated markets
 * (not every indexed pair has liquidity).
 */
export async function getTopSpotMarkets(limit: number = 15): Promise<
  Array<{
    pair: string
    baseSymbol: string
    quoteSymbol: string
    markPx: number
    dayChangePct: number
    dayVolumeUsd: number
    circulatingSupply: number
    isCanonical: boolean
  }>
> {
  const { universe, tokens, assetCtxs } = await getSpotMetaAndCtxs()

  // index -> token shortcut for resolving base/quote names
  const tokenByIdx = new Map<number, HlSpotToken>(tokens.map((t) => [t.index, t]))

  const rows = universe.map((u, i) => {
    const ctx = assetCtxs[i] || ({} as HlSpotAssetCtx)
    const markPx = Number(ctx.markPx) || 0
    const prevDay = Number(ctx.prevDayPx) || 0
    const dayChangePct = prevDay > 0 ? ((markPx - prevDay) / prevDay) * 100 : 0
    const baseIdx = u.tokens[0]
    const quoteIdx = u.tokens[1]
    const baseTok = tokenByIdx.get(baseIdx)
    const quoteTok = tokenByIdx.get(quoteIdx)
    return {
      pair: u.name,
      baseSymbol: baseTok?.name || 'unknown',
      quoteSymbol: quoteTok?.name || 'USDC',
      markPx,
      dayChangePct,
      dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
      circulatingSupply: Number(ctx.circulatingSupply) || 0,
      isCanonical: u.isCanonical,
    }
  })
  // Filter: valid price + non-zero volume. Don't filter on isCanonical —
  // only PURR/USDC (the OG HL spot market) has that flag; everything
  // else is HL's hash-named indexed markets (@144, @109, ...) which
  // ARE the actual liquid markets. We resolve them via baseSymbol/
  // quoteSymbol from tokens[] so the UI shows real names ("HYPE/USDC")
  // not the @-index.
  const filtered = rows.filter((r) => r.markPx > 0 && r.dayVolumeUsd > 0)
  filtered.sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd)
  return filtered.slice(0, limit)
}

export async function getTopSpotMarketsCached(limit: number = 15) {
  return cached(`hl:spot:${limit}`, 60_000, () => getTopSpotMarkets(limit))
}

// ─── CACHE WRAPPER ──────────────────────────────────────────────────────────
// HL's API is fast + free, but polling it 100 times/min from every admin
// page hit is wasteful. 30s cache is enough — funding rates update hourly
// so intra-minute freshness isn't meaningful.

interface CachedEntry<T> {
  value: T
  expiresAt: number
}
const _cache = new Map<string, CachedEntry<unknown>>()

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = _cache.get(key) as CachedEntry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value
  const value = await fn()
  _cache.set(key, { value, expiresAt: now + ttlMs })
  return value
}

/** Top funding rates cached at 30s TTL — safe to call on every page load. */
export async function getTopFundingRatesCached(limit: number = 10) {
  return cached(`hl:funding:${limit}`, 30_000, () => getTopFundingRates(limit))
}

// ─── FUNDING HISTORY — sparkline data (S31 H2) ──────────────────────────────
// HL exposes a `fundingHistory` info-API call returning hourly funding
// snapshots for one symbol over a [start, end] window. We expose this for
// the sparkline column on the Yield page funding table.

export interface HlFundingHistoryPoint {
  /** Unix ms timestamp of the funding payment. */
  time: number
  /** Hourly funding rate at that point (fractional, e.g. 0.0000125 = 0.00125%). */
  fundingHourly: number
  /** Annualized for direct visual comparison with the row's fundingApr column. */
  fundingApr: number
  /** Mark/oracle price reference if HL provides it, else 0. */
  premium?: number
}

/**
 * Fetch funding history for one symbol over a window of `hours`. Default
 * 24h gives a daily sparkline. HL caps the response at ~500 points and
 * rejects windows > ~30 days; we don't need that here.
 */
export async function getFundingHistory(
  symbol: string,
  hours: number = 24,
): Promise<HlFundingHistoryPoint[]> {
  const endTime = Date.now()
  const startTime = endTime - hours * 60 * 60 * 1000
  const res = await client().post('/info', {
    type: 'fundingHistory',
    coin: symbol,
    startTime,
    endTime,
  })
  const arr = Array.isArray(res.data) ? res.data : []
  return arr.map((p: any) => {
    const fundingHourly = Number(p.fundingRate) || 0
    return {
      time: Number(p.time) || 0,
      fundingHourly,
      fundingApr: fundingHourly * 24 * 365,
      premium: p.premium != null ? Number(p.premium) : undefined,
    }
  })
}

/**
 * Batch convenience — fetches funding history for many symbols in parallel.
 * Each symbol's call is independent; one failure doesn't block the rest.
 * Returns a map keyed by symbol; symbols that errored are absent.
 */
export async function getFundingHistoryBatch(
  symbols: string[],
  hours: number = 24,
): Promise<Record<string, HlFundingHistoryPoint[]>> {
  const out: Record<string, HlFundingHistoryPoint[]> = {}
  await Promise.all(
    symbols.map(async (s) => {
      try {
        out[s] = await getFundingHistory(s, hours)
      } catch (err: any) {
        // Skip silently — caller's UI can degrade per-symbol.
        console.warn(`[hl] fundingHistory(${s}) failed: ${err?.message?.slice(0, 80)}`)
      }
    }),
  )
  return out
}

/** Funding history cached at 5min TTL — points-per-symbol updated hourly
 *  on HL anyway, so polling more often is wasted work. */
export async function getFundingHistoryBatchCached(
  symbols: string[],
  hours: number = 24,
) {
  const key = `hl:funding-history:${hours}h:${symbols.slice().sort().join(',')}`
  return cached(key, 5 * 60 * 1000, () => getFundingHistoryBatch(symbols, hours))
}

// ─── HYPE STAKING STATS (S31 H2) ────────────────────────────────────────────
// HL has a built-in HYPE staking system. Stakers delegate HYPE to validators
// + earn protocol-fee + funding-rebate revenue. The `delegatorSummary`
// info-API call gives the global picture (total HYPE staked, total APR
// across the network, validator count, etc.) — useful for the Yield page
// even if we're not staking ourselves yet.

export interface HlStakingStats {
  /** Total HYPE staked across all validators (in HYPE units, not USD). */
  totalStakedHype: number
  /** Total HYPE supply (denominator for stake-rate calculation). */
  totalSupplyHype: number
  /** Total active validators. */
  validatorCount: number
  /** Network-wide annualized staking APR (fractional). */
  apr: number
  /** Median validator commission (fractional). */
  medianCommission: number
  fetchedAtMs: number
}

/**
 * Fetch network-level HYPE staking stats. Uses HL Info API
 * `validatorSummaries` + (when available) `delegatorSummary`.
 *
 * HL's Info API for staking is comparatively new + the schema has shifted
 * — we read defensively + return null on shape mismatches rather than
 * throwing. Caller can degrade the UI to "—" if null is returned.
 */
export async function getStakingStats(): Promise<HlStakingStats | null> {
  try {
    const res = await client().post('/info', { type: 'validatorSummaries' })
    const validators = Array.isArray(res.data) ? res.data : []
    if (validators.length === 0) return null

    // HL's stake field is integer "wei" with 8 decimals — divide to get
    // human HYPE units. APR lives inside stats[i][1].predictedApr (string)
    // for windows ['day','week','month']; we use 'month' as the smoother
    // signal. Commission is a string fractional ("0.04" = 4%).
    const HYPE_DECIMALS_DIVISOR = 1e8
    let totalStaked = 0
    const commissions: number[] = []
    let aprSum = 0
    let aprCount = 0
    for (const v of validators) {
      // Only count active, non-jailed validators in network metrics.
      if (v.isActive === false || v.isJailed === true) continue
      const stakeRaw = Number(v.stake) || 0
      totalStaked += stakeRaw / HYPE_DECIMALS_DIVISOR
      const commission = typeof v.commission === 'string'
        ? Number(v.commission)
        : Number(v.commission) || 0
      if (Number.isFinite(commission) && commission > 0) commissions.push(commission)
      // Find the 'month' stats entry; fall back to 'week' or 'day'.
      const statsArr = Array.isArray(v.stats) ? v.stats : []
      const monthEntry = statsArr.find((s: any) => Array.isArray(s) && s[0] === 'month')
      const weekEntry = statsArr.find((s: any) => Array.isArray(s) && s[0] === 'week')
      const dayEntry = statsArr.find((s: any) => Array.isArray(s) && s[0] === 'day')
      const aprRaw = monthEntry?.[1]?.predictedApr
        ?? weekEntry?.[1]?.predictedApr
        ?? dayEntry?.[1]?.predictedApr
      const apr = aprRaw != null ? Number(aprRaw) : 0
      if (Number.isFinite(apr) && apr > 0) {
        aprSum += apr
        aprCount += 1
      }
    }
    commissions.sort((a, b) => a - b)
    const medianCommission =
      commissions.length === 0
        ? 0
        : commissions[Math.floor(commissions.length / 2)]

    // Total supply — HL's `spotMeta` has the HYPE token entry; we look it
    // up if available. Fail-soft to 0 (the FE shows stake count + APR
    // even if supply is missing — not a blocker).
    let totalSupply = 0
    try {
      const spotRes = await client().post('/info', { type: 'spotMeta' })
      const tokens: any[] = spotRes.data?.tokens || []
      const hypeEntry = tokens.find(
        (t: any) => String(t?.name).toUpperCase() === 'HYPE',
      )
      if (hypeEntry) {
        totalSupply = Number(hypeEntry.totalSupply) || 0
      }
    } catch {
      /* skip */
    }

    return {
      totalStakedHype: totalStaked,
      totalSupplyHype: totalSupply,
      validatorCount: validators.length,
      apr: aprCount > 0 ? aprSum / aprCount : 0,
      medianCommission,
      fetchedAtMs: Date.now(),
    }
  } catch (err: any) {
    console.warn(`[hl] getStakingStats failed: ${err?.message?.slice(0, 100)}`)
    return null
  }
}

/** Cached at 5min — staking stats move slowly (validator set changes are
 *  weekly, APR drifts with usage). */
export async function getStakingStatsCached() {
  return cached('hl:staking-stats', 5 * 60 * 1000, () => getStakingStats())
}

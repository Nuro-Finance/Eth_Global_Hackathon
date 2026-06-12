// ─────────────────────────────────────────────────────────────────────────────
// NATIVE-PRICE — small CoinGecko-backed helper for native-token USD pricing
//
// S31 H2. Built specifically for tx-cap tx-cap coverage on the call sites
// that move native value (hype-bridge.ts, gas.ts) — those need a USD value
// per tx to compare against the cap, but they don't carry USD-denominated
// quotes the way swap.ts does.
//
// Constraints:
// - Cache aggressively (5-min TTL) so a tx-heavy minute doesn't burn
// through the CoinGecko free-tier rate limit
// - Fail-soft: if CoinGecko is rate-limited or down, return null so the
// caller can pass NaN to enforceTxCap and skip the gate (per tx-cap
// contract, NaN value = "skip silently, don't block on bad inputs")
// - No new deps — direct CoinGecko simple/price call

import axios from 'axios'
import { reportError } from './error-reporter'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

async function fetchCoinPrice(coinId: string): Promise<number | null> {
  try {
    const response = await axios.get(`${COINGECKO_BASE}/simple/price`, {
      params: { ids: coinId, vs_currencies: 'usd' },
      timeout: 10000,
    })
    return response.data[coinId]?.usd ?? null
  } catch (err: any) {
    reportError('execution', 'coingecko_price', coinId, 'Failed to fetch coin price', err)
    return null
  }
}

const PRICE_TTL_MS = 5 * 60 * 1000  // 5 minutes

interface CachedPrice {
  usd: number
  fetchedAt: number
}

const _cache = new Map<string, CachedPrice>()

/**
 * Map a chainId to the CoinGecko coin id for that chain's NATIVE token.
 * Returns null for chains we don't have a mapping for (caller skips
 * the cap check rather than crashing).
 */
export function nativeCoinIdForChain(chainId: number): string | null {
  switch (chainId) {
    case 1:      return 'ethereum'        // ETH
    case 8453:   return 'ethereum'        // Base ETH (same asset)
    case 42161:  return 'ethereum'        // Arbitrum ETH
    case 10:     return 'ethereum'        // Optimism ETH
    case 137:    return 'matic-network'   // MATIC / POL
    case 56:     return 'binancecoin'     // BNB
    case 43114:  return 'avalanche-2'     // AVAX
    case 999:    return 'hyperliquid'     // HYPE on HyperEVM
    case 59144:  return 'ethereum'        // Linea ETH
    case 130:    return 'ethereum'        // Unichain ETH
    case 146:    return 'sonic-2'         // Sonic S
    case 480:    return 'ethereum'        // World Chain ETH
    case 57073:  return 'ethereum'        // Ink ETH
    case 1329:   return 'sei-network'     // SEI
    case 100:    return 'xdai'            // Gnosis xDai (USD-pegged ~ 1.0)
    case 42220:  return 'celo'            // CELO
    case 324:    return 'ethereum'        // zkSync ETH
    case 534352: return 'ethereum'        // Scroll ETH
    default:     return null
  }
}

/**
 * Get USD price for a native token on `chainId`. 5-min cached.
 * Returns null if:
 * - chainId isn't in our map
 * - CoinGecko is rate-limited / down (next call retries naturally)
 *
 * Callers that want graceful degradation should null-coalesce to NaN
 * before passing to tx-cap:
 * const priceUsd = await nativeUsdPrice(chainId) ?? Number.NaN
 * const valueUsd = priceUsd * Number(ethers.utils.formatEther(weiAmount))
 */
export async function nativeUsdPrice(chainId: number): Promise<number | null> {
  const coinId = nativeCoinIdForChain(chainId)
  if (!coinId) return null

  const cached = _cache.get(coinId)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < PRICE_TTL_MS) {
    return cached.usd
  }

  const price = await fetchCoinPrice(coinId).catch(() => null)
  if (price == null || !Number.isFinite(price) || price <= 0) {
 // Don't cache failures — let the next call try again. If we cached
 // null, a transient rate-limit would freeze us at "no price" for
 // 5 minutes.
    return cached?.usd ?? null  // soft-fall back to last good
  }

  _cache.set(coinId, { usd: price, fetchedAt: now })
  return price
}

/**
 * Convert a wei BigNumber-ish value into USD using the cached native price.
 * Returns NaN when the price is unavailable — that's the sentinel
 * enforceTxCap recognizes as "skip the cap check" (per tx-cap contract:
 * never block on bad inputs).
 *
 * `decimals` defaults to 18 (the standard for ETH/MATIC/BNB/AVAX/HYPE etc.)
 */
export async function nativeValueToUsd(
  chainId: number,
  weiValue: { toString(): string },
  decimals = 18,
): Promise<number> {
  const price = await nativeUsdPrice(chainId)
  if (price == null) return Number.NaN
 // Avoid pulling ethers in here — formatUnits-equivalent done locally so
 // this module stays a pure function over BigInt-string inputs.
  const raw = BigInt(weiValue.toString())
  const divisor = 10n ** BigInt(decimals)
 // BigInt division loses fractional part; multiply by 1e6 first to keep
 // 6 decimal places of precision (more than enough for cap comparisons).
  const microUnits = Number((raw * 1_000_000n) / divisor) / 1_000_000
  return microUnits * price
}

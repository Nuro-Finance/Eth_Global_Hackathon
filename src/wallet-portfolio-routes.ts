/**
 * ─── WALLET PORTFOLIO ROUTES ─────────────────────────────────────────────────
 *
 * Session 25 Phase 3 — replaces the mock "Demo data" in /my-wallet with real
 * on-chain truth for the connected wallet address.
 *
 * Endpoints:
 * GET /wallet-portfolio?address=0x...&chains=1,8453,42161,137
 * → Native + ERC-20 balances via Alchemy, enriched with CoinGecko
 * USD prices. Returns totalUsd, delta24h, chains[], tokens[].
 *
 * GET /wallet-activity?address=0x...&limit=50
 * → Normalized asset transfer history via Alchemy getAssetTransfers.
 * Merges outgoing + incoming per chain, sorts by block desc.
 *
 * Auth: none. All data is public on-chain — we only proxy Alchemy so the
 * API key (extracted from RPC_URL_POLYGON on boot) stays server-side.
 *
 * Caching: 30-second in-memory cache per (address, chain) key. Cuts
 * duplicate calls when the UI refreshes.
 *
 * Rate limit: 10 requests per IP per 10s (sliding window, in-memory). Keeps
 * a single abusive client from burning through the Alchemy free-tier CU.
 */

import { Router, Request, Response } from 'express'
import axios from 'axios'

// ──────────────────────────────────────────────────────────────────────────
// Alchemy key + per-chain URL map
// ──────────────────────────────────────────────────────────────────────────

function extractAlchemyKey(): string | null {
 // Parse the key out of any of our RPC_URL_* env vars that point at alchemy.
  const candidates = [
    process.env.RPC_URL_POLYGON,
    process.env.RPC_URL_ETHEREUM,
    process.env.RPC_URL_BASE,
    process.env.RPC_URL_ARBITRUM,
    process.env.RPC_URL_OPTIMISM,
  ].filter(Boolean) as string[]
  for (const url of candidates) {
    const m = url.match(/g\.alchemy\.com\/v2\/([A-Za-z0-9_-]+)/)
    if (m) return m[1]
  }
  return null
}

const ALCHEMY_KEY = extractAlchemyKey()

const ALCHEMY_BASE_BY_CHAIN: Record<number, string> = {
  1: 'eth-mainnet.g.alchemy.com',
  8453: 'base-mainnet.g.alchemy.com',
  42161: 'arb-mainnet.g.alchemy.com',
  137: 'polygon-mainnet.g.alchemy.com',
  10: 'opt-mainnet.g.alchemy.com',
 // Day-5: extended to match the 7-chain wagmi config so the portfolio
 // panel actually surfaces small balances on the chains a user might
 // demo-deposit on (Avalanche, BSC). Alchemy supports both via the
 // standard host pattern; native AVAX + BNB pricing is via CoinGecko.
  43114: 'avax-mainnet.g.alchemy.com',
  56: 'bnb-mainnet.g.alchemy.com',
}

function alchemyUrl(chainId: number): string | null {
  const host = ALCHEMY_BASE_BY_CHAIN[chainId]
  if (!host || !ALCHEMY_KEY) return null
  return `https://${host}/v2/${ALCHEMY_KEY}`
}

// Day-5: bumped from 4 → 7 default chains so the wallet panel doesn't
// silently drop $3 on BSC just because BSC wasn't in the default query
// set. The +3 chains match the wagmi config additions (Optimism /
// Avalanche / BSC). Cost is 3 extra Alchemy calls per portfolio refresh,
// each cached for 30s.
const DEFAULT_CHAINS = [1, 8453, 42161, 137, 10, 43114, 56]

const CHAIN_META: Record<number, { name: string; nativeSymbol: string; coingeckoNativeId: string; coingeckoPlatform: string }> = {
  1: { name: 'Ethereum', nativeSymbol: 'ETH', coingeckoNativeId: 'ethereum', coingeckoPlatform: 'ethereum' },
  8453: { name: 'Base', nativeSymbol: 'ETH', coingeckoNativeId: 'ethereum', coingeckoPlatform: 'base' },
  42161: { name: 'Arbitrum', nativeSymbol: 'ETH', coingeckoNativeId: 'ethereum', coingeckoPlatform: 'arbitrum-one' },
  137: { name: 'Polygon', nativeSymbol: 'MATIC', coingeckoNativeId: 'matic-network', coingeckoPlatform: 'polygon-pos' },
  10: { name: 'Optimism', nativeSymbol: 'ETH', coingeckoNativeId: 'ethereum', coingeckoPlatform: 'optimistic-ethereum' },
  43114: { name: 'Avalanche', nativeSymbol: 'AVAX', coingeckoNativeId: 'avalanche-2', coingeckoPlatform: 'avalanche' },
  56: { name: 'BSC', nativeSymbol: 'BNB', coingeckoNativeId: 'binancecoin', coingeckoPlatform: 'binance-smart-chain' },
}

// ──────────────────────────────────────────────────────────────────────────
// Simple in-memory cache (TTL)
// ──────────────────────────────────────────────────────────────────────────

type CacheEntry<T> = { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>()
function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}
function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

// ──────────────────────────────────────────────────────────────────────────
// Simple per-IP sliding-window rate limit
// ──────────────────────────────────────────────────────────────────────────

const ipHits = new Map<string, number[]>()
const RATE_WINDOW_MS = 10_000
const RATE_MAX = 10
function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) ?? []).filter((t) => t > now - RATE_WINDOW_MS)
  arr.push(now)
  ipHits.set(ip, arr)
  return arr.length > RATE_MAX
}

// ──────────────────────────────────────────────────────────────────────────
// Alchemy JSON-RPC helpers
// ──────────────────────────────────────────────────────────────────────────

async function alchemyRpc<T>(chainId: number, method: string, params: unknown[]): Promise<T | null> {
  const url = alchemyUrl(chainId)
  if (!url) return null
  try {
    const res = await axios.post(
      url,
      { id: 1, jsonrpc: '2.0', method, params },
      { timeout: 8_000, headers: { 'Content-Type': 'application/json' } }
    )
    if (res.data?.error) {
      console.warn(`[wallet-portfolio] Alchemy ${method} chain=${chainId} error:`, res.data.error?.message)
      return null
    }
    return res.data?.result as T
  } catch (err: any) {
    console.warn(`[wallet-portfolio] Alchemy ${method} chain=${chainId} failed:`, err.message)
    return null
  }
}

type TokenBalance = { contractAddress: string; tokenBalance: string }
type TokenBalancesResult = { address: string; tokenBalances: TokenBalance[] }
type TokenMetadataResult = { name: string | null; symbol: string | null; decimals: number | null; logo: string | null }

async function fetchNativeBalance(chainId: number, address: string): Promise<bigint> {
  const res = await alchemyRpc<string>(chainId, 'eth_getBalance', [address, 'latest'])
  if (!res) return BigInt(0)
  return BigInt(res)
}

async function fetchErc20Balances(chainId: number, address: string): Promise<TokenBalance[]> {
  const res = await alchemyRpc<TokenBalancesResult>(chainId, 'alchemy_getTokenBalances', [address])
  if (!res) return []
 // Filter out zero balances (Alchemy returns everything we've ever held; most are 0)
  return res.tokenBalances.filter((t) => {
    if (!t.tokenBalance) return false
    try {
      return BigInt(t.tokenBalance) > BigInt(0)
    } catch {
      return false
    }
  })
}

async function fetchTokenMetadata(chainId: number, contract: string): Promise<TokenMetadataResult | null> {
  const cached = cacheGet<TokenMetadataResult>(`meta:${chainId}:${contract.toLowerCase()}`)
  if (cached) return cached
  const res = await alchemyRpc<TokenMetadataResult>(chainId, 'alchemy_getTokenMetadata', [contract])
  if (res) cacheSet(`meta:${chainId}:${contract.toLowerCase()}`, res, 24 * 60 * 60_000) // 24h
  return res
}

// ──────────────────────────────────────────────────────────────────────────
// CoinGecko price lookup
// ──────────────────────────────────────────────────────────────────────────

type CoinGeckoPrice = { usd?: number; usd_24h_change?: number }

// Stable global cache keys so different wallet queries share the same
// CoinGecko response (native prices aren't caller-specific).
// Day-5: extended to cover every native token that appears in CHAIN_META
// — was hardcoded to ['ethereum', 'matic-network'] only, so AVAX + BNB
// balances stayed at price=0 regardless of what was returned by Alchemy.
const GLOBAL_NATIVE_IDS = ['ethereum', 'matic-network', 'avalanche-2', 'binancecoin']
const CG_NATIVE_CACHE_KEY = `cg:native:${GLOBAL_NATIVE_IDS.join(',')}`
const CG_NATIVE_TTL_MS = 5 * 60_000 // 5 min — prices don't move that fast
const CG_NATIVE_STALE_TTL_MS = 60 * 60_000 // 1 hr stale-ok window on rate limit

async function fetchCoinGeckoNativePrices(_ids: string[]): Promise<Record<string, CoinGeckoPrice>> {
  const cached = cacheGet<Record<string, CoinGeckoPrice>>(CG_NATIVE_CACHE_KEY)
  if (cached) return cached
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${GLOBAL_NATIVE_IDS.join(',')}&vs_currencies=usd&include_24hr_change=true`
    const res = await axios.get<Record<string, CoinGeckoPrice>>(url, { timeout: 6_000 })
    cacheSet(CG_NATIVE_CACHE_KEY, res.data, CG_NATIVE_TTL_MS)
 // Also retain a "last known good" long-TTL copy for rate-limit fallbacks.
    cacheSet(CG_NATIVE_CACHE_KEY + ':stale', res.data, CG_NATIVE_STALE_TTL_MS)
    return res.data
  } catch (err: any) {
    console.warn('[wallet-portfolio] CoinGecko native price fail:', err.message, '— using stale cache if available')
    const stale = cacheGet<Record<string, CoinGeckoPrice>>(CG_NATIVE_CACHE_KEY + ':stale')
    return stale ?? {}
  }
}

async function fetchCoinGeckoTokenPrices(
  platform: string,
  contracts: string[]
): Promise<Record<string, CoinGeckoPrice>> {
  if (contracts.length === 0) return {}
  const uniq = Array.from(new Set(contracts.map((c) => c.toLowerCase())))
  const cacheKey = `cg:tok:${platform}:${uniq.sort().join(',')}`
  const cached = cacheGet<Record<string, CoinGeckoPrice>>(cacheKey)
  if (cached) return cached

 // CoinGecko URL hard-caps at ~100 contracts per call and rejects bad
 // formats with 400. Chunk aggressively to bound the blast radius of
 // one malformed address poisoning the whole batch.
  const CHUNK = 20
  const merged: Record<string, CoinGeckoPrice> = {}
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK)
    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${slice.join(',')}&vs_currencies=usd&include_24hr_change=true`
      const res = await axios.get<Record<string, CoinGeckoPrice>>(url, { timeout: 6_000 })
      Object.assign(merged, res.data)
    } catch (err: any) {
 // Swallow individual-chunk failures — partial pricing is better than
 // none. Log once per chunk for observability.
      console.warn(`[wallet-portfolio] CoinGecko ${platform} chunk ${i}-${i + slice.length} fail:`, err.message)
    }
  }
  cacheSet(cacheKey, merged, 60_000) // 60s
  return merged
}

// ──────────────────────────────────────────────────────────────────────────
// Types for response
// ──────────────────────────────────────────────────────────────────────────

export type WalletToken = {
  chainId: number
  chainName: string
  contract: string | null // null for native
  symbol: string
  name: string
  decimals: number
  logo: string | null
  balance: string // human-readable "1.23"
  balanceRaw: string // integer string
  usdPrice: number
  usdValue: number
  delta24h: number | null
  isNative: boolean
}

export type WalletPortfolioResponse = {
  address: string
  totalUsd: number
  delta24h: number | null // USD-weighted across tokens
  chains: Array<{
    chainId: number
    chainName: string
    nativeSymbol: string
    totalUsd: number
    tokenCount: number
  }>
  tokens: WalletToken[]
  fetchedAt: number
  chainStatuses: Record<number, 'ok' | 'error'>
}

// ──────────────────────────────────────────────────────────────────────────
// Portfolio endpoint
// ──────────────────────────────────────────────────────────────────────────

async function buildPortfolio(address: string, chainIds: number[]): Promise<WalletPortfolioResponse> {
  const cacheKey = `portfolio:${address.toLowerCase()}:${chainIds.sort().join(',')}`
  const cached = cacheGet<WalletPortfolioResponse>(cacheKey)
  if (cached) return cached

  const perChain = await Promise.all(
    chainIds.map(async (chainId) => {
      const meta = CHAIN_META[chainId]
      if (!meta) return { chainId, tokens: [] as WalletToken[], ok: false as const }
      try {
        const [nativeRaw, erc20s] = await Promise.all([
          fetchNativeBalance(chainId, address),
          fetchErc20Balances(chainId, address),
        ])

        const nativeHuman = Number(nativeRaw) / 1e18
        const tokens: WalletToken[] = []

 // Native slot
        if (nativeHuman > 0) {
          tokens.push({
            chainId,
            chainName: meta.name,
            contract: null,
            symbol: meta.nativeSymbol,
            name: meta.name + ' Native',
            decimals: 18,
            logo: null,
            balance: nativeHuman.toString(),
            balanceRaw: nativeRaw.toString(),
            usdPrice: 0,
            usdValue: 0,
            delta24h: null,
            isNative: true,
          })
        }

 // ERC-20 slots — cap at 25 per chain to keep Alchemy CU in check
        const capped = erc20s.slice(0, 25)
        const metas = await Promise.all(capped.map((t) => fetchTokenMetadata(chainId, t.contractAddress)))
        for (let i = 0; i < capped.length; i++) {
          const t = capped[i]
          const m = metas[i]
          if (!m || m.decimals == null || !m.symbol) continue
          const raw = BigInt(t.tokenBalance)
          const human = Number(raw) / Math.pow(10, m.decimals)
          if (human <= 0) continue
          tokens.push({
            chainId,
            chainName: meta.name,
            contract: t.contractAddress.toLowerCase(),
            symbol: m.symbol,
            name: m.name ?? m.symbol,
            decimals: m.decimals,
            logo: m.logo,
            balance: human.toString(),
            balanceRaw: raw.toString(),
            usdPrice: 0,
            usdValue: 0,
            delta24h: null,
            isNative: false,
          })
        }

        return { chainId, tokens, ok: true as const }
      } catch (err: any) {
        console.warn(`[wallet-portfolio] chain ${chainId} failed:`, err.message)
        return { chainId, tokens: [] as WalletToken[], ok: false as const }
      }
    })
  )

  const allTokens: WalletToken[] = perChain.flatMap((c) => c.tokens)

 // Price native
  const nativeIdsNeeded = Array.from(new Set(allTokens.filter((t) => t.isNative).map((t) => CHAIN_META[t.chainId]!.coingeckoNativeId)))
  const nativePrices = await fetchCoinGeckoNativePrices(nativeIdsNeeded)

 // Price ERC-20 per platform
  const byPlatform: Record<string, string[]> = {}
  for (const t of allTokens) {
    if (t.isNative || !t.contract) continue
    const platform = CHAIN_META[t.chainId]?.coingeckoPlatform
    if (!platform) continue
    if (!byPlatform[platform]) byPlatform[platform] = []
    byPlatform[platform].push(t.contract)
  }
  const platformPriceMaps: Record<string, Record<string, CoinGeckoPrice>> = {}
  await Promise.all(
    Object.entries(byPlatform).map(async ([platform, contracts]) => {
      platformPriceMaps[platform] = await fetchCoinGeckoTokenPrices(platform, contracts)
    })
  )

 // Apply prices
  for (const t of allTokens) {
    if (t.isNative) {
      const id = CHAIN_META[t.chainId]?.coingeckoNativeId
      const p = id ? nativePrices[id] : undefined
      if (p?.usd) {
        t.usdPrice = p.usd
        t.usdValue = Number(t.balance) * p.usd
        t.delta24h = p.usd_24h_change != null ? Number(p.usd_24h_change.toFixed(2)) : null
      }
    } else if (t.contract) {
      const platform = CHAIN_META[t.chainId]?.coingeckoPlatform
      const p = platform ? platformPriceMaps[platform]?.[t.contract] : undefined
      if (p?.usd) {
        t.usdPrice = p.usd
        t.usdValue = Number(t.balance) * p.usd
        t.delta24h = p.usd_24h_change != null ? Number(p.usd_24h_change.toFixed(2)) : null
      }
    }
  }

 // Sort by USD desc
  allTokens.sort((a, b) => b.usdValue - a.usdValue)

 // Totals + per-chain summary
  const totalUsd = allTokens.reduce((s, t) => s + t.usdValue, 0)
  let weighted = 0
  let weightSum = 0
  for (const t of allTokens) {
    if (t.delta24h == null) continue
    weighted += t.delta24h * t.usdValue
    weightSum += t.usdValue
  }
  const delta24h = weightSum > 0 ? Number((weighted / weightSum).toFixed(2)) : null

  const chains = chainIds.map((id) => {
    const meta = CHAIN_META[id]!
    const tokens = allTokens.filter((t) => t.chainId === id)
    return {
      chainId: id,
      chainName: meta.name,
      nativeSymbol: meta.nativeSymbol,
      totalUsd: tokens.reduce((s, t) => s + t.usdValue, 0),
      tokenCount: tokens.length,
    }
  })

  const chainStatuses: Record<number, 'ok' | 'error'> = {}
  for (const c of perChain) chainStatuses[c.chainId] = c.ok ? 'ok' : 'error'

  const response: WalletPortfolioResponse = {
    address,
    totalUsd,
    delta24h,
    chains,
    tokens: allTokens,
    fetchedAt: Date.now(),
    chainStatuses,
  }
  cacheSet(cacheKey, response, 30_000) // 30s TTL
  return response
}

// ──────────────────────────────────────────────────────────────────────────
// Activity endpoint
// ──────────────────────────────────────────────────────────────────────────

type AlchemyTransfer = {
  blockNum: string // hex
  hash: string
  from: string
  to: string
  value: number | null
  asset: string | null
  category: string
  rawContract?: { address?: string; decimal?: string; value?: string }
  metadata?: { blockTimestamp?: string }
}

export type WalletActivityEntry = {
  chainId: number
  chainName: string
  txHash: string
  timestamp: number
  direction: 'in' | 'out'
  asset: string
  amount: number
  from: string
  to: string
  category: string
}

async function fetchTransfersOneDirection(
  chainId: number,
  address: string,
  direction: 'from' | 'to',
  maxCount: number
): Promise<AlchemyTransfer[]> {
  const filterKey = direction === 'from' ? 'fromAddress' : 'toAddress'
 // Alchemy only supports the `internal` category on Ethereum mainnet +
 // Polygon; L2s (Base, Arbitrum, etc.) reject it with an error message.
  const supportsInternal = chainId === 1 || chainId === 137
  const category = supportsInternal
    ? ['external', 'internal', 'erc20']
    : ['external', 'erc20']
  const res = await alchemyRpc<{ transfers: AlchemyTransfer[] }>(chainId, 'alchemy_getAssetTransfers', [
    {
      [filterKey]: address,
      category,
      order: 'desc',
      maxCount: `0x${maxCount.toString(16)}`,
      withMetadata: true,
      excludeZeroValue: true,
    },
  ])
  return res?.transfers ?? []
}

async function buildActivity(address: string, limit: number): Promise<{ transfers: WalletActivityEntry[] }> {
  const cacheKey = `activity:${address.toLowerCase()}:${limit}`
  const cached = cacheGet<{ transfers: WalletActivityEntry[] }>(cacheKey)
  if (cached) return cached

  const perPair = await Promise.all(
    DEFAULT_CHAINS.flatMap((chainId) => [
      fetchTransfersOneDirection(chainId, address, 'from', limit).then((t) => ({ chainId, dir: 'out' as const, t })),
      fetchTransfersOneDirection(chainId, address, 'to', limit).then((t) => ({ chainId, dir: 'in' as const, t })),
    ])
  )

  const normalized: WalletActivityEntry[] = []
  for (const group of perPair) {
    const meta = CHAIN_META[group.chainId]
    if (!meta) continue
    for (const tr of group.t) {
      const ts = tr.metadata?.blockTimestamp ? Date.parse(tr.metadata.blockTimestamp) : 0
      normalized.push({
        chainId: group.chainId,
        chainName: meta.name,
        txHash: tr.hash,
        timestamp: ts,
        direction: group.dir,
        asset: tr.asset ?? 'UNKNOWN',
        amount: tr.value ?? 0,
        from: tr.from,
        to: tr.to,
        category: tr.category,
      })
    }
  }

  normalized.sort((a, b) => b.timestamp - a.timestamp)
  const top = normalized.slice(0, limit)

  const response = { transfers: top }
  cacheSet(cacheKey, response, 30_000)
  return response
}

// ──────────────────────────────────────────────────────────────────────────
// Solana portfolio builder
// ──────────────────────────────────────────────────────────────────────────
//
// Session 27 — Solana wallet-portfolio support. Uses public Solana RPC
// or SOLANA_RPC_URL env override. Enumerates SPL tokens via
// getTokenAccountsByOwner + decodes parsed account data. USD prices via
// CoinGecko platform='solana' lookup.
//
// Does NOT integrate with FE Privy yet — that's Session 28 polish. This
// endpoint is reachable via curl + testable standalone.

interface SolanaTokenBalance {
  mint: string
  symbol: string | null
  balance: number          // decimal-adjusted
  decimals: number
  usdPrice: number
  usdValue: number
}

interface SolanaPortfolioResponse {
  address: string
  chain: 'solana'
  totalUsd: number
  nativeBalance: number    // SOL
  nativeUsdValue: number
  tokens: SolanaTokenBalance[]
  fetchedAt: string
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const url = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  try {
    const res = await axios.post(
      url,
      { jsonrpc: '2.0', id: 1, method, params },
      { timeout: 10_000, headers: { 'Content-Type': 'application/json' } }
    )
    if (res.data?.error) {
      console.warn(`[solana-portfolio] RPC ${method} error:`, res.data.error?.message)
      return null
    }
    return res.data?.result as T
  } catch (err: any) {
    console.warn(`[solana-portfolio] RPC ${method} failed:`, err.message?.slice(0, 100))
    return null
  }
}

async function fetchSolanaPrices(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  if (mints.length === 0) return prices
 // CoinGecko contract-address endpoint for Solana platform
  try {
 // Chunk to 50 addresses per request to stay under 414 URI limits
    const chunks: string[][] = []
    for (let i = 0; i < mints.length; i += 50) chunks.push(mints.slice(i, i + 50))
    for (const chunk of chunks) {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${chunk.join(',')}&vs_currencies=usd`
      try {
        const res = await axios.get(url, { timeout: 8_000 })
        for (const [mint, obj] of Object.entries(res.data || {})) {
          const usd = (obj as any)?.usd
          if (typeof usd === 'number') prices.set(mint.toLowerCase(), usd)
        }
      } catch {
 // Per-chunk tolerance — one 429 shouldn't kill the whole response
      }
    }
  } catch (err: any) {
    console.warn('[solana-portfolio] CoinGecko batch failed:', err.message?.slice(0, 100))
  }
  return prices
}

async function fetchNativeSolPrice(): Promise<number> {
  try {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 5_000 }
    )
    return Number(res.data?.solana?.usd) || 0
  } catch {
    return 0
  }
}

async function buildSolanaPortfolio(address: string): Promise<SolanaPortfolioResponse> {
 // 1. Native SOL balance — lamports
  const balanceResult = await solanaRpc<{ value: number }>('getBalance', [address])
  const lamports = balanceResult?.value ?? 0
  const sol = lamports / 1e9

 // 2. SPL token accounts — parsed
  const splResult = await solanaRpc<{
    value: Array<{ account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number; decimals: number } } } } } }>
  }>('getTokenAccountsByOwner', [
    address,
    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    { encoding: 'jsonParsed' },
  ])

  const rawTokens = (splResult?.value || []).map((acct) => {
    const info = acct.account?.data?.parsed?.info
    return {
      mint: info?.mint,
      balance: info?.tokenAmount?.uiAmount ?? 0,
      decimals: info?.tokenAmount?.decimals ?? 0,
    }
  }).filter(t => t.mint && t.balance > 0)

 // 3. Price lookup
  const [mintPrices, solPrice] = await Promise.all([
    fetchSolanaPrices(rawTokens.map(t => t.mint.toLowerCase())),
    fetchNativeSolPrice(),
  ])

 // 4. Compose response with symbols (we only know well-known mints by heart)
  const KNOWN_MINTS: Record<string, string> = {
    'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v': 'USDC',
    'es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb': 'USDT',
    'so11111111111111111111111111111111111111112': 'WSOL',
    'bn1i8kxqwnxlubnfjwkzyxsvsbvatjfkbvzgbnrh1pl': 'BONK',
    '4k3dyjzvzp8emzwukbbdhcr6mf9uxo7ocjvlysmfmhqp': 'SHDW',
    'mspltokenmintuaseas5wucvdxymeyhomhaqgpcfrk': 'MSOL',
  }

 // Stablecoins anchor to $1 regardless of CoinGecko hit — they occasionally
 // 404 or return null for specific mints and we shouldn't zero out a user's
 // real balance because of a feed glitch.
  const STABLECOIN_MINTS: Record<string, number> = {
    'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v': 1.0,  // USDC
    'es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb': 1.0,  // USDT
  }

  const tokens: SolanaTokenBalance[] = rawTokens.map(t => {
    const mintLower = t.mint.toLowerCase()
    const feedPrice = mintPrices.get(mintLower)
    const usdPrice = (feedPrice && feedPrice > 0) ? feedPrice : (STABLECOIN_MINTS[mintLower] ?? 0)
    return {
      mint: t.mint,
      symbol: KNOWN_MINTS[mintLower] ?? null,
      balance: t.balance,
      decimals: t.decimals,
      usdPrice,
      usdValue: t.balance * usdPrice,
    }
  })

  const tokensUsd = tokens.reduce((s, t) => s + t.usdValue, 0)
  const nativeUsdValue = sol * solPrice
  const totalUsd = nativeUsdValue + tokensUsd

  return {
    address,
    chain: 'solana',
    totalUsd,
    nativeBalance: sol,
    nativeUsdValue,
    tokens,
    fetchedAt: new Date().toISOString(),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Router factory
// ──────────────────────────────────────────────────────────────────────────

export function createWalletPortfolioRouter(): Router {
  const router = Router()

  if (!ALCHEMY_KEY) {
    console.warn('[wallet-portfolio] ALCHEMY key not found in RPC_URL_* env vars — /wallet-portfolio + /wallet-activity will return 503.')
  }

  router.get('/wallet-portfolio', async (req: Request, res: Response) => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown'
    if (isRateLimited(ip)) return res.status(429).json({ error: 'rate limit — wait a few seconds' })
    if (!ALCHEMY_KEY) return res.status(503).json({ error: 'Alchemy not configured on backend' })

    const address = String(req.query.address || '').trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'address must be a 0x-prefixed 40-char hex string' })
    }
    const chainsRaw = String(req.query.chains || '').trim()
    const chains = chainsRaw
      ? chainsRaw.split(',').map((c) => Number(c)).filter((n) => CHAIN_META[n] != null)
      : DEFAULT_CHAINS

    try {
      const data = await buildPortfolio(address, chains)
      res.json(data)
    } catch (err: any) {
      console.error('[wallet-portfolio] GET failed:', err.message)
      res.status(500).json({ error: 'portfolio build failed', detail: err.message })
    }
  })

 // Session 27 — Solana wallet portfolio. Standalone endpoint (not merged into
 // /wallet-portfolio because Solana addresses are base58 not 0x + different
 // RPC). Uses public Solana RPC or SOLANA_RPC_URL env. SPL token enumeration
 // via getParsedTokenAccountsByOwner; prices via CoinGecko platform='solana'.
  router.get('/wallet-portfolio-solana', async (req: Request, res: Response) => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown'
    if (isRateLimited(ip)) return res.status(429).json({ error: 'rate limit — wait a few seconds' })

    const address = String(req.query.address || '').trim()
 // Base58 validation — Solana addresses are 32-44 chars, no 0, O, I, l
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return res.status(400).json({ error: 'address must be a base58 Solana public key (32-44 chars)' })
    }

    const cacheKey = `sol:${address}`
    const cached = cacheGet<any>(cacheKey)
    if (cached) return res.json(cached)

    try {
      const data = await buildSolanaPortfolio(address)
      cacheSet(cacheKey, data, 30_000)
      res.json(data)
    } catch (err: any) {
      console.error('[wallet-portfolio-solana] failed:', err.message?.slice(0, 100))
      res.status(500).json({ error: 'solana portfolio build failed', detail: err.message?.slice(0, 200) })
    }
  })

  router.get('/wallet-activity', async (req: Request, res: Response) => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown'
    if (isRateLimited(ip)) return res.status(429).json({ error: 'rate limit — wait a few seconds' })
    if (!ALCHEMY_KEY) return res.status(503).json({ error: 'Alchemy not configured on backend' })

    const address = String(req.query.address || '').trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'address must be a 0x-prefixed 40-char hex string' })
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)

    try {
      const data = await buildActivity(address, limit)
      res.json(data)
    } catch (err: any) {
      console.error('[wallet-activity] GET failed:', err.message)
      res.status(500).json({ error: 'activity fetch failed', detail: err.message })
    }
  })

  return router
}

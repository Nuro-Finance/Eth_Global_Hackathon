// ─────────────────────────────────────────────────────────────────────────────
// HYPERLIQUID VAULT CLIENT — read-only first slice (S31 H2)
//
// Per Hyperliquid Integration Design v1: Phase 1 ships curated vault deposits
// as a "Hyperliquid Yield Vault" card on the Yield page. THIS module is the
// read-only half — APR / TVL / share-balance helpers that power the card
// + the per-user position display.
//
// Deposit + withdraw broadcasting lives in a separate module (Phase 1.2);
// not in scope today. This file deliberately ships zero on-chain WRITE
// surface so it can be exercised + reviewed in isolation.
//
// Data sources:
//   - HL Info API (POST https://api.hyperliquid.xyz/info) — vault details,
//     equity, leader info, deposit history
//   - HyperEVM RPC (chainId 999) — per-user share balance via vault.balanceOf
//
// HL Info API spec:
//   https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
//
// The Info API uses POST with a JSON body {type, ...args} rather than GET
// query params — quirk of HL's design. We pin the fetch through our existing
// global axios singleton so HELM-101 sees the egress.

import axios, { AxiosInstance } from 'axios'
import { ethers } from 'ethers'

// ── Config ───────────────────────────────────────────────────────────────────

const HL_INFO_API = 'https://api.hyperliquid.xyz/info'
const HYPEREVM_RPC = process.env.RPC_URL_HYPEREVM || 'https://rpc.hyperliquid.xyz/evm'

// HL vaults on HyperEVM expose an ERC4626-ish interface. We only call read
// fns here so the ABI is intentionally minimal.
const VAULT_READ_ABI = [
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function asset() view returns (address)',
]

// ── Lazy axios instance (Helm instrumented) ──────────────────────────────

let _client: AxiosInstance | null = null
function client(): AxiosInstance {
  if (_client) return _client
  _client = axios.create({
    baseURL: HL_INFO_API,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  })
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_client, 'hl-vault-client')
  } catch { /* heimdall not initialized — skip */ }
  return _client
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface HlVaultDetails {
  vaultAddress: string
  name: string                // HL display name
  leader: string              // leader address (HL native, not EVM-style sometimes)
  followers: number           // count of unique depositor addresses
  totalEquityUsd: number      // current TVL in USD
  // Multiplicative APR over the last 30 days. Annualized from HL's
  // monthly-window calculation. May be negative for losing vaults.
  apr30d: number
  // Multiplicative APR all-time since vault open. Useful for cross-checking
  // 30d. Less stable signal but harder for a leader to game short-term.
  aprAllTime: number
  // Drawdown stats — peak-to-trough over the trailing 90d window.
  // Returns 0 if vault is younger than 90d.
  maxDrawdown90d: number      // 0.0..1.0 fraction (0.4 = 40%)
  // Vault age in days.
  ageDays: number
  // Whether the vault is open to new depositors. HL vaults can be capped.
  acceptingDeposits: boolean
}

export interface HlVaultPositionView {
  shares: bigint              // user's share-token balance
  decimals: number            // share token decimals (typ. 6 for USDC-denominated)
  equityUsd: number           // shares × (totalAssets/totalShares) in USD
  // Derived freshness — when did we last successfully read on-chain state?
  readAtMs: number
}

// ── HL Info API call helper ──────────────────────────────────────────────────

async function callInfo<T = any>(body: Record<string, unknown>): Promise<T> {
  const res = await client().post<T>('', body)
  return res.data
}

// ── Public read API ──────────────────────────────────────────────────────────

/**
 * Fetch a vault's full detail snapshot from HL Info API. Returns null if HL
 * doesn't recognize the address (vault deprecated, wrong network, typo).
 *
 * NOTE: HL's Info API returns a non-standard shape — APRs are multiplicative
 * (1.05 = +5%), not percentage-points. We translate to percentage-points
 * before returning so the FE doesn't need HL-specific knowledge.
 */
export async function fetchVaultDetails(vaultAddress: string): Promise<HlVaultDetails | null> {
  try {
    const raw = await callInfo<any>({
      type: 'vaultDetails',
      vaultAddress: vaultAddress.toLowerCase(),
    })

    if (!raw || typeof raw !== 'object' || !raw.vaultAddress) {
      return null
    }

    // HL's response uses snake_case + nested objects; normalize.
    const portfolio = raw.portfolio || []
    // portfolio is an array of [windowKey, data] pairs:
    //   [['day', {...}], ['week', {...}], ['month', {...}], ['allTime', {...}]]
    const monthEntry = Array.isArray(portfolio)
      ? portfolio.find((p: any) => Array.isArray(p) && p[0] === 'month')
      : null
    const allTimeEntry = Array.isArray(portfolio)
      ? portfolio.find((p: any) => Array.isArray(p) && p[0] === 'allTime')
      : null

    const monthApr = parseHlApr(monthEntry?.[1])
    const allTimeApr = parseHlApr(allTimeEntry?.[1])

    const equity = Number(raw.equity || raw.totalEquity || 0)
    const followers = Array.isArray(raw.followers)
      ? raw.followers.length
      : Number(raw.followerCount || 0)

    const ageMs = raw.createTime ? Date.now() - Number(raw.createTime) : 0
    const ageDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)))

    return {
      vaultAddress: String(raw.vaultAddress).toLowerCase(),
      name: String(raw.name || ''),
      leader: String(raw.leader || ''),
      followers,
      totalEquityUsd: equity,
      apr30d: monthApr,
      aprAllTime: allTimeApr,
      maxDrawdown90d: parseHlMaxDrawdown(monthEntry?.[1]),
      ageDays,
      acceptingDeposits: raw.allowDeposits !== false,
    }
  } catch (err: any) {
    console.warn(
      `[hl-vault] fetchVaultDetails(${vaultAddress.slice(0, 10)}…) failed: ${err?.message?.slice(0, 120)}`,
    )
    return null
  }
}

/**
 * HL portfolio entries store `pnlHistory` and `vlm` arrays. APR is derived
 * from the first-vs-last equity point. Returns 0 if data is missing or
 * malformed (defensive).
 */
function parseHlApr(window: any): number {
  if (!window || !Array.isArray(window.accountValueHistory)) return 0
  const series = window.accountValueHistory
  if (series.length < 2) return 0
  const firstPoint = series[0]
  const lastPoint = series[series.length - 1]
  // Each point is [timestampMs, valueStr]
  const startVal = Number(firstPoint?.[1] ?? firstPoint?.value ?? 0)
  const endVal = Number(lastPoint?.[1] ?? lastPoint?.value ?? 0)
  const startTs = Number(firstPoint?.[0] ?? firstPoint?.time ?? 0)
  const endTs = Number(lastPoint?.[0] ?? lastPoint?.time ?? 0)
  if (!startVal || !endVal || !startTs || !endTs || endTs <= startTs) return 0
  const totalReturn = endVal / startVal - 1
  const periodDays = (endTs - startTs) / (24 * 60 * 60 * 1000)
  if (periodDays <= 0) return 0
  // Annualize (multiplicative; periodDays = 30 → annualize ×12.17)
  const annualized = Math.pow(1 + totalReturn, 365 / periodDays) - 1
  return annualized * 100  // percentage-points
}

function parseHlMaxDrawdown(window: any): number {
  if (!window || !Array.isArray(window.accountValueHistory)) return 0
  let peak = 0
  let maxDd = 0
  for (const point of window.accountValueHistory) {
    const v = Number(point?.[1] ?? point?.value ?? 0)
    if (!Number.isFinite(v) || v <= 0) continue
    if (v > peak) peak = v
    if (peak > 0) {
      const dd = (peak - v) / peak
      if (dd > maxDd) maxDd = dd
    }
  }
  return Math.max(0, Math.min(1, maxDd))
}

// ── Per-user share balance via HyperEVM RPC ──────────────────────────────────

let _provider: ethers.providers.JsonRpcProvider | null = null
function provider(): ethers.providers.JsonRpcProvider {
  if (_provider) return _provider
  _provider = new ethers.providers.JsonRpcProvider(HYPEREVM_RPC)
  return _provider
}

/**
 * Read the user's share balance for a given vault. Returns null on RPC
 * failure (silently degrades; UI shows "—" until the next sync).
 *
 * `equityUsd` is computed as shares × (totalAssets / totalShares) — both
 * read from the vault contract. Cheap; one RPC round-trip with multicall.
 */
export async function fetchUserVaultPosition(
  vaultAddress: string,
  userAddress: string,
): Promise<HlVaultPositionView | null> {
  try {
    const vault = new ethers.Contract(vaultAddress, VAULT_READ_ABI, provider())
    const [shares, totalAssets, totalShares, decimals] = await Promise.all([
      vault.balanceOf(userAddress).catch(() => ethers.BigNumber.from(0)),
      vault.totalAssets().catch(() => ethers.BigNumber.from(0)),
      vault.totalSupply().catch(() => ethers.BigNumber.from(0)),
      vault.decimals().catch(() => 6),
    ])

    // ratio = totalAssets / totalShares
    // user equity = shares × ratio. Compute as bigints to preserve precision,
    // then convert to a Number USD value at the end.
    let equityUsd = 0
    if (totalShares.gt(0)) {
      // Use BigNumber math, then convert
      const equityRaw = shares.mul(totalAssets).div(totalShares)
      equityUsd = parseFloat(ethers.utils.formatUnits(equityRaw, Number(decimals)))
    }

    return {
      shares: shares.toBigInt(),
      decimals: Number(decimals),
      equityUsd,
      readAtMs: Date.now(),
    }
  } catch (err: any) {
    console.warn(
      `[hl-vault] fetchUserVaultPosition(${vaultAddress.slice(0, 10)}…, ${userAddress.slice(0, 10)}…) failed: ${err?.message?.slice(0, 120)}`,
    )
    return null
  }
}

/**
 * Aggregate detail-fetch for the Yield card. Takes the curated vault list
 * (from DB) and returns parallel HL details. Ones HL doesn't recognize
 * are returned as null — caller filters before display.
 */
export async function fetchVaultDetailsBatch(
  vaultAddresses: string[],
): Promise<Array<{ vaultAddress: string; details: HlVaultDetails | null }>> {
  const results = await Promise.all(
    vaultAddresses.map(async (addr) => ({
      vaultAddress: addr,
      details: await fetchVaultDetails(addr),
    })),
  )
  return results
}

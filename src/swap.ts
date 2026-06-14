/**
 * Native-token → USDC auto-swap via 0x Aggregator v2 (Session 23 Marathon 7).
 *
 * Use case: a user sends ETH/MATIC/BNB (native token, not USDC) to their
 * HD-derived deposit address. Monitor detects native balance > $5 threshold
 * and invokes this module. Swap produces USDC at the same address; the next
 * monitor poll cycle picks up the USDC and routes it through the existing
 * CCTP/LZ bridge pipeline to Base → Issuer → Visa card.
 *
 * Architecture decisions:
 * - 0x Aggregator v2, AllowanceHolder flavor (simpler than permit2 for
 * native-token swaps - no signature, no permit, just a plain tx).
 * - One chain at a time: chainId selected by caller, 0x routes via that
 * chain's liquidity (Uniswap V3, Sushi, PancakeSwap on BSC, etc).
 * - Slippage: 300 bps (3%) per MVP call. Configurable via
 * ZEROX_SLIPPAGE_BPS env var.
 * - Min swap: $5 USD-equivalent of USDC output. Below that, we decline
 * the swap and log - user's native token stays put, they can top up.
 * - Revert-safe: failures log to execution_log with reason, native balance
 * is untouched. No side effects on failure.
 * - ALLOWLIST: only tokens in NATIVE_TOKENS below get swapped. Memecoin
 * support is explicitly deferred - verifiable liquidity + anti-scam
 * audit required before adding any ERC-20 ( call).
 */
import { ethers } from 'ethers'
import axios from 'axios'
import { Pool } from 'pg'
import { CONFIG } from './config'
import { pool as dbPool } from './db'
import { enforceTxCap } from './helm'

// ─── NATIVE TOKEN CATALOG ────────────────────────────────────────────────────
// Per 0x API convention, native token is the sentinel address
// 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE. We map each supported chain to
// its USDC output address (which 0x routes into).
export interface NativeTokenInfo {
    chainId: number
    chainName: string
    nativeSymbol: string           // 'ETH', 'MATIC', 'BNB'
    nativeDecimals: number         // 18 for all EVM natives we support
    usdcAddress: string            // USDC contract on this chain (6 decimals)
    usdcDecimals: number           // always 6 for USDC
}

export const NATIVE_TOKENS: Record<number, NativeTokenInfo> = {
    1: {
        chainId: 1,
        chainName: 'Ethereum',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        usdcDecimals: 6,
    },
    137: {
        chainId: 137,
        chainName: 'Polygon',
        nativeSymbol: 'MATIC',
        nativeDecimals: 18,
        usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        usdcDecimals: 6,
    },
    8453: {
        chainId: 8453,
        chainName: 'Base',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        usdcDecimals: 6,
    },
    42161: {
        chainId: 42161,
        chainName: 'Arbitrum',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        usdcDecimals: 6,
    },
    10: {
        chainId: 10,
        chainName: 'Optimism',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        usdcDecimals: 6,
    },
    56: {
        chainId: 56,
        chainName: 'BSC',
        nativeSymbol: 'BNB',
        nativeDecimals: 18,
 // BSC USDC is the Binance-Peg 18-dec token (Session 22 decimals incident)
        usdcAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        usdcDecimals: 18,
    },
 // Session 23 late-add - 7 more chains 0x confirmed supports for native-swap.
 // Verified via live /price call 2026-04-18. If a chain stops working, remove
 // it here; the monitor-skips telemetry will surface failures.
    43114: {
        chainId: 43114,
        chainName: 'Avalanche',
        nativeSymbol: 'AVAX',
        nativeDecimals: 18,
        usdcAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',  // native USDC
        usdcDecimals: 6,
    },
    59144: {
        chainId: 59144,
        chainName: 'Linea',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',  // USDC.e
        usdcDecimals: 6,
    },
    534352: {
        chainId: 534352,
        chainName: 'Scroll',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',  // native USDC
        usdcDecimals: 6,
    },
    130: {
        chainId: 130,
        chainName: 'Unichain',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',  // USDC bridged
        usdcDecimals: 6,
    },
    480: {
        chainId: 480,
        chainName: 'World Chain',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        usdcAddress: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',  // USDC.e
        usdcDecimals: 6,
    },
    146: {
        chainId: 146,
        chainName: 'Sonic',
        nativeSymbol: 'S',
        nativeDecimals: 18,
        usdcAddress: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',  // USDC.e
        usdcDecimals: 6,
    },
    999: {
        chainId: 999,
        chainName: 'HyperEVM',
        nativeSymbol: 'HYPE',
        nativeDecimals: 18,
        usdcAddress: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
        usdcDecimals: 6,
    },
}

// 0x API native-token sentinel
const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

// 0x API base URL (v2)
const ZEROX_API_BASE = 'https://api.0x.org'

// ─── ERC-20 SWAP ALLOWLIST ──────────────────────────────────────────────────
// Session 23 Thread D. Curated list of ERC-20s we accept for reload-card
// auto-swap. Every token here has been verified against the Memecoin Allowlist
// Policy (see Neural Net/Claude Memory/Memecoin Allowlist Policy.md):
// - Contract source verified on Etherscan/Basescan
// - >$500K on-chain liquidity (Uniswap V3 or comparable)
// - Age > 6 months
// - Not flagged on TokenSniffer/GoPlus/CoinGecko
// - 0x has a swap route
// Memecoin additions go behind ERC20_MEMECOIN_ENABLED flag (off by default).

export interface Erc20TokenInfo {
    symbol: string            // 'LINK', 'UNI', 'DOGE' etc - how user sees it in FE
    name: string              // 'Chainlink'
    address: string           // contract address (checksummed)
    decimals: number          // typically 18, USDT is 6
    category: 'bluechip' | 'memecoin'
    auditedAt: string         // YYYY-MM-DD of most recent policy review
    minLiquidityUsd: number   // Measured liquidity at audit time (for telemetry)
}

// ─── DB-BACKED ALLOWLIST (Session 23 Thread D refactor) ─────────────────────
// Previously ERC20_ALLOWLIST was a hardcoded constant. Adding/removing tokens
// required a code commit + redeploy (~10 min cycle). Now the authoritative
// list lives in the `erc20_allowlist` Postgres table (migration 025); this
// module keeps a 60-second in-memory snapshot so `findErc20()` stays sync
// and cheap. Refresh happens lazily via `ensureAllowlistFresh()`; callers
// who care about freshness (monitor poll, admin panel) await it explicitly.

const ALLOWLIST_TTL_MS = 60_000
let allowlistSnapshot: Record<number, Erc20TokenInfo[]> = {}
let allowlistLastRefresh = 0

async function refreshAllowlistSnapshot(): Promise<void> {
    try {
        const result = await dbPool.query(
            `SELECT chain_id, symbol, display_name, contract_address, decimals,
                    category, audited_at, min_liquidity_usd
             FROM erc20_allowlist
             WHERE enabled = true
             ORDER BY chain_id, symbol`
        )
        const next: Record<number, Erc20TokenInfo[]> = {}
        for (const row of result.rows) {
            const cid = Number(row.chain_id)
            if (!next[cid]) next[cid] = []
            next[cid].push({
                symbol: row.symbol,
                name: row.display_name,
                address: row.contract_address,
                decimals: Number(row.decimals),
                category: row.category,
                auditedAt: row.audited_at instanceof Date
                    ? row.audited_at.toISOString().slice(0, 10)
                    : String(row.audited_at),
                minLiquidityUsd: Number(row.min_liquidity_usd || 0),
            })
        }
        allowlistSnapshot = next
        allowlistLastRefresh = Date.now()
    } catch (err: any) {
 // Keep previous snapshot on error - safer than wiping the allowlist
 // (which would disable every ERC-20 swap silently). Log so audit trails
 // pick it up.
        console.warn(`[swap] allowlist refresh failed: ${err.message?.slice(0, 80)}`)
    }
}

/**
 * Ensure the in-memory allowlist is <60s old. Idempotent + cheap: if the
 * snapshot is fresh we skip the DB round-trip. Call this at the top of any
 * code path that will invoke `findErc20` or iterate allowlist entries.
 */
export async function ensureAllowlistFresh(): Promise<void> {
    if (Date.now() - allowlistLastRefresh > ALLOWLIST_TTL_MS) {
        await refreshAllowlistSnapshot()
    }
}

/**
 * Force-refresh the allowlist snapshot NOW. Use after admin writes
 * (enable/disable token) so changes take effect immediately instead of
 * waiting up to 60s for the TTL.
 */
export async function forceRefreshAllowlist(): Promise<void> {
    await refreshAllowlistSnapshot()
}

/**
 * Returns the whole allowlist snapshot (all chains). Synchronous - reads
 * from the in-memory cache. Await `ensureAllowlistFresh()` first if you
 * need fresh data.
 */
export function getErc20Allowlist(): Record<number, Erc20TokenInfo[]> {
    return allowlistSnapshot
}

/**
 * Returns allowlist entries for a single chain, or [] if none.
 */
export function getErc20AllowlistForChain(chainId: number): Erc20TokenInfo[] {
    return allowlistSnapshot[chainId] || []
}

/**
 * Lookup an allowlisted ERC-20 by (chainId, symbol). Returns null if the
 * token isn't on our allowlist for that chain - NEVER fall back to "try
 * anyway", that's how you get rugged.
 *
 * SYNC. Reads from the in-memory snapshot. Callers that need freshness
 * must await `ensureAllowlistFresh()` beforehand.
 */
export function findErc20(chainId: number, symbol: string): Erc20TokenInfo | null {
    const list = allowlistSnapshot[chainId]
    if (!list) return null
    return list.find(t => t.symbol.toUpperCase() === symbol.toUpperCase()) || null
}

/**
 * Back-compat alias for call sites that still import `ERC20_ALLOWLIST`.
 * Deprecated - new code should use `getErc20Allowlist()` or
 * `getErc20AllowlistForChain(chainId)`. Exported as a getter so the
 * returned object tracks snapshot refreshes.
 *
 * @deprecated Use getErc20Allowlist() or findErc20(chainId, symbol)
 */
export const ERC20_ALLOWLIST = new Proxy({} as Record<number, Erc20TokenInfo[]>, {
    get(_target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            return allowlistSnapshot[Number(prop)] || []
        }
        return undefined
    },
    ownKeys() {
        return Object.keys(allowlistSnapshot)
    },
    getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            return {
                configurable: true,
                enumerable: true,
                value: allowlistSnapshot[Number(prop)] || [],
            }
        }
        return undefined
    },
})

export interface SwapQuote {
    chainId: number
    sellAmount: ethers.BigNumber              // native token amount to sell (raw, 18-dec)
    buyAmount: ethers.BigNumber               // expected USDC out (raw, usually 6-dec)
    minBuyAmount: ethers.BigNumber            // buyAmount × (1 - slippageBps/10000)
    buyAmountUsd: number                      // human-readable USD value (float)
    to: string                                // AllowanceHolder contract address
    data: string                              // swap calldata
    value: string                             // ETH/native to send as msg.value (hex string)
    gas?: string                              // gas estimate from 0x
    meetsThreshold: boolean                   // buyAmountUsd >= CONFIG.SWAP_MIN_USD
}

export interface SwapResult {
    success: boolean
    txHash?: string
    reason?: string                           // failure reason if !success
    buyAmount?: ethers.BigNumber              // actual USDC received (if success)
}

/**
 * Core quote fetcher - used by both native and ERC-20 paths. Hits the 0x
 * allowance-holder v2 endpoint with a specific sellToken (either the
 * native sentinel or an ERC-20 contract address).
 */
/** Buy-side override. When omitted, defaults to USDC on `chainId` (backward
 * compat with the original native/ERC-20 → USDC card-credit pipeline). */
export interface BuyTokenOverride {
    address: string
    decimals: number
 /** USD price-per-unit if known. Used for buyAmountUsd calc. NaN/undefined
 * → buyAmountUsd reported as NaN and meetsThreshold falls back to true
 * (caller doesn't get the SWAP_MIN_USD floor - fine for user-initiated
 * trades where the user picked the destination). */
    usdPricePerUnit?: number
}

async function fetchZeroExQuote(
    chainId: number,
    sellToken: string,
    sellAmount: ethers.BigNumber,
    takerAddress: string,
    buyOverride?: BuyTokenOverride,
): Promise<SwapQuote> {
    const token = NATIVE_TOKENS[chainId]
    if (!token) throw new Error(`swap: unsupported chainId ${chainId}`)
    if (!CONFIG.ZEROX_API_KEY) throw new Error('swap: ZEROX_API_KEY not set')

 // Default buy-side is USDC on this chain. Override lets the FE wallet
 // panel target any allowlisted destination (memecoin, bluechip, native).
    const buyAddress = buyOverride?.address ?? token.usdcAddress
    const buyDecimals = buyOverride?.decimals ?? token.usdcDecimals
    const isBuyUsdc = !buyOverride || buyOverride.address.toLowerCase() === token.usdcAddress.toLowerCase()

    const params = {
        chainId: String(chainId),
        sellToken,
        buyToken: buyAddress,
        sellAmount: sellAmount.toString(),
        taker: takerAddress,
        slippageBps: String(CONFIG.ZEROX_SLIPPAGE_BPS),
    }

    const url = `${ZEROX_API_BASE}/swap/allowance-holder/quote`
    const res = await axios.get(url, {
        params,
        headers: {
            '0x-api-key': CONFIG.ZEROX_API_KEY,
            '0x-version': 'v2',
        },
        timeout: 15_000,
    })

    const q = res.data
    const buyAmount = ethers.BigNumber.from(q.buyAmount)
    const minBuyAmount = ethers.BigNumber.from(q.minBuyAmount || q.buyAmount)
 // USDC buys: buyAmount IS the USD value (1:1 6-dec).
 // Non-USDC buys: need a price feed to translate to USD; if caller passed
 // one in `buyOverride.usdPricePerUnit`, use it. Otherwise emit NaN and
 // skip the SWAP_MIN_USD floor (that floor only protects the card-credit
 // pipeline; non-USDC swaps are user-initiated and don't need it).
    let buyAmountUsd: number
    let meetsThreshold: boolean
    if (isBuyUsdc) {
        buyAmountUsd = parseFloat(ethers.utils.formatUnits(buyAmount, buyDecimals))
        meetsThreshold = buyAmountUsd >= CONFIG.SWAP_MIN_USD
    } else if (buyOverride?.usdPricePerUnit && Number.isFinite(buyOverride.usdPricePerUnit)) {
        const buyAmountFloat = parseFloat(ethers.utils.formatUnits(buyAmount, buyDecimals))
        buyAmountUsd = buyAmountFloat * buyOverride.usdPricePerUnit
        meetsThreshold = buyAmountUsd >= CONFIG.SWAP_MIN_USD
    } else {
        buyAmountUsd = Number.NaN
        meetsThreshold = true
    }

    return {
        chainId,
        sellAmount,
        buyAmount,
        minBuyAmount,
        buyAmountUsd,
        to: q.transaction.to,
        data: q.transaction.data,
        value: q.transaction.value || '0x0',
        gas: q.transaction.gas,
        meetsThreshold,
    }
}

/**
 * Fetch a swap quote for NATIVE → USDC (default) or NATIVE → buyOverride.
 * Pure read - no on-chain action.
 */
export async function getNativeSwapQuote(
    chainId: number,
    sellAmount: ethers.BigNumber,
    takerAddress: string,
    buyOverride?: BuyTokenOverride,
): Promise<SwapQuote> {
    return fetchZeroExQuote(chainId, NATIVE_SENTINEL, sellAmount, takerAddress, buyOverride)
}

/**
 * Fetch a swap quote for ERC-20 → USDC (default) or ERC-20 → buyOverride.
 * Token must be on the allowlist. Throws if not - caller is responsible
 * for findErc20() before calling.
 */
export async function getErc20SwapQuote(
    chainId: number,
    tokenAddress: string,
    sellAmount: ethers.BigNumber,
    takerAddress: string,
    buyOverride?: BuyTokenOverride,
): Promise<SwapQuote> {
    return fetchZeroExQuote(chainId, tokenAddress, sellAmount, takerAddress, buyOverride)
}

/**
 * Quote-preview variant for FE use. No taker address available yet - uses
 * 0x's `/price` endpoint which is purpose-built for indicative pricing
 * without committing to a signer. Returns the buy amount in token units +
 * (when available) USD value. Returns `null` on any failure so the FE
 * degrades gracefully.
 *
 * S31: generalized to support any buyToken, not just USDC. When buyOverride
 * is omitted the function defaults to USDC (backward compat with monitor +
 * card-credit pipeline). When the FE supplies a memecoin/bluechip target,
 * the FE is responsible for translating buyAmount into USD via its own
 * price feed (we expose buyAmountRaw + buyDecimals for that math).
 */
export async function previewSwapQuote(
    chainId: number,
    sellToken: string,  // either 'native' or an ERC-20 contract address
    sellAmountRaw: string,  // raw BigNumber string
    buyOverride?: BuyTokenOverride,
): Promise<{
    buyAmountUsd: number;          // NaN if non-USDC buy + no usdPricePerUnit hint
    minBuyAmountUsd: number;       // same NaN semantics
    buyAmountRaw: string;          // raw integer string (BigNumber) of buy units
    minBuyAmountRaw: string;
    buyDecimals: number;           // decimals of the buy token
    gasUsd: number | null;
} | null> {
    try {
        const resolvedSellToken = sellToken === 'native' ? NATIVE_SENTINEL : sellToken
        const token = NATIVE_TOKENS[chainId]
        if (!token) return null
        if (!CONFIG.ZEROX_API_KEY) return null

        const buyAddress = buyOverride?.address ?? token.usdcAddress
        const buyDecimals = buyOverride?.decimals ?? token.usdcDecimals
        const isBuyUsdc = !buyOverride || buyOverride.address.toLowerCase() === token.usdcAddress.toLowerCase()

 // 0x /price endpoint is purpose-built for quote previews without a
 // signer. Returns {buyAmount, minBuyAmount, gas, ...} without calldata.
        const params = {
            chainId: String(chainId),
            sellToken: resolvedSellToken,
            buyToken: buyAddress,
            sellAmount: sellAmountRaw,
            slippageBps: String(CONFIG.ZEROX_SLIPPAGE_BPS),
        }
        const url = `${ZEROX_API_BASE}/swap/allowance-holder/price`
        const res = await axios.get(url, {
            params,
            headers: {
                '0x-api-key': CONFIG.ZEROX_API_KEY,
                '0x-version': 'v2',
            },
            timeout: 10_000,
        })
        const q = res.data
        const buyAmount = ethers.BigNumber.from(q.buyAmount)
        const minBuyAmount = ethers.BigNumber.from(q.minBuyAmount || q.buyAmount)
        const buyAmountFloat = parseFloat(ethers.utils.formatUnits(buyAmount, buyDecimals))
        const minBuyAmountFloat = parseFloat(ethers.utils.formatUnits(minBuyAmount, buyDecimals))

        let buyAmountUsd: number
        let minBuyAmountUsd: number
        if (isBuyUsdc) {
            buyAmountUsd = buyAmountFloat
            minBuyAmountUsd = minBuyAmountFloat
        } else if (buyOverride?.usdPricePerUnit && Number.isFinite(buyOverride.usdPricePerUnit)) {
            buyAmountUsd = buyAmountFloat * buyOverride.usdPricePerUnit
            minBuyAmountUsd = minBuyAmountFloat * buyOverride.usdPricePerUnit
        } else {
            buyAmountUsd = Number.NaN
            minBuyAmountUsd = Number.NaN
        }

        return {
            buyAmountUsd,
            minBuyAmountUsd,
            buyAmountRaw: buyAmount.toString(),
            minBuyAmountRaw: minBuyAmount.toString(),
            buyDecimals,
            gasUsd: null,
        }
    } catch (err: any) {
 // Log enough detail to triage without exposing the API key or calldata.
        const msg = err?.response?.data
            ? JSON.stringify(err.response.data).slice(0, 200)
            : (err?.message || 'unknown').slice(0, 120)
        console.warn(`[swap:preview] chainId=${chainId} sellToken=${sellToken.slice(0, 10)} → ${msg}`)
        return null
    }
}

/**
 * Execute a native-token → USDC swap. Uses the deposit address's own private
 * key (derived from PRIVATE_KEY + userId) as the taker+signer. The swap
 * output lands at the same deposit address, where the USDC monitor poll
 * picks it up naturally on the next cycle.
 *
 * @param chainId Source chain
 * @param sellAmount Native token amount to swap (raw, 18-dec BigNumber)
 * @param depositPrivKey Private key of the deposit address (HD-derived)
 * @param rpcUrl RPC URL for this chain
 */
export async function executeNativeToUsdcSwap(
    chainId: number,
    sellAmount: ethers.BigNumber,
    depositPrivKey: string,
    rpcUrl: string,
    agentId?: string,
): Promise<SwapResult> {
    try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const wallet = new ethers.Wallet(depositPrivKey, provider)

 // Step 1: fetch quote
        const quote = await getNativeSwapQuote(chainId, sellAmount, wallet.address)

        if (!quote.meetsThreshold) {
            return {
                success: false,
                reason: `below_threshold: buyAmount=$${quote.buyAmountUsd.toFixed(4)} < min=$${CONFIG.SWAP_MIN_USD}`,
            }
        }

 // Step 2: estimate gas cost vs swap value - avoid swaps where gas > 30% of output
        const feeData = await provider.getFeeData()
        const gasPrice = feeData.gasPrice || ethers.BigNumber.from(0)
        const estimatedGas = quote.gas ? ethers.BigNumber.from(quote.gas) : ethers.BigNumber.from(200_000)
        const gasCost = gasPrice.mul(estimatedGas)
 // Check sender has enough native for gas + sellAmount (sellAmount is already the native balance)
        const senderBalance = await provider.getBalance(wallet.address)
        const totalNeeded = sellAmount.add(gasCost)
        if (senderBalance.lt(totalNeeded)) {
 // Reduce sellAmount by gasCost × 1.2 so we have buffer
            return {
                success: false,
                reason: `insufficient_for_gas: balance=${ethers.utils.formatEther(senderBalance)} need=${ethers.utils.formatEther(totalNeeded)}`,
            }
        }

 // Helm tx-cap - value cap on native→USDC swap. quote.buyAmountUsd
 // is the USDC output value (≈ USD). Observe-only by default.
        await enforceTxCap({
            source: `swap-${NATIVE_TOKENS[chainId].nativeSymbol}-usdc`,
            txKind: 'swap',
            valueUsd: quote.buyAmountUsd,
            chainId,
            fromAddress: wallet.address,
            toAddress: quote.to,
            agentId,
        })

 // Step 3: execute swap
        console.log(`[swap] ${NATIVE_TOKENS[chainId].nativeSymbol}→USDC on ${NATIVE_TOKENS[chainId].chainName}: ${ethers.utils.formatEther(sellAmount)} → ~$${quote.buyAmountUsd.toFixed(4)} USDC`)
        const tx = await wallet.sendTransaction({
            to: quote.to,
            data: quote.data,
            value: ethers.BigNumber.from(quote.value),
            gasLimit: estimatedGas.mul(120).div(100),  // 20% headroom
        })
        const receipt = await tx.wait()

        if (receipt.status !== 1) {
            return {
                success: false,
                reason: `tx_reverted: ${tx.hash}`,
            }
        }

        console.log(`[swap] success: tx=${tx.hash} - USDC will be detected by next monitor cycle`)
        return {
            success: true,
            txHash: tx.hash,
            buyAmount: quote.buyAmount,
        }
    } catch (err: any) {
 // 0x API errors, RPC errors, signing errors all funnel here.
        const msg = err?.response?.data?.reason || err?.message || 'unknown_error'
        return {
            success: false,
            reason: `exception: ${msg.slice(0, 200)}`,
        }
    }
}

/**
 * Execute an ERC-20 → USDC swap. The deposit address must hold the ERC-20
 * and enough native for gas. Two steps:
 * 1. Approve: ERC-20.approve(AllowanceHolder, sellAmount) - required
 * once per (token, AllowanceHolder) pair. We approve fresh each swap
 * for safety (small extra gas cost, no stale allowance attack).
 * 2. Swap: plain tx to AllowanceHolder with quote.data payload.
 *
 * ERC-20 path is more expensive in gas than native (extra approval tx).
 * Caller is responsible for SWAP_MIN_USD threshold check via quote.meetsThreshold.
 */
export async function executeErc20ToUsdcSwap(
    chainId: number,
    token: Erc20TokenInfo,
    sellAmount: ethers.BigNumber,
    depositPrivKey: string,
    rpcUrl: string,
    agentId?: string,
): Promise<SwapResult> {
    try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const wallet = new ethers.Wallet(depositPrivKey, provider)

 // Step 1: quote
        const quote = await getErc20SwapQuote(chainId, token.address, sellAmount, wallet.address)

        if (!quote.meetsThreshold) {
            return {
                success: false,
                reason: `below_threshold: buyAmount=$${quote.buyAmountUsd.toFixed(4)} < min=$${CONFIG.SWAP_MIN_USD}`,
            }
        }

 // Step 2: gas check - need native for BOTH approval + swap
        const feeData = await provider.getFeeData()
        const gasPrice = feeData.gasPrice || ethers.BigNumber.from(0)
 // Approval tx is ~50k gas; swap tx varies. Budget for both.
        const approvalGas = ethers.BigNumber.from(60_000)
        const swapGas = quote.gas ? ethers.BigNumber.from(quote.gas) : ethers.BigNumber.from(300_000)
        const totalGasCost = gasPrice.mul(approvalGas.add(swapGas)).mul(120).div(100)  // 20% buffer
        const nativeBalance = await provider.getBalance(wallet.address)
        if (nativeBalance.lt(totalGasCost)) {
            return {
                success: false,
                reason: `insufficient_native_for_gas: need=${ethers.utils.formatEther(totalGasCost)} ETH, have=${ethers.utils.formatEther(nativeBalance)} ETH`,
            }
        }

 // Helm tx-cap - value cap on ERC-20→USDC swap. Check BEFORE
 // approval so an over-cap swap (in enforce mode) doesn't burn gas
 // setting an unused allowance. quote.buyAmountUsd is USD value out.
        await enforceTxCap({
            source: `swap-${token.symbol.toLowerCase()}-usdc`,
            txKind: 'swap',
            valueUsd: quote.buyAmountUsd,
            chainId,
            fromAddress: wallet.address,
            toAddress: quote.to,
            agentId,
        })

 // Step 3: ERC-20 approval to AllowanceHolder contract (quote.to)
        const erc20Iface = new ethers.utils.Interface([
            'function approve(address spender, uint256 amount) returns (bool)',
        ])
        const approveData = erc20Iface.encodeFunctionData('approve', [quote.to, sellAmount])
        console.log(`[swap] ${token.symbol}→USDC on ${NATIVE_TOKENS[chainId].chainName}: approving ${ethers.utils.formatUnits(sellAmount, token.decimals)} ${token.symbol}`)
        const approvalTx = await wallet.sendTransaction({
            to: token.address,
            data: approveData,
            gasLimit: approvalGas.mul(120).div(100),
        })
        const approvalReceipt = await approvalTx.wait()
        if (approvalReceipt.status !== 1) {
            return { success: false, reason: `approval_reverted: ${approvalTx.hash}` }
        }

 // Step 4: execute swap
        console.log(`[swap] ${token.symbol}→USDC: swapping, quote=$${quote.buyAmountUsd.toFixed(4)} USDC`)
        const swapTx = await wallet.sendTransaction({
            to: quote.to,
            data: quote.data,
            value: ethers.BigNumber.from(quote.value),  // usually 0 for ERC-20 swaps
            gasLimit: swapGas.mul(120).div(100),
        })
        const swapReceipt = await swapTx.wait()

        if (swapReceipt.status !== 1) {
            return {
                success: false,
                reason: `tx_reverted: ${swapTx.hash}`,
            }
        }

        console.log(`[swap] success: tx=${swapTx.hash} - USDC will be detected by next monitor cycle`)
        return {
            success: true,
            txHash: swapTx.hash,
            buyAmount: quote.buyAmount,
        }
    } catch (err: any) {
        const msg = err?.response?.data?.reason || err?.message || 'unknown_error'
        return {
            success: false,
            reason: `exception: ${msg.slice(0, 200)}`,
        }
    }
}

/**
 * Log a swap attempt (success or failure) to execution_log for admin visibility.
 * Mirrors logMonitorSkip pattern from Sprint 6.1 - structured reason codes.
 */
export async function logSwapAttempt(
    db: Pool,
    params: {
        chainId: number
        depositAddress: string
        userId?: string | null
        sellAmount: ethers.BigNumber
        result: SwapResult
    }
): Promise<void> {
    const token = NATIVE_TOKENS[params.chainId]
    const amountStr = ethers.utils.formatEther(params.sellAmount)
    const status = params.result.success ? 'success' : 'failed'
    const action = params.result.success ? 'native_swap' : `native_swap:${params.result.reason?.split(':')[0] || 'error'}`
    const detail = [
        params.userId ? `user=${params.userId}` : null,
        `chain=${params.chainId}`,
        `${token?.nativeSymbol || 'NATIVE'}=${amountStr}`,
        params.result.success
            ? `tx=${params.result.txHash}`
            : `reason=${params.result.reason}`,
    ].filter(Boolean).join(' | ').slice(0, 500)
    try {
        await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
             VALUES (gen_random_uuid(), 'swap', $1, $2, $3, $4, now())`,
            [params.depositAddress, action, status, detail]
        )
    } catch (e: any) {
        console.warn(`[swap] execution_log insert failed: ${e.message?.slice(0, 80)}`)
    }
}

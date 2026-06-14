import { ethers } from "ethers"
import { pool } from "./db"
import { getUserBaseDepositAddress } from "./issuers"
import { bridgeAndForward } from "./bridge"
import { solanaBridgeAndForward } from "./solana-bridge"
import { randomUUID } from "crypto"
import { CONFIG } from "./config"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"
import { isDepositProcessing, markDepositProcessing, markDepositDone, restoreProcessingLocksFromDb } from "./nonce-manager"
import { getChainDecimals } from "./lib/chains"
import { checkDepositDedup } from "./lib/dedup"
import { NATIVE_TOKENS, executeNativeToUsdcSwap, logSwapAttempt, getErc20Allowlist, ensureAllowlistFresh, executeErc20ToUsdcSwap, type Erc20TokenInfo } from "./swap"
const CHAINS: { chainId: number; name: string; rpc: string; usdc: string }[] = [
    { chainId: 1,      name: "Ethereum",   rpc: CONFIG.RPC_URL_ETHEREUM,                                          usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    { chainId: 42161,  name: "Arbitrum",   rpc: CONFIG.RPC_URL_ARBITRUM,                                          usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    { chainId: 10,     name: "Optimism",   rpc: CONFIG.RPC_URL_OPTIMISM,                                          usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
    { chainId: 137,    name: "Polygon",    rpc: CONFIG.RPC_URL_POLYGON,                                           usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
    { chainId: 43114,  name: "Avalanche",  rpc: CONFIG.RPC_URL_AVALANCHE,                                         usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    { chainId: 59144,  name: "Linea",      rpc: process.env.RPC_URL_LINEA    || "https://rpc.linea.build",        usdc: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff" },
    { chainId: 130,    name: "Unichain",   rpc: process.env.RPC_URL_UNICHAIN || "https://mainnet.unichain.org",   usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" },
    { chainId: 146,    name: "Sonic",      rpc: process.env.RPC_URL_SONIC    || "https://rpc.soniclabs.com",      usdc: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894" },
    { chainId: 480,    name: "WorldChain", rpc: process.env.RPC_URL_WORLDCHAIN|| "https://worldchain-mainnet.g.alchemy.com/public", usdc: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1" },
    { chainId: 57073,  name: "Ink",        rpc: process.env.RPC_URL_INK      || "https://rpc-gel.inkonchain.com", usdc: "0x2D270e6886d130D724215A266106e6832161EAEd" },
    { chainId: 81224,  name: "Codex",      rpc: process.env.RPC_URL_CODEX    || "https://rpc.codex.storage",     usdc: "0xd996633a415985DBd7D6D12f4A4343E31f5037cf" },
    { chainId: 143,    name: "Monad",      rpc: process.env.RPC_URL_MONAD    || "https://rpc.monad.xyz",         usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" },
    { chainId: 50,     name: "XDC",        rpc: process.env.RPC_URL_XDC      || "https://rpc.xinfin.network",    usdc: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1" },
 // Sei: USDC address unconfirmed, re-add after verification
    { chainId: 999,    name: "HyperEVM",   rpc: "https://rpc.hyperliquid.xyz/evm",                               usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f" },
    { chainId: 98866,  name: "Plume",      rpc: process.env.RPC_URL_PLUME    || "https://rpc.plumenetwork.xyz",  usdc: "0x222365EF19F7947e5484218551B56bb3965Aa7aF" },
    { chainId: 324,    name: "zkSync",     rpc: process.env.RPC_URL_ZKSYNC!,                                     usdc: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4" },
    { chainId: 534352, name: "Scroll",     rpc: process.env.RPC_URL_SCROLL!,                                      usdc: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4" },
    { chainId: 42220,  name: "Celo",       rpc: process.env.RPC_URL_CELO    || "https://forno.celo.org",          usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" },
    { chainId: 100,    name: "Gnosis",     rpc: process.env.RPC_URL_GNOSIS  || "https://rpc.gnosischain.com",     usdc: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83" },
    { chainId: 56,     name: "BSC",        rpc: process.env.RPC_URL_BSC     || "https://bsc-dataseed.binance.org", usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
    { chainId: 8453,   name: "Base",       rpc: CONFIG.BASE_RPC_URL,                                              usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
]
// Per-chain USDC decimals are now in src/lib/chains.ts (shared registry).
// This file just imports getChainDecimals() from there.
const USDC_ABI = [
    "function balanceOf(address) view returns (uint256)",
]
const lastSeen = new Map<string, ethers.BigNumber>()
function balanceKey(chainId: number, address: string): string {
    return `${chainId}:${address.toLowerCase()}`
}
function generateDepositAddress(userId: string): string {
    const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + userId)
    const hdNode = ethers.utils.HDNode.fromSeed(seed)
    return hdNode.address
}
// ─── Silent-Skip Telemetry (Sprint 6.1) ──────────────────────────────────────
// Every skip path in monitor that declines to process a deposit writes here so
// the ops tools can surface WHY. Before this existed, had to grep
// pm2 logs to answer "why didn't the ops tools show the skipped deposit?"
// (Session 21 finding). DB writes are only for skips that correlate to a user
// attempting a deposit - not the hot poll loop where nothing changed.
async function logMonitorSkip(params: {
    reason: string;       // machine-readable code, e.g. 'dedup:existing-tx'
    chainId: number;
    address: string;
    userId?: string | null;
    detail?: string;      // human-readable context (amount, tx id, ago, etc.)
}): Promise<void> {
    const msg = `[monitor:skip] ${params.reason} - chain=${params.chainId} addr=${params.address.slice(0, 8)}${params.detail ? ' ' + params.detail : ''}`
    console.log(msg)
    try {
 // Schema note: execution_log on prod has columns {id, entity_type, entity_id,
 // action, status, detail, error_message, created_at}. No user_id column.
 // We encode userId + chainId into the detail string instead. Fixed
 // Session 22 after seeing 'column "user_id" of relation does not exist'.
        const detailWithContext = [
            params.userId ? `user=${params.userId}` : null,
            `chain=${params.chainId}`,
            params.detail || '',
        ].filter(Boolean).join(' | ').slice(0, 500)
        await pool.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
             VALUES (gen_random_uuid(), 'monitor', $1, $2, 'skipped', $3, now())`,
            [params.address, params.reason, detailWithContext]
        )
    } catch (e: any) {
 // Never crash the monitor for telemetry issues - just log and continue.
        console.warn(`[monitor:skip] execution_log insert failed: ${e.message?.slice(0, 80)}`)
    }
}

// Card balance is READ ONLY from Issuer - never written directly.
// When deposits are bridged to Issuer's Base address, Issuer credits the card automatically.
// This function only logs the event for monitoring visibility.
async function logDepositDetected(db: any, issuerUserId: string, amount: number): Promise<void> {
  try {
    const userRes = await db.query(
      "SELECT id FROM users WHERE issuer_user_id = $1",
      [issuerUserId]
    );
    if (!userRes.rows.length) {
      console.warn(`[monitor] logDepositDetected: no user for Issuer ID ${issuerUserId}`);
      return;
    }
    console.log(`[monitor] Deposit detected: $${amount} for Issuer user ${issuerUserId} - Issuer will credit card balance`);
  } catch (e: any) {
    console.error("[monitor] logDepositDetected error:", e.message || e);
  }
}

// ─── BOOT: Seed lastSeen from DB so we never re-process old deposits ─────────
// Only seed pending transactions (still in-flight) - confirmed/failed means
// funds were already swept, so the on-chain balance is 0. Setting lastSeen=0
// ensures new deposits to the same address are always detected.
async function seedLastSeenFromDb(): Promise<void> {
  try {
    const res = await pool.query(`
      SELECT user_wallet, source_chain, amount
      FROM transactions
      WHERE status = 'pending'
      ORDER BY timestamp DESC
    `);
    for (const row of res.rows) {
      if (!row.user_wallet) continue;
      const key = balanceKey(row.source_chain, row.user_wallet);
      const existing = lastSeen.get(key) || ethers.BigNumber.from(0);
      const rowAmount = ethers.utils.parseUnits(String(row.amount), getChainDecimals(row.source_chain));
      if (rowAmount.gt(existing)) {
        lastSeen.set(key, rowAmount);
      }
    }
    console.log(`[monitor] Seeded lastSeen from DB: ${lastSeen.size} entries (pending only)`);
  } catch (e: any) {
    console.error("[monitor] seedLastSeen error:", e.message || e);
  }
}

async function processDeposit(
    userId: string,
    depositAddress: string,
    chainId: number,
    amount: ethers.BigNumber,
    decimals: number
) {
 // ── Bridge lock: prevent concurrent processing of same deposit ──
    if (isDepositProcessing(chainId, depositAddress)) {
        await logMonitorSkip({
            reason: 'lock:bridge-in-progress',
            chainId,
            address: depositAddress,
            userId,
            detail: `in-memory lock held - another poll cycle is already bridging this deposit`,
        })
        return
    }
    markDepositProcessing(chainId, depositAddress)

    const amountStr = ethers.utils.formatUnits(amount, decimals)
    const amountNum = parseFloat(amountStr)
    console.log(`[monitor] Deposit detected: ${amountStr} USDC for user ${userId} on chain ${chainId}`)

 // ─── DEDUP CHECK (consolidated in src/lib/dedup.ts) ──
 // One helper, one DB query, three possible outcomes. Previously this logic
 // lived in both pollChain AND processDeposit with subtle divergence; when
 // the 60-min time bound was added, it required two separate commits
 // (2c3f213 + 8289573) - a classic fragility. Now single source of truth.
    const dedup = await checkDepositDedup({ userId, chainId, amountNum, depositAddress })
    if (dedup.action === 'skip') {
        await logMonitorSkip({ reason: dedup.reason, chainId, address: depositAddress, userId, detail: dedup.detail })
        markDepositDone(chainId, depositAddress)
        return;
    }

 // Session 25 Phase 6 - deposit-row reuse strategy:
 // - failed_restart: RESUME in place (reuse the same row id). This is
 // the SIGTERM-during-bridge case - no duplicate tx on-chain, just
 // our side didn't finish the book-keeping. Flipping back to
 // pending + updating timestamp is correct.
 // - stale pending (>30min): the bridge tx may have actually fired
 // on-chain; safer to fail-out the old row and create a fresh one
 // so we can retry without blowing past double-spend guards.
 // - stale failed (>1h): create a fresh row (the old retry cooldown
 // elapsed cleanly).
    let txId: string;
    if (dedup.action === 'stale-retry' && dedup.staleStatus === 'failed_restart') {
        txId = dedup.staleTxId;
        console.log(`[monitor] Resuming failed_restart deposit in-place (tx ${txId}) - no duplicate row`)
        await pool.query(
            "UPDATE transactions SET status = 'pending', timestamp = $1 WHERE id = $2",
            [Date.now(), txId]
        );
    } else {
        if (dedup.action === 'stale-retry' && dedup.staleStatus === 'pending') {
            console.log(`[monitor] Stale pending deposit (tx ${dedup.staleTxId}) - marking failed and retrying`)
            await pool.query("UPDATE transactions SET status = 'failed' WHERE id = $1", [dedup.staleTxId])
        } else if (dedup.action === 'stale-retry' && dedup.staleStatus === 'failed') {
            console.log(`[monitor] Auto-retrying failed deposit (tx ${dedup.staleTxId}, failed >1h ago)`)
        }

        txId = randomUUID()
        await pool.query(
            `INSERT INTO transactions (id, user_id, user_wallet, base_deposit_address, source_chain, dest_chain, token, amount, fee, forwarded, route, tx_hash, status, timestamp)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
                txId, userId, depositAddress, "",
                chainId, 8453, "USDC",
                parseFloat(amountStr),
                parseFloat(amountStr) * CONFIG.FEE_PERCENT / 100,
                parseFloat(amountStr) * (1 - CONFIG.FEE_PERCENT / 100),
                "circle-cctp", "", "pending", Date.now(),
            ]
        )
    }
    try {
 // Session 26 stuck-dust fix - if getUserBaseDepositAddress returns
 // nothing, the user has no Issuer Base address (no issuer_user_id
 // means they were never fully onboarded). Marking the tx 'failed'
 // means dedup's 1h auto-retry will pick it up again, creating an
 // infinite retry cascade of failed rows for the same dust. Instead:
 // mark the row 'stranded' (new status) and emit a skip log so
 // admin can triage. Dedup treats 'stranded' as non-retryable.
        const recipientBaseAddress = await getUserBaseDepositAddress(userId)
        if (!recipientBaseAddress) {
            await pool.query(
                `UPDATE transactions SET status = 'stranded' WHERE id = $1`,
                [txId]
            )
            await pool.query(
                `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
                 VALUES (gen_random_uuid(), 'monitor', $1, 'no_issuer_address', 'skipped', $2, now())`,
                [
                    depositAddress,
                    `user=${userId} | chain=${chainId} | amount=$${amountStr} | tx=${txId} - user has no Issuer Base address (likely missing issuer_user_id). Funds sit at source. Complete onboarding OR recover manually.`,
                ]
            ).catch(() => {})
            markDepositDone(chainId, depositAddress)
            console.warn(`[monitor] ⚠️  Stranded: user ${userId} has no Issuer address; $${amountStr} on chain ${chainId} marked status='stranded' to break retry loop`)
            return
        }
        await pool.query("UPDATE transactions SET base_deposit_address = $1 WHERE id = $2", [recipientBaseAddress, txId])
        const txHash = await bridgeAndForward(userId, depositAddress, recipientBaseAddress, amountStr, chainId)
        await pool.query("UPDATE transactions SET tx_hash = $1, status = $2, confirmed_at = now() WHERE id = $3", [txHash, "confirmed", txId])
        await logDepositDetected(pool, userId, Number(amountStr)); // Issuer credits card after receiving bridged USDC
        markDepositDone(chainId, depositAddress)
        console.log(`[monitor] Bridge complete for user ${userId}: ${txHash}`)
    } catch (err: any) {
 // ─── SAFE ERROR LOGGING: Only log the message, not the full axios dump ──
        const msg = err?.response?.data?.message || err?.message || "Unknown error";
        const status = err?.response?.status || "N/A";
        markDepositDone(chainId, depositAddress)
        console.error(`[monitor] Bridge failed for user ${userId}: ${status} - ${msg}`);
        await pool.query("UPDATE transactions SET status = $1 WHERE id = $2", ["failed", txId])
 // Log error details so ops tools can display WHY it failed
        await pool.query(
          `INSERT INTO execution_log (entity_type, entity_id, user_id, action, status, detail, error_message, created_at)
           VALUES ('bridge', $1, $2, 'bridge_and_forward', 'failed', $3, $4, now())`,
          [txId, userId, `Bridge failed on chain ${chainId}: ${status}`, msg.slice(0, 500)]
        ).catch(() => {}) // Don't crash if logging fails
    }
}
async function pollChain(chain: { chainId: number; name: string; rpc: string; usdc: string }) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(chain.rpc)
        const usdc = new ethers.Contract(chain.usdc, USDC_ABI, provider)
        const decimals = getChainDecimals(chain.chainId)
 // Derive EVM vault address for every user with an Issuer Issuer ID. This
 // replaces the old approach of polling only cached deposit_addresses -
 // which silently skipped any user who hadn't yet triggered an address
 // cache write (see fix 2026-04-17: a real user's $0.10 Base deposit
 // went undetected because the endpoint only caches 'base', never 'evm').
 // Cheap: HD derivation is sync + deterministic; no RPC or network.
        const res = await pool.query(
            `SELECT id, issuer_user_id AS issuer_user_id
             FROM users
             WHERE issuer_user_id IS NOT NULL`
        )
        for (const row of res.rows) {
            const userId: string = row.issuer_user_id
            const address: string = generateDepositAddress(userId)
            const key = balanceKey(chain.chainId, address)
            try {
                const balance: ethers.BigNumber = await usdc.balanceOf(address)
                const prev = lastSeen.get(key) || ethers.BigNumber.from(0)
                if (balance.gt(prev) && balance.gt(0)) {
                    const newAmount = balance.sub(prev)
                    if (newAmount.gte(ethers.utils.parseUnits("0.01", decimals))) {
                        const balanceFloat = parseFloat(ethers.utils.formatUnits(balance, decimals))
 // Single dedup helper used by both pollChain and processDeposit.
 // See src/lib/dedup.ts for the full semantic. Skip path logs and
 // updates lastSeen silently. Proceed + stale-retry paths both
 // hand off to processDeposit (which will re-run the same check
 // as a race guard after acquiring the in-flight lock).
                        const dedup = await checkDepositDedup({
                            userId,
                            chainId: chain.chainId,
                            amountNum: balanceFloat,
                            depositAddress: address,
                        })
                        lastSeen.set(key, balance)
                        if (dedup.action === 'skip') {
                            await logMonitorSkip({
                                reason: dedup.reason,
                                chainId: chain.chainId,
                                address,
                                userId,
                                detail: dedup.detail,
                            })
                        } else {
 // proceed OR stale-retry - processDeposit handles both
                            await processDeposit(userId, address, chain.chainId, balance, decimals)
                        }
                    }
                } else {
                    lastSeen.set(key, balance)
                }
            } catch (err: any) {
                if (!err.message?.includes("noNetwork")) {
                    console.error(`[monitor] Error checking ${address} on ${chain.name}:`, err.message?.slice(0, 80))
                }
            }
        }
    } catch (err: any) {
        console.error(`[monitor] Chain ${chain.name} poll error:`, err.message?.slice(0, 80))
    }
}

// ─── Native-Token → USDC Auto-Swap (Session 23 Marathon 7) ───────────────────
// For each supported chain (ETH/MATIC/BNB chains in NATIVE_TOKENS), poll every
// user's deposit address for native-token balance. When balance exceeds the
// gas buffer needed, call swap.ts to convert to USDC. Output USDC lands at
// the same deposit address; next pollChain cycle picks it up and bridges to
// Base via the existing CCTP/LZ pipeline. Elegant - no new branch in bridge
// code, swap is just a preprocessing step that tops up USDC.
//
// Off by default. Flip CONFIG.NATIVE_SWAP_ENABLED=true in VPS .env after the
// 0x API key is in place and a demo test passes.
const swapInflight = new Map<string, number>()  // chain:address → epoch_ms of swap start
const SWAP_INFLIGHT_TTL_MS = 5 * 60 * 1000      // 5 min - plenty for 0x tx + 1 block confirm

async function pollNativeBalance(chainId: number) {
    if (!CONFIG.NATIVE_SWAP_ENABLED) return
    if (!CONFIG.ZEROX_API_KEY) {
 // Feature flag enabled but key missing - log once and bail to prevent
 // every poll cycle from spamming the warning.
        return
    }
    const token = NATIVE_TOKENS[chainId]
    if (!token) return  // Unsupported chain

 // Resolve this chain's RPC URL. We reuse CHAINS[] where possible (same
 // RPCs as USDC polling) - every chain in NATIVE_TOKENS must also have a
 // CHAINS entry (invariant enforced by design).
    const chainEntry = CHAINS.find(c => c.chainId === chainId)
    if (!chainEntry) return

    try {
        const provider = new ethers.providers.JsonRpcProvider(chainEntry.rpc)
        const res = await pool.query(
            `SELECT id, issuer_user_id AS issuer_user_id
             FROM users
             WHERE issuer_user_id IS NOT NULL`
        )
        for (const row of res.rows) {
            const userId: string = row.issuer_user_id
            const address: string = generateDepositAddress(userId)
            const inflightKey = `swap:${chainId}:${address.toLowerCase()}`

 // In-flight guard: don't re-enter if a swap is still running or just finished
            const startedAt = swapInflight.get(inflightKey)
            if (startedAt && Date.now() - startedAt < SWAP_INFLIGHT_TTL_MS) continue

            try {
                const nativeBal = await provider.getBalance(address)
 // Dust floor: need at least 0.0003 native to even consider - covers gas
 // for the smallest chains (Base/Arb/Opt) where a full swap costs ~0.0001 native.
 // Ethereum mainnet needs more (~0.002 for a busy block); 0x quote will reject if gas > output.
                const DUST_FLOOR = ethers.utils.parseEther("0.0003")
                if (nativeBal.lt(DUST_FLOOR)) continue

 // Leave a gas buffer per-chain. Values tuned from Session 23 live
 // production data (Marathon 7 activation on 2026-04-18):
 // - Ethereum mainnet: swaps cost ~0.001-0.003 ETH - keep 0.001 baseline.
 // - Polygon: MATIC is ~100x cheaper than ETH, but gas chunks are
 // 0.01-0.05 MATIC - buffer 0.5 covers ~10 swap-worth of volatility.
 // - BSC: BNB gas is ~0.001-0.002 per swap.
 // - Base/Optimism: cheapest L2s, ~0.0001 ETH per swap.
 // - Arbitrum: L2 but spikier auction - observed 0.00219 ETH in live
 // data, insufficient-for-gas errors when buffer was 0.0002. 0.003
 // gives ~30% headroom.
 // If a chain is missing from this map (shouldn't happen - every
 // NATIVE_TOKENS key must have an entry), fall back to conservative 0.001.
                const GAS_BUFFER_BY_CHAIN: Record<number, string> = {
                    1: "0.001",       // Ethereum
                    137: "0.5",       // Polygon (MATIC)
                    56: "0.002",      // BSC (BNB)
                    8453: "0.0002",   // Base
                    10: "0.0002",     // Optimism
                    42161: "0.003",   // Arbitrum
                    43114: "0.05",    // Avalanche (AVAX) - higher gas vs L2s
                    59144: "0.0002",  // Linea (ETH L2)
                    534352: "0.0002", // Scroll (ETH L2)
                    130: "0.0002",    // Unichain (ETH L2)
                    480: "0.0002",    // World Chain (ETH L2)
                    146: "0.5",       // Sonic (S) - cheap token, needs volume for gas
                    999: "0.002",     // HyperEVM (HYPE) - moderately priced native
                }
                const gasBufferStr = GAS_BUFFER_BY_CHAIN[chainId] ?? "0.001"
                const gasBuffer = ethers.utils.parseEther(gasBufferStr)
                if (nativeBal.lte(gasBuffer)) continue

                const sellAmount = nativeBal.sub(gasBuffer)

                swapInflight.set(inflightKey, Date.now())
                console.log(`[monitor:native] Swap candidate on ${token.chainName}: ${ethers.utils.formatEther(sellAmount)} ${token.nativeSymbol} → USDC (user ${userId.slice(0,8)})`)

 // Fire swap - the deposit address signs its own tx via HD-derived privkey
                const privKey = new ethers.Wallet(
                    ethers.utils.HDNode.fromSeed(ethers.utils.id(CONFIG.PRIVATE_KEY + userId)).privateKey
                ).privateKey
                const result = await executeNativeToUsdcSwap(chainId, sellAmount, privKey, chainEntry.rpc, userId)
                await logSwapAttempt(pool, {
                    chainId,
                    depositAddress: address,
                    userId,
                    sellAmount,
                    result,
                })
                if (result.success) {
                    console.log(`[monitor:native] ✓ swap complete - USDC arrival will be detected next pollChain cycle`)
                } else {
                    console.log(`[monitor:native] ✗ swap failed: ${result.reason}`)
 // Leave native untouched. User can try again by depositing more, or admin
 // investigates via execution_log. Critically: DO NOT retry in a tight loop
 // (swapInflight TTL prevents that for 5 min).
                }
            } catch (err: any) {
                if (!err.message?.includes("noNetwork")) {
                    console.error(`[monitor:native] ${token.chainName} user ${userId.slice(0,8)}:`, err.message?.slice(0, 80))
                }
            }
        }
    } catch (err: any) {
        console.error(`[monitor:native] ${token.chainName} poll error:`, err.message?.slice(0, 80))
    }
}

// ─── ERC-20 → USDC Auto-Swap (Session 23 Thread D) ───────────────────────────
// Same plumbing as pollNativeBalance but iterates the curated ERC20_ALLOWLIST
// for each chain. Only tokens explicitly vetted via the Memecoin Allowlist
// Policy get swapped. Each token check is one RPC call per user per cycle -
// so we only enable this when users actually need it (CONFIG.ERC20_SWAP_ENABLED
// defaults to false).
async function pollErc20Balance(chainId: number, token: Erc20TokenInfo) {
    if (!CONFIG.ERC20_SWAP_ENABLED) return
    if (!CONFIG.ZEROX_API_KEY) return
 // Memecoin-category tokens require an additional gate - so even with
 // ERC20_SWAP_ENABLED=true, memecoins don't fire unless operator
 // explicitly enables ERC20_MEMECOIN_ENABLED=true. Blue-chips are always
 // allowed under ERC20_SWAP_ENABLED.
    if (token.category === 'memecoin' && !CONFIG.ERC20_MEMECOIN_ENABLED) return

    const chainEntry = CHAINS.find(c => c.chainId === chainId)
    if (!chainEntry) return

    const nativeInfo = NATIVE_TOKENS[chainId]
    if (!nativeInfo) return  // Need the paired chain in NATIVE_TOKENS for USDC output address

    try {
        const provider = new ethers.providers.JsonRpcProvider(chainEntry.rpc)
        const erc20 = new ethers.Contract(
            token.address,
            ['function balanceOf(address) view returns (uint256)'],
            provider
        )

        const users = await pool.query(
            `SELECT id FROM users WHERE issuer_user_id IS NOT NULL`
        )

        for (const { id: userId } of users.rows) {
            const address = generateDepositAddress(userId)
            const inflightKey = `swap-erc20:${chainId}:${token.symbol}:${address.toLowerCase()}`

            const startedAt = swapInflight.get(inflightKey)
            if (startedAt && Date.now() - startedAt < SWAP_INFLIGHT_TTL_MS) continue

            try {
                const bal: ethers.BigNumber = await erc20.balanceOf(address)
                if (bal.isZero()) continue

 // Dust floor in human units - below 0.0001 of any token we skip.
 // For an 18-decimal token that's 1e14 wei; for 8-dec WBTC that's 1e4 sat.
                const dustFloor = ethers.utils.parseUnits('0.0001', token.decimals)
                if (bal.lt(dustFloor)) continue

 // Optimistically attempt with full balance. executeErc20ToUsdcSwap
 // does its own insufficient-native-for-gas check and bails safely.
                swapInflight.set(inflightKey, Date.now())
                console.log(`[monitor:erc20] Swap candidate on ${nativeInfo.chainName}: ${ethers.utils.formatUnits(bal, token.decimals)} ${token.symbol} (user ${userId.slice(0,8)})`)

                const privKey = new ethers.Wallet(
                    ethers.utils.HDNode.fromSeed(ethers.utils.id(CONFIG.PRIVATE_KEY + userId)).privateKey
                ).privateKey
                const result = await executeErc20ToUsdcSwap(chainId, token, bal, privKey, chainEntry.rpc, userId)
                await logSwapAttempt(pool, {
                    chainId,
                    depositAddress: address,
                    userId,
                    sellAmount: bal,
                    result,
                })
                if (result.success) {
                    console.log(`[monitor:erc20] ✓ ${token.symbol}→USDC complete - USDC detected next cycle`)
                } else {
                    console.log(`[monitor:erc20] ✗ ${token.symbol} swap failed: ${result.reason}`)
                }
            } catch (err: any) {
                if (!err.message?.includes('noNetwork')) {
                    console.error(`[monitor:erc20] ${nativeInfo.chainName}/${token.symbol} user ${userId.slice(0,8)}:`, err.message?.slice(0, 80))
                }
            }
        }
    } catch (err: any) {
        console.error(`[monitor:erc20] ${nativeInfo.chainName}/${token.symbol} poll error:`, err.message?.slice(0, 80))
    }
}

// ─── Agent Wallet Auto-Sweep ─────────────────────────────────────────────────
// Checks all agent wallets on Polygon (Polymarket chain) for USDC profits
// and sweeps them to the agent's linked card via CCTP bridge
async function sweepAgentWallets() {
    try {
        const agents = await pool.query(
            "SELECT a.id, a.wallet_address, a.card_id, a.user_id, a.name FROM agents a WHERE a.status = 'active' AND a.card_id IS NOT NULL"
        )
        if (!agents.rows.length) return

        const polygonRpc = CONFIG.RPC_URL_POLYGON
        if (!polygonRpc) return

        const provider = new ethers.providers.JsonRpcProvider(polygonRpc)
        const polygonUsdc = new ethers.Contract(
            '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon native USDC
            USDC_ABI,
            provider
        )
        const MIN_SWEEP = ethers.utils.parseUnits("0.50", 6) // Minimum $0.50 to sweep

        for (const agent of agents.rows) {
            try {
                const balance = await polygonUsdc.balanceOf(agent.wallet_address)
                if (balance.gt(MIN_SWEEP)) {
                    const amount = parseFloat(ethers.utils.formatUnits(balance, 6))
                    const amountStr = ethers.utils.formatUnits(balance, 6)
                    console.log(`[agent-sweep] Agent "${agent.name}" has $${amount.toFixed(2)} USDC on Polygon - bridging to Issuer`)

 // Get Issuer's Base deposit address for this user
                    const userRow = await pool.query('SELECT issuer_user_id FROM users WHERE id = $1', [agent.user_id])
                    const issuerUserId = userRow.rows[0]?.issuer_user_id
                    if (!issuerUserId) {
                        console.warn(`[agent-sweep] No Issuer user for agent "${agent.name}" - skipping`)
                        continue
                    }

                    let recipientBaseAddress: string
                    try {
                        const addr = await getUserBaseDepositAddress(issuerUserId)
                        if (!addr) {
                            console.warn(`[agent-sweep] Issuer returned no Base address for ${issuerUserId} (403/404 - likely invalid issuer_user_id) - skipping`)
                            continue
                        }
                        recipientBaseAddress = addr
                    } catch (e: any) {
                        console.warn(`[agent-sweep] Cannot get Issuer Base address for ${issuerUserId}: ${e.message?.slice(0,60)}`)
                        continue
                    }

 // Check bridge lock - prevent concurrent sweeps for same agent wallet
                    if (isDepositProcessing(137, agent.wallet_address)) {
                        console.log(`[agent-sweep] Skipping agent "${agent.name}" - sweep already in progress`)
                        continue
                    }
                    markDepositProcessing(137, agent.wallet_address)

 // REAL BRIDGE: Polygon → CCTP → Base → Issuer contract
 // This is the same path as user deposits - Issuer detects it and credits the real Visa card
                    console.log(`[agent-sweep] Bridging $${amount.toFixed(2)} from Polygon to Issuer Base contract ${recipientBaseAddress.slice(0,10)}...`)
                    let txHash: string
                    try {
                    txHash = await bridgeAndForward(
                        agent.user_id,
                        agent.wallet_address,
                        recipientBaseAddress,
                        amountStr,
                        137 // Polygon chainId
                    )
                    } finally {
                        markDepositDone(137, agent.wallet_address)
                    }
                    console.log(`[agent-sweep] Bridge tx: ${txHash}`)

 // Update agent profit tracking
                    await pool.query(
                        'UPDATE agents SET total_profit = total_profit + $1, updated_at = now() WHERE id = $2',
                        [amount, agent.id]
                    )

 // Record INTENT - status 'pending' until Issuer confirms deposit on card.
 // date populated explicitly so analytics windows (24h/7d/12mo) include
 // agent-sweep deposits. See migration 043 for the consolidation.
                    await pool.query(
                        `INSERT INTO card_transactions (id, card_id, user_id, name, type, amount, category, status, created_at, date)
                         VALUES (gen_random_uuid(), $1, $2, $3, 'deposit', $4, 'agent', 'pending', now(), now())`,
                        [agent.card_id, agent.user_id, `${agent.name} - profit sweep`, amount]
                    )

                    await pool.query(
                        `INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
                         VALUES (gen_random_uuid(), $1, 'transaction', $2, $3, false, now())`,
                        [agent.user_id, `Agent "${agent.name}" earned $${amount.toFixed(2)}`, `Profits bridged to Issuer - card will update shortly. TX: ${txHash?.slice(0,10)}...`]
                    )

                    console.log(`[agent-sweep] Agent "${agent.name}" - $${amount.toFixed(2)} bridged to Issuer via Polygon→Base CCTP`)
                }
            } catch (err: any) {
 // Silent per-agent errors
                if (!err.message?.includes('noNetwork')) {
                    console.error(`[agent-sweep] Error checking agent ${agent.name}:`, err.message?.slice(0, 80))
                }
            }
        }
    } catch (err: any) {
        console.error('[agent-sweep] Sweep error:', err.message?.slice(0, 80))
    }
}

// ─── Solana Deposit Monitoring ────────────────────────────────────────────────
async function pollSolana() {
    try {
        const connection = new Connection(CONFIG.SOLANA_RPC_URL, 'confirmed')
        const usdcMint = new PublicKey(CONFIG.USDC_SOLANA)
        const MIN_AMOUNT = 0.01 // $0.01 minimum

 // Get all Solana deposit addresses
        const res = await pool.query("SELECT user_id, address FROM deposit_addresses WHERE chain = 'solana'")
        for (const row of res.rows) {
            try {
                const owner = new PublicKey(row.address)
                const tokenAccount = await getAssociatedTokenAddress(usdcMint, owner)
                const accountInfo = await connection.getTokenAccountBalance(tokenAccount).catch(() => null)
                if (!accountInfo) continue

                const balance = parseFloat(accountInfo.value.uiAmountString || '0')
                const key = `solana:${row.address}`
                const prev = lastSeen.get(key) || ethers.BigNumber.from(0)
                const balanceBN = ethers.utils.parseUnits(balance.toFixed(6), 6)

                if (balanceBN.gt(prev) && balance > MIN_AMOUNT) {
 // Check for existing transaction
                    const existing = await pool.query(
                        "SELECT id FROM transactions WHERE user_id = $1 AND source_chain = 0 AND status IN ('pending','confirmed','failed') AND amount BETWEEN $2 AND $3",
                        [row.user_id, balance - 0.001, balance + 0.001]
                    )
                    if (existing.rows.length > 0) {
                        lastSeen.set(key, balanceBN)
                        continue
                    }

                    console.log(`[monitor] Solana deposit detected: ${balance} USDC for user ${row.user_id}`)

 // Get Issuer Base address
                    const internalUser = await pool.query("SELECT id FROM users WHERE issuer_user_id = $1", [row.user_id])
                    if (!internalUser.rows.length) continue

                    let recipientBase: string
                    try {
                        const addr = await getUserBaseDepositAddress(row.user_id)
                        if (!addr) {
                            console.warn(`[monitor] Issuer returned no Base address for Solana user ${row.user_id} (403/404) - skipping`)
                            continue
                        }
                        recipientBase = addr
                    } catch {
                        console.warn(`[monitor] No Issuer Base address for Solana user ${row.user_id}`)
                        continue
                    }

 // Create transaction record
                    const txId = randomUUID()
                    await pool.query(
                        `INSERT INTO transactions (id, user_id, user_wallet, base_deposit_address, source_chain, dest_chain, token, amount, status, created_at)
                         VALUES ($1, $2, $3, $4, 0, 8453, 'USDC', $5, 'pending', now())`,
                        [txId, row.user_id, row.address, recipientBase, balance]
                    )

 // Bridge via Solana CCTP
                    try {
                        const txHash = await solanaBridgeAndForward(recipientBase, balance.toFixed(6), row.user_id)
                        await pool.query("UPDATE transactions SET status = 'confirmed', tx_hash = $1, confirmed_at = now() WHERE id = $2", [txHash, txId])
                        await logDepositDetected(pool, internalUser.rows[0].id, balance)
                        console.log(`[monitor] Solana bridge complete: ${txHash}`)
                    } catch (err: any) {
                        await pool.query("UPDATE transactions SET status = 'failed' WHERE id = $1", [txId])
                        console.error(`[monitor] Solana bridge failed: ${err.message?.slice(0, 80)}`)
                    }

                    lastSeen.set(key, balanceBN)
                }
            } catch (err: any) {
                if (!err.message?.includes('could not find')) {
                    console.error(`[monitor] Solana check error for ${row.address?.slice(0,8)}:`, err.message?.slice(0, 60))
                }
            }
        }
    } catch (err: any) {
        console.error('[monitor] Solana poll error:', err.message?.slice(0, 80))
    }
}

const POLL_INTERVAL_MS = CONFIG.POLL_INTERVAL_MS
export async function startDepositMonitor() {
    const intervalSec = POLL_INTERVAL_MS / 1000
    if (intervalSec >= 3600) {
        console.log(`[monitor] ⏸️  PAUSED - POLL_INTERVAL_MS=${POLL_INTERVAL_MS}ms (${(intervalSec/3600).toFixed(0)}h). Set POLL_INTERVAL_MS=60000 in .env to actively poll.`)
    } else {
        console.log(`[monitor] ▶️  ACTIVE - polling ${CHAINS.length} chains every ${intervalSec}s`)
    }
 // Restore processing locks from DB - prevents double-spend after PM2 restart
    await restoreProcessingLocksFromDb(pool)
 // Seed lastSeen from DB BEFORE first poll - prevents re-detection of old deposits
    await seedLastSeenFromDb();
 // Sprint 6.4 - boot-time reconciler: surface any rows marked failed_restart
 // by the SIGTERM handler in the previous session. These are bridges that
 // died mid-flight; admin should check if the user's funds actually landed
 // on Base before considering them lost.
 //
 // Session 26 polish: also fire a Telegram alert if failed_restart count > 0
 // so the admin knows without needing to tail logs. Deduped by boot (once
 // per restart, not repeated in this session).
    try {
        const restartRows = await pool.query(
            `SELECT COUNT(*)::int AS c,
                    MAX(created_at) AS latest,
                    array_agg(id ORDER BY created_at DESC) FILTER (WHERE id IS NOT NULL) AS ids
             FROM transactions
             WHERE status = 'failed_restart' AND timestamp > $1`,
            [Date.now() - 24 * 60 * 60 * 1000]
        )
        const n = restartRows.rows[0].c
        if (n > 0) {
            console.warn(`[monitor] ⚠️  ${n} incomplete bridge(s) from previous restart (last 24h) - inspect via admin console "Monitor Skips" panel filter on status='failed_restart'`)

 // Telegram alert - best-effort, silent if bot env unset.
            try {
                const { sendTelegramMessage } = await import('./lib/telegram')
                const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID || ''
                if (adminChat) {
                    const latest = restartRows.rows[0].latest
                    const ids: string[] = (restartRows.rows[0].ids || []).slice(0, 5)
                    const text =
                        `⚠️ <b>Boot alert - ${n} incomplete bridge(s)</b>\n\n` +
                        `Process restart found ${n} tx row(s) marked failed_restart in last 24h. ` +
                        `These are bridges that died mid-flight during the previous shutdown.\n\n` +
                        `<b>Latest:</b> ${latest ? new Date(latest).toISOString() : 'unknown'}\n` +
                        `<b>IDs:</b> ${ids.map(id => `<code>${id}</code>`).join(', ')}${n > ids.length ? ` (+${n - ids.length} more)` : ''}\n\n` +
                        `Check if user funds actually landed on Base before considering lost. ` +
                        `Admin → Dashboard → Failed-Restart panel.`
                    await sendTelegramMessage(adminChat, text)
                }
            } catch (tgErr: any) {
                console.error('[monitor] failed_restart Telegram alert failed:', tgErr.message?.slice(0, 80))
            }
        }
    } catch (e: any) {
        console.error('[monitor] failed_restart reconciler error:', e.message?.slice(0, 80))
    }
    await Promise.allSettled(CHAINS.map(pollChain))
 // Session 23 Marathon 7 - native-token swap polling. Runs alongside USDC
 // polling. If CONFIG.NATIVE_SWAP_ENABLED is false (default), pollNativeBalance
 // returns immediately - zero cost when disabled.
    await Promise.allSettled(Object.keys(NATIVE_TOKENS).map(id => pollNativeBalance(Number(id))))
 // Session 23 Thread D - ERC-20 allowlist swap polling. Refresh snapshot
 // from DB before iterating so admin toggles (enable/disable a token)
 // take effect within ~60s. Gated by CONFIG.ERC20_SWAP_ENABLED; memecoin-
 // category entries additionally gated by ERC20_MEMECOIN_ENABLED.
    await ensureAllowlistFresh()
    await Promise.allSettled(
        Object.entries(getErc20Allowlist()).flatMap(([cid, list]) =>
            list.map((tok: Erc20TokenInfo) => pollErc20Balance(Number(cid), tok))
        )
    )
    await pollSolana().catch(e => console.error('[monitor] Solana initial poll error:', e.message?.slice(0, 80)))
 // Run agent systems
    await sweepAgentWallets()
    setInterval(async () => {
        await Promise.allSettled(CHAINS.map(pollChain))
        await Promise.allSettled(Object.keys(NATIVE_TOKENS).map(id => pollNativeBalance(Number(id))))
        await ensureAllowlistFresh()
        await Promise.allSettled(
            Object.entries(getErc20Allowlist()).flatMap(([cid, list]) =>
                list.map((tok: Erc20TokenInfo) => pollErc20Balance(Number(cid), tok))
            )
        )
        await pollSolana().catch(e => console.error('[monitor] Solana poll error:', e.message?.slice(0, 80)))
        await sweepAgentWallets()
    }, POLL_INTERVAL_MS)
}

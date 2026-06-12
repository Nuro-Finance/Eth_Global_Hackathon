/**
 * Nonce Manager — Prevents Race Conditions in Bridge Operations
 * ──────────────────────────────────────────────────────────────
 *
 * Problems this solves:
 *   1. Concurrent bridge calls fetch the same nonce → collisions
 *   2. Alchemy/cached RPCs return stale nonce values
 *   3. Multiple poll cycles detect the same deposit and bridge simultaneously
 *
 * Architecture:
 *   - One NonceManager per chain (singleton pattern)
 *   - Nonces are fetched from public RPCs (not Alchemy) for accuracy
 *   - Sequential lock: only one transaction can be in-flight per chain
 *   - Automatic retry with fresh nonce on NONCE_EXPIRED errors
 *   - Bridge lock prevents overlapping deposit processing
 */

import { ethers } from 'ethers'

// ── Public RPCs (non-cached, accurate nonces) ────────────────────────────────

const PUBLIC_RPCS: Record<number, string> = {
  1:     'https://ethereum-rpc.publicnode.com',
  // Base uses 'base-rpc' — NOT 'base-mainnet-rpc'. Different from Ethereum's
  // mainnet/testnet split. Wrong URL causes ethers "could not detect network"
  // on every Base-route bridge. Fixed 2026-04-17 live during investor prep.
  8453:  'https://base-rpc.publicnode.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  10:    'https://optimism-rpc.publicnode.com',
  137:   'https://polygon-bor-rpc.publicnode.com',
  43114: 'https://avalanche-c-chain-rpc.publicnode.com',
  56:    'https://bsc-rpc.publicnode.com',
  324:   'https://mainnet.era.zksync.io',
  534352:'https://scroll-rpc.publicnode.com',
  42220: 'https://celo-rpc.publicnode.com',
  100:   'https://gnosis-rpc.publicnode.com',
}

// ── Per-Address Transaction Lock ─────────────────────────────────────────────
// Lock by address (not chain) so different users can bridge concurrently.
// Same address can't have two bridge ops at once (prevents nonce collision).

interface AddressLock {
  locked: boolean
  queue: Array<{ resolve: () => void }>
  lastNonce: number
}

const addressLocks = new Map<string, AddressLock>()
const chainProviders = new Map<number, ethers.providers.JsonRpcProvider>()

function getAddressLock(key: string): AddressLock {
  if (!addressLocks.has(key)) {
    addressLocks.set(key, { locked: false, queue: [], lastNonce: -1 })
  }
  return addressLocks.get(key)!
}

function getChainProvider(chainId: number): ethers.providers.JsonRpcProvider {
  if (!chainProviders.has(chainId)) {
    const rpc = PUBLIC_RPCS[chainId]
    chainProviders.set(chainId, new ethers.providers.JsonRpcProvider(rpc || `https://rpc.chain${chainId}.unknown`))
  }
  return chainProviders.get(chainId)!
}

/**
 * Acquire exclusive access for a specific address on a chain.
 * Different addresses can bridge concurrently (scales to 10K+ users).
 * Same address is serialized (prevents nonce collision).
 */
export async function acquireChainLock(chainId: number, address?: string): Promise<void> {
  const key = address ? `${chainId}:${address}` : `chain:${chainId}`
  const lock = getAddressLock(key)
  if (!lock.locked) {
    lock.locked = true
    return
  }
  return new Promise(resolve => {
    lock.queue.push({ resolve })
  })
}

/**
 * Release the lock for an address, allowing the next queued operation to proceed.
 */
export function releaseChainLock(chainId: number, address?: string): void {
  const key = address ? `${chainId}:${address}` : `chain:${chainId}`
  const lock = getAddressLock(key)
  if (lock.queue.length > 0) {
    const next = lock.queue.shift()!
    next.resolve()
  } else {
    lock.locked = false
  }
}

// ── Nonce Management ─────────────────────────────────────────────────────────

/**
 * Get the current nonce for an address on a specific chain.
 * Uses public RPCs to avoid stale values from cached providers like Alchemy.
 */
export async function getFreshNonce(chainId: number, address: string): Promise<number> {
  const key = `${chainId}:${address}`
  const lock = getAddressLock(key)
  const provider = getChainProvider(chainId)
  try {
    const onChainNonce = await provider.getTransactionCount(address, 'latest')
    const effectiveNonce = Math.max(onChainNonce, lock.lastNonce + 1)
    lock.lastNonce = effectiveNonce
    return effectiveNonce
  } catch (err: any) {
    console.error(`[nonce-manager] Failed to get nonce on chain ${chainId}:`, err.message?.slice(0, 80))
    lock.lastNonce++
    return lock.lastNonce
  }
}

/**
 * Record that a nonce was used (after successful tx submission).
 */
export function recordNonceUsed(chainId: number, nonce: number, address?: string): void {
  const key = address ? `${chainId}:${address}` : `chain:${chainId}`
  const lock = getAddressLock(key)
  lock.lastNonce = Math.max(lock.lastNonce, nonce)
}

/**
 * Create a wallet connected to a public (non-cached) RPC provider.
 */
export function createFreshWallet(privateKey: string, chainId: number): ethers.Wallet {
  const rpc = PUBLIC_RPCS[chainId]
  if (!rpc) {
    console.warn(`[nonce-manager] No public RPC for chain ${chainId}, using default`)
  }
  const provider = new ethers.providers.JsonRpcProvider(
    rpc || `https://rpc.chain${chainId}.unknown`
  )
  return new ethers.Wallet(privateKey, provider)
}

// ── Bridge Lock (Deposit-Level) ──────────────────────────────────────────────
// Prevents the same deposit from being processed multiple times.
// RESILIENCE: Also checks DB for pending transactions on boot — survives PM2 restart.

const processingDeposits = new Map<string, number>() // key → timestamp

/**
 * Check if a deposit is already being processed.
 * Also checks for stale locks (> 30 min) and auto-clears them.
 * Key format: "chainId:address" (e.g., "42161:0x75Aa...")
 */
export function isDepositProcessing(chainId: number, address: string): boolean {
  const key = `${chainId}:${address}`
  const startedAt = processingDeposits.get(key)
  if (!startedAt) return false

  // Auto-clear stale locks (> 30 min) — prevents infinite stuck deposits
  const STALE_THRESHOLD_MS = 30 * 60 * 1000
  if (Date.now() - startedAt > STALE_THRESHOLD_MS) {
    console.warn(`[nonce-manager] Clearing stale deposit lock: ${key} (started ${Math.round((Date.now() - startedAt) / 60000)}min ago)`)
    processingDeposits.delete(key)
    return false
  }
  return true
}

/**
 * Mark a deposit as being processed.
 */
export function markDepositProcessing(chainId: number, address: string): void {
  processingDeposits.set(`${chainId}:${address}`, Date.now())
}

/**
 * Mark a deposit as done (success or failure).
 */
export function markDepositDone(chainId: number, address: string): void {
  processingDeposits.delete(`${chainId}:${address}`)
}

/**
 * Restore processing locks from DB on boot — prevents double-spend after restart.
 * Any transaction still 'pending' means a bridge was in-flight when the server died.
 * Mark those addresses as "processing" so the next poll skips them.
 */
export async function restoreProcessingLocksFromDb(db: any): Promise<number> {
  try {
    const res = await db.query(`
      SELECT DISTINCT source_chain, user_wallet
      FROM transactions
      WHERE status = 'pending'
        AND timestamp > $1
    `, [Date.now() - 30 * 60 * 1000]) // Only last 30 min
    let restored = 0
    for (const row of res.rows) {
      if (row.user_wallet && row.source_chain != null) {
        markDepositProcessing(row.source_chain, row.user_wallet)
        restored++
      }
    }
    if (restored > 0) {
      console.log(`[nonce-manager] Restored ${restored} processing locks from DB (pending txs)`)
    }
    return restored
  } catch (e: any) {
    console.error('[nonce-manager] restoreProcessingLocks error:', e.message?.slice(0, 80))
    return 0
  }
}

// ── Safe Transaction Executor ────────────────────────────────────────────────

/**
 * Execute a transaction with proper nonce management and retry logic.
 * Handles NONCE_EXPIRED by fetching a fresh nonce and retrying once.
 *
 * @param chainId - Chain to execute on
 * @param privateKey - Wallet private key
 * @param execute - Function that takes a wallet and nonce, returns a tx
 * @param description - Human-readable description for logging
 */
export async function safeExecute(
  chainId: number,
  privateKey: string,
  execute: (wallet: ethers.Wallet, nonce: number) => Promise<ethers.ContractTransaction>,
  description: string,
): Promise<ethers.ContractReceipt> {
  await acquireChainLock(chainId)

  try {
    const wallet = createFreshWallet(privateKey, chainId)
    let nonce = await getFreshNonce(chainId, wallet.address)

    console.log(`[nonce-manager] ${description} — chain ${chainId}, nonce ${nonce}`)

    try {
      const tx = await execute(wallet, nonce)
      const receipt = await tx.wait()
      recordNonceUsed(chainId, nonce)
      console.log(`[nonce-manager] ${description} — confirmed: ${receipt.transactionHash}`)
      return receipt
    } catch (err: any) {
      // Retry once with fresh nonce on NONCE_EXPIRED
      if (err.code === 'NONCE_EXPIRED' || err.message?.includes('nonce')) {
        console.warn(`[nonce-manager] Nonce stale, retrying ${description} with fresh nonce`)
        const freshNonce = await wallet.provider.getTransactionCount(wallet.address, 'latest')
        const retryTx = await execute(wallet, freshNonce)
        const receipt = await retryTx.wait()
        recordNonceUsed(chainId, freshNonce)
        console.log(`[nonce-manager] ${description} — confirmed on retry: ${receipt.transactionHash}`)
        return receipt
      }
      throw err
    }
  } finally {
    releaseChainLock(chainId)
  }
}

// ── Get Public RPC URL ───────────────────────────────────────────────────────

/**
 * Get a public (non-Alchemy) RPC URL for a chain.
 * Falls back to the provided URL if no public RPC is configured.
 */
export function getPublicRPC(chainId: number, fallback?: string): string {
  return PUBLIC_RPCS[chainId] || fallback || ''
}

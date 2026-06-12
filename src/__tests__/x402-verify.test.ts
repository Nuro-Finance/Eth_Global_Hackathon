// ─────────────────────────────────────────────────────────────────────────────
// x402 X5 Phase 2 — in-house EIP-3009 verify unit tests
//
// Covers each branch of verifyInternalAuthorization that the upstream
// facilitator would cover:
//   - shape (network, asset, amount)
//   - expiry (validAfter, validBefore)
//   - recipient (payTo)
//   - nonce dedup (execution_log)
//   - signature recovery (EIP-712)
//   - budget gate (agent_budgets)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ethers } from 'ethers'
import { verifyInternalAuthorization } from '../x402/facilitator-server'

// ── Test fixtures ────────────────────────────────────────────────────────

const SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const SEPOLIA_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: 84532,
  verifyingContract: SEPOLIA_USDC,
}
const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

// Fixed wallet so tests are deterministic.
const SIGNER_PK = '0x' + 'b'.repeat(63) + '1'
const signerWallet = new ethers.Wallet(SIGNER_PK)

const PAYEE = '0x000000000000000000000000000000000000beef'

function freshAuth(overrides: Partial<{
  from: string
  to: string
  value: string
  validAfter: number
  validBefore: number
  nonce: string
}> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    from: overrides.from ?? signerWallet.address,
    to: overrides.to ?? PAYEE,
    value: overrides.value ?? '1000', // 0.001 USDC
    validAfter: String(overrides.validAfter ?? now - 60),
    validBefore: String(overrides.validBefore ?? now + 600),
    nonce: overrides.nonce ?? '0x' + 'a'.repeat(64),
  }
}

async function signAuth(auth: ReturnType<typeof freshAuth>) {
  return await signerWallet._signTypedData(SEPOLIA_DOMAIN, TYPES, auth)
}

function freshRequirements(overrides: Partial<{
  network: string
  asset: string
  payTo: string
  maxAmountRequired: string
}> = {}) {
  return {
    scheme: 'exact',
    network: overrides.network ?? 'base-sepolia',
    asset: overrides.asset ?? SEPOLIA_USDC,
    payTo: overrides.payTo ?? PAYEE,
    maxAmountRequired: overrides.maxAmountRequired ?? '1000',
  }
}

function makeDb(opts: {
  /** Existing nonce hits to return on dedup query (default empty). */
  dedupHits?: number
  /** Budget remaining USD (default plenty). null = lookup throws. */
  budgetRemaining?: number | null
} = {}) {
  const queryMock = vi.fn(async (sql: string) => {
    if (sql.includes("'authNonce'")) {
      return { rowCount: opts.dedupHits ?? 0, rows: [] as unknown[] }
    }
    if (sql.includes('agent_budgets')) {
      if (opts.budgetRemaining === null) throw new Error('db down')
      return { rowCount: 1, rows: [{ remaining: String(opts.budgetRemaining ?? 100) }] }
    }
    return { rowCount: 0, rows: [] }
  })
  return { query: queryMock } as unknown as import('pg').Pool
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('verifyInternalAuthorization', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('passes a fresh, well-formed, properly-signed authorization', async () => {
    const auth = freshAuth()
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements(),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(true)
    if (result.isValid) expect(result.payer.toLowerCase()).toBe(signerWallet.address.toLowerCase())
  })

  it('rejects unsupported network', async () => {
    const auth = freshAuth()
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements({ network: 'mars-mainnet' }),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('unsupported network')
  })

  it('rejects asset mismatch', async () => {
    const auth = freshAuth()
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements({ asset: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('asset mismatch')
  })

  it('rejects expired authorization', async () => {
    const past = Math.floor(Date.now() / 1000) - 100
    const auth = freshAuth({ validBefore: past })
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements(),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('expired')
  })

  it('rejects not-yet-valid authorization', async () => {
    const future = Math.floor(Date.now() / 1000) + 1000
    const auth = freshAuth({ validAfter: future, validBefore: future + 600 })
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements(),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('not yet valid')
  })

  it('rejects wrong recipient', async () => {
    const auth = freshAuth({ to: '0x000000000000000000000000000000000000dead' })
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements({ payTo: PAYEE }),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('recipient')
  })

  it('rejects insufficient authorized amount', async () => {
    const auth = freshAuth({ value: '500' })
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements({ maxAmountRequired: '1000' }),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toMatch(/value 500 < required 1000/)
  })

  it('rejects nonce that has already been used', async () => {
    const auth = freshAuth()
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb({ dedupHits: 1 }),
      auth,
      freshRequirements(),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('nonce already used')
  })

  it('rejects signature signed by a different key', async () => {
    const auth = freshAuth()
    // Sign with a DIFFERENT wallet than authorization.from claims.
    const otherWallet = new ethers.Wallet('0x' + 'c'.repeat(63) + '2')
    const sig = await otherWallet._signTypedData(SEPOLIA_DOMAIN, TYPES, auth)
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements(),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('does not match')
  })

  it('rejects malformed signature bytes', async () => {
    const auth = freshAuth()
    const result = await verifyInternalAuthorization(
      makeDb(),
      auth,
      freshRequirements(),
      '0xnotASignature',
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toMatch(/recover/i)
  })

  it('rejects when agent budget is insufficient', async () => {
    const auth = freshAuth({ value: '5000000' }) // 5 USDC
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb({ budgetRemaining: 1 }),
      auth,
      freshRequirements({ maxAmountRequired: '5000000' }),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('insufficient agent budget')
  })

  it('fails closed when the budget table read errors out', async () => {
    const auth = freshAuth()
    const sig = await signAuth(auth)
    const result = await verifyInternalAuthorization(
      makeDb({ budgetRemaining: null }),
      auth,
      freshRequirements(),
      sig,
      'mythos',
    )
    expect(result.isValid).toBe(false)
    if (!result.isValid) expect(result.invalidReason).toContain('budget lookup failed')
  })
})

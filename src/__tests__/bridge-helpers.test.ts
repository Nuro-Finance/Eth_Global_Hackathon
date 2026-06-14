import { describe, it, expect } from 'vitest'
import { CCTP_DOMAINS, resolveCCTPDomains, getCCTPDestRpc } from '../bridge'

// ── CCTP domain resolution (pure helpers - no RPC, no env surprises) ────────
// Tests the routing logic that determines:
// (a) which CCTP domain id to pass to depositForBurn on the source chain
// (b) which RPC URL to use for receiveMessage on the destination chain
//
// The function cctpBurnAndMint dispatches both sides via these helpers, so
// getting the mapping wrong = burning USDC on chain A without a corresponding
// mint on chain B (unrecoverable without Circle manual intervention).
//
// Non-negotiable correctness: these tests must pass before any
// reverse-direction call can be deployed live.

describe('CCTP_DOMAINS registry', () => {
  it.each<[number, number]>([
    [1, 0],      // Ethereum
    [10, 2],     // Optimism
    [42161, 3],  // Arbitrum
    [8453, 6],   // Base
    [137, 7],    // Polygon
    [43114, 1],  // Avalanche
  ])('chain %i → domain %i', (chainId, domain) => {
    expect(CCTP_DOMAINS[chainId]).toBe(domain)
  })

  it('unknown chain returns undefined', () => {
    expect(CCTP_DOMAINS[999999]).toBeUndefined()
  })
})

describe('resolveCCTPDomains (A7)', () => {
  it('forward: any chain → Base resolves both domains', () => {
    expect(resolveCCTPDomains(42161, 8453)).toEqual({ sourceDomain: 3, destDomain: 6 })
    expect(resolveCCTPDomains(137, 8453)).toEqual({ sourceDomain: 7, destDomain: 6 })
    expect(resolveCCTPDomains(1, 8453)).toEqual({ sourceDomain: 0, destDomain: 6 })
  })

  it('reverse: Base → Polygon (Sprint 2.3 agent funding path)', () => {
    expect(resolveCCTPDomains(8453, 137)).toEqual({ sourceDomain: 6, destDomain: 7 })
  })

  it('arbitrary routes resolve symmetrically', () => {
    expect(resolveCCTPDomains(42161, 137)).toEqual({ sourceDomain: 3, destDomain: 7 })
    expect(resolveCCTPDomains(137, 42161)).toEqual({ sourceDomain: 7, destDomain: 3 })
    expect(resolveCCTPDomains(1, 43114)).toEqual({ sourceDomain: 0, destDomain: 1 })
  })

  it('throws on unknown source chain', () => {
    expect(() => resolveCCTPDomains(999999, 8453)).toThrow(/source chain 999999/)
  })

  it('throws on unknown destination chain', () => {
    expect(() => resolveCCTPDomains(8453, 999999)).toThrow(/destination chain 999999/)
  })

  it('throws with informative message naming the chain', () => {
 // Error message quality matters - drift here in prod = on-call fighting a bad error
    try {
      resolveCCTPDomains(8453, 42)
      expect.fail('expected throw')
    } catch (e: any) {
      expect(e.message).toMatch(/CCTP domain/)
      expect(e.message).toMatch(/42/)
    }
  })
})

describe('getCCTPDestRpc (A7)', () => {
  it('reads BASE_RPC_URL from env for chain 8453', () => {
    const env = { BASE_RPC_URL: 'https://custom-base.example/rpc' }
    expect(getCCTPDestRpc(8453, env)).toBe('https://custom-base.example/rpc')
  })

  it('reads RPC_URL_POLYGON from env for chain 137', () => {
    const env = { RPC_URL_POLYGON: 'https://custom-polygon.example/rpc' }
    expect(getCCTPDestRpc(137, env)).toBe('https://custom-polygon.example/rpc')
  })

  it('falls back to public RPC for Base when env var absent', () => {
    expect(getCCTPDestRpc(8453, {})).toBe('https://mainnet.base.org')
  })

  it('falls back to public RPC for Polygon when env var absent', () => {
    expect(getCCTPDestRpc(137, {})).toBe('https://polygon-rpc.com')
  })

  it('falls back to public RPC for Arbitrum when env var absent', () => {
    expect(getCCTPDestRpc(42161, {})).toBe('https://arb1.arbitrum.io/rpc')
  })

  it('returns undefined for unsupported destination chain', () => {
 // Intentionally unsupported: no public fallback, no env var mapping
    expect(getCCTPDestRpc(999999, {})).toBeUndefined()
  })

  it('env value beats public fallback', () => {
    const env = { BASE_RPC_URL: 'https://premium-base.example/rpc' }
    const result = getCCTPDestRpc(8453, env)
    expect(result).toBe('https://premium-base.example/rpc')
    expect(result).not.toBe('https://mainnet.base.org')
  })
})

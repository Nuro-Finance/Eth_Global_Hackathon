import { describe, it, expect } from 'vitest'
import {
  calculatePnL,
  calculateReservedForOpenBets,
  calculateFreeBalance,
  isValidAgentTransition,
  isValidAgentBetTransition,
  shouldEnqueueCardSettlement,
  computeExpectedAgentBalance,
  shouldAlertDrift,
  shouldSweepProfits,
  type AgentStatus,
  type AgentBetStatus,
} from '../agent-helpers'

// ── A1 ──────────────────────────────────────────────────────────────────────
// PnL formula. Non-negotiable: a wrong coefficient here loses real USDC silently
// on every settlement sweep across every user's bot.

describe('calculatePnL (A1)', () => {
  it.each<[number, number, boolean, number]>([
    [5, 0.85, true, +(5 / 0.85 - 5).toFixed(6)],
    [5, 0.85, false, -5],
    [1, 0.99, true, +(1 / 0.99 - 1).toFixed(6)],
    [1, 0.5, true, 1],
    [100, 0.15, true, +(100 / 0.15 - 100).toFixed(6)],
    [100, 0.15, false, -100],
    [0.5, 0.01, true, +(0.5 / 0.01 - 0.5).toFixed(6)],
    [10, 0.5, true, 10],
    [10, 0.5, false, -10],
  ])('amount=%f entry=%f won=%s → pnl=%f', (amount, entry, won, expected) => {
    expect(calculatePnL(amount, entry, won)).toBe(expected)
  })

  it('rejects invalid entry price', () => {
    expect(() => calculatePnL(5, 0, true)).toThrow()
    expect(() => calculatePnL(5, 1.01, true)).toThrow()
    expect(() => calculatePnL(5, -0.1, true)).toThrow()
    expect(() => calculatePnL(5, NaN, true)).toThrow()
  })

  it('rejects invalid amount', () => {
    expect(() => calculatePnL(0, 0.5, true)).toThrow()
    expect(() => calculatePnL(-1, 0.5, true)).toThrow()
    expect(() => calculatePnL(Infinity, 0.5, true)).toThrow()
  })
})

// ── A2 ──────────────────────────────────────────────────────────────────────

describe('calculateReservedForOpenBets (A2)', () => {
  it('sums open + queued bets only', () => {
    const bets = [
      { amount: 1, status: 'open' as AgentBetStatus },
      { amount: 2.5, status: 'queued' as AgentBetStatus },
      { amount: 3, status: 'won' as AgentBetStatus },
      { amount: 4, status: 'lost' as AgentBetStatus },
      { amount: 5, status: 'cancelled' as AgentBetStatus },
    ]
    expect(calculateReservedForOpenBets(bets)).toBe(3.5)
  })

  it('returns 0 for empty list', () => {
    expect(calculateReservedForOpenBets([])).toBe(0)
  })

  it('accepts string amounts (PostgreSQL NUMERIC)', () => {
    const bets = [
      { amount: '1.50', status: 'open' as AgentBetStatus },
      { amount: '2.00', status: 'queued' as AgentBetStatus },
    ]
    expect(calculateReservedForOpenBets(bets)).toBe(3.5)
  })
})

describe('calculateFreeBalance (A2)', () => {
  it('free = balance - reserved', () => {
    expect(calculateFreeBalance(10, 7.5)).toBe(2.5)
  })

  it('never negative (under-collateralized signal)', () => {
    expect(calculateFreeBalance(5, 7.5)).toBe(0)
    expect(calculateFreeBalance(0, 0)).toBe(0)
  })
})

// ── A3 ──────────────────────────────────────────────────────────────────────
// State machine guards. Prevents impossible lifecycle transitions from corrupting
// agent state (e.g., a bet silently going won → open, or an archived agent resurrecting).

describe('isValidAgentTransition (A3)', () => {
  it.each<[AgentStatus, AgentStatus, boolean]>([
    ['draft', 'funding', true],
    ['draft', 'active', false],
    ['funding', 'active', true],
    ['funding', 'paused', true],
    ['active', 'paused', true],
    ['paused', 'active', true],
    ['active', 'archived', true],
    ['archived', 'active', false],
    ['archived', 'draft', false],
    ['active', 'draft', false],
    ['active', 'active', false],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(isValidAgentTransition(from, to)).toBe(expected)
  })
})

describe('isValidAgentBetTransition (A3)', () => {
  it.each<[AgentBetStatus, AgentBetStatus, boolean]>([
    ['queued', 'open', true],
    ['queued', 'cancelled', true],
    ['queued', 'won', false],
    ['open', 'won', true],
    ['open', 'lost', true],
    ['open', 'cancelled', true],
    ['won', 'open', false],
    ['lost', 'open', false],
    ['cancelled', 'open', false],
    ['open', 'queued', false],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(isValidAgentBetTransition(from, to)).toBe(expected)
  })
})

// ── A5 ──────────────────────────────────────────────────────────────────────
// Card-settlement gate. This is what decides if a bot's winnings go to the Visa card.
// Wrong answer leaves money stranded in the vault or, worse, enqueues settlements for
// users who never opted in (unexpected 5% fees).

describe('shouldEnqueueCardSettlement (A5)', () => {
  it.each<[string | null | undefined, boolean]>([
    ['card', true],
    ['card:abc-123', true],
    ['card:0x0000', true],
    ['vault', false],
    ['agent:xyz', false],
    ['wallet:0xABCD', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('payoutDestination=%p → %p', (dest, expected) => {
    expect(shouldEnqueueCardSettlement(dest)).toBe(expected)
  })
})

// ── A6 ──────────────────────────────────────────────────────────────────────
// P&L reconciliation — drives the drift alert that catches silent money loss.

describe('computeExpectedAgentBalance (A6)', () => {
  it('funded - invested + payouts - swept', () => {
    // Agent funded $10, placed $3 in bets, won $5, swept $2 → expected $10
    expect(
      computeExpectedAgentBalance({
        totalFunded: 10,
        totalInvested: 3,
        wonPayouts: 5,
        totalSwept: 2,
      })
    ).toBe(10)
  })

  it('accepts string inputs (NUMERIC from pg)', () => {
    expect(
      computeExpectedAgentBalance({
        totalFunded: '10',
        totalInvested: '3',
        wonPayouts: '5.5',
        totalSwept: '2.25',
      })
    ).toBe(10.25)
  })

  it('rejects non-finite inputs', () => {
    expect(() =>
      computeExpectedAgentBalance({
        totalFunded: NaN,
        totalInvested: 0,
        wonPayouts: 0,
        totalSwept: 0,
      })
    ).toThrow()
  })
})

describe('shouldAlertDrift (A6)', () => {
  it('alerts above threshold', () => {
    expect(shouldAlertDrift(10, 11, 0.5)).toBe(true)   // +$1 drift
    expect(shouldAlertDrift(10, 9, 0.5)).toBe(true)    // -$1 drift (shortfall)
    expect(shouldAlertDrift(10, 10.6, 0.5)).toBe(true)
  })

  it('silent within threshold', () => {
    expect(shouldAlertDrift(10, 10.3, 0.5)).toBe(false)
    expect(shouldAlertDrift(10, 9.7, 0.5)).toBe(false)
    expect(shouldAlertDrift(10, 10, 0.5)).toBe(false)
  })

  it('non-finite inputs return false (no spurious alerts)', () => {
    expect(shouldAlertDrift(NaN, 10, 0.5)).toBe(false)
    expect(shouldAlertDrift(10, Infinity, 0.5)).toBe(false)
  })
})

describe('shouldSweepProfits (A6)', () => {
  it('sweeps at or above threshold', () => {
    expect(shouldSweepProfits(2.0, 2.0)).toBe(true)
    expect(shouldSweepProfits(2.01, 2.0)).toBe(true)
    expect(shouldSweepProfits(100, 2.0)).toBe(true)
  })

  it('holds below threshold', () => {
    expect(shouldSweepProfits(1.99, 2.0)).toBe(false)
    expect(shouldSweepProfits(0, 2.0)).toBe(false)
  })

  it('safe on non-finite inputs', () => {
    expect(shouldSweepProfits(NaN, 2.0)).toBe(false)
    expect(shouldSweepProfits(5, Infinity)).toBe(false)
  })
})

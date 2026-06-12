/**
 * Pure helpers for Sprint 2.3 agent/bot logic.
 * No side effects — tested via src/__tests__/agent-helpers.test.ts.
 *
 * These are the formulas that Sprint 2.3 sweeps MUST use correctly.
 * A wrong coefficient here = silent real-money loss across every settlement.
 */

export type AgentStatus = 'draft' | 'funding' | 'active' | 'paused' | 'archived'
export type AgentBetStatus = 'queued' | 'open' | 'won' | 'lost' | 'cancelled'

/**
 * PnL for a resolved bet.
 * Won: shares = amount / entry_price; each winning share redeems 1 USDC on Polymarket.
 * PnL = shares - amount = amount/entry_price - amount.
 * Lost: PnL = -amount.
 */
export function calculatePnL(amount: number, entryPrice: number, won: boolean): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid amount: ${amount}`)
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice > 1) {
    throw new Error(`Invalid entry price: ${entryPrice}`)
  }
  if (!won) return -amount
  const shares = amount / entryPrice
  return +(shares - amount).toFixed(6)
}

/** USDC reserved on the agent wallet by in-flight bets. Profit sweep must NOT withdraw these. */
export function calculateReservedForOpenBets(
  bets: ReadonlyArray<{ amount: number | string; status: AgentBetStatus }>
): number {
  const total = bets
    .filter((b) => b.status === 'open' || b.status === 'queued')
    .reduce((sum, b) => sum + Number(b.amount), 0)
  return +total.toFixed(6)
}

/** Free sweepable balance = on-chain - reserved. Never negative (signals under-collateralization). */
export function calculateFreeBalance(onChainBalance: number, reservedUsd: number): number {
  const free = onChainBalance - reservedUsd
  return free <= 0 ? 0 : +free.toFixed(6)
}

// ── State machines ──────────────────────────────────────────────────────────

const AGENT_TRANSITIONS: Record<AgentStatus, ReadonlyArray<AgentStatus>> = {
  draft: ['funding', 'archived'],
  funding: ['active', 'paused', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [],
}

export function isValidAgentTransition(from: AgentStatus, to: AgentStatus): boolean {
  return AGENT_TRANSITIONS[from]?.includes(to) ?? false
}

const BET_TRANSITIONS: Record<AgentBetStatus, ReadonlyArray<AgentBetStatus>> = {
  queued: ['open', 'cancelled'],
  open: ['won', 'lost', 'cancelled'],
  won: [],
  lost: [],
  cancelled: [],
}

export function isValidAgentBetTransition(from: AgentBetStatus, to: AgentBetStatus): boolean {
  return BET_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Whether a `users.payout_destination` value routes through card-settlement.
 * Valid destinations: 'vault' | 'card' | 'card:<cardId>' | 'agent:<id>' | 'wallet:<addr>'.
 * Only values starting with 'card' enqueue a card_settlements row.
 */
export function shouldEnqueueCardSettlement(payoutDestination: string | null | undefined): boolean {
  if (!payoutDestination) return false
  return payoutDestination.startsWith('card')
}

/**
 * Expected on-chain agent balance derived from ledger facts.
 * Used by reconcileAgentPnL to detect silent drift.
 *
 * expected = total_funded - total_invested + won_payouts_sum - total_swept
 *
 * A drift between this and the on-chain balance > $0.50 surfaces an alert —
 * same pattern as Sprint D card balance drift telemetry.
 */
export function computeExpectedAgentBalance(params: {
  totalFunded: number | string
  totalInvested: number | string
  wonPayouts: number | string
  totalSwept: number | string
}): number {
  const funded = Number(params.totalFunded)
  const invested = Number(params.totalInvested)
  const payouts = Number(params.wonPayouts)
  const swept = Number(params.totalSwept)
  if ([funded, invested, payouts, swept].some((n) => !Number.isFinite(n))) {
    throw new Error('All P&L inputs must be finite numbers')
  }
  return +(funded - invested + payouts - swept).toFixed(6)
}

/** Drift alert predicate. Absolute delta threshold — same semantics as Sprint D. */
export function shouldAlertDrift(expected: number, actual: number, thresholdUsd: number): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || !Number.isFinite(thresholdUsd)) {
    return false
  }
  return Math.abs(actual - expected) > thresholdUsd
}

/**
 * Sweep-trigger predicate. We sweep profits when free balance on Polygon
 * exceeds the configured minimum. Below threshold = not worth the CCTP gas.
 */
export function shouldSweepProfits(freeBalance: number, minSweepUsd: number): boolean {
  if (!Number.isFinite(freeBalance) || !Number.isFinite(minSweepUsd)) return false
  return freeBalance >= minSweepUsd
}

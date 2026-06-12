// ─────────────────────────────────────────────────────────────────────────────
// HELM-105 TX-CAP GATE — per-tx outbound value ceiling
//
// S31 H1 — observe-mode by default. Catches "agent suddenly tries to move
// $50K in one tx" before the tx broadcasts. Counterpart to bridge.ts
// per-message + per-peer caps already enforced at the OFTAdapter level —
// this is the OFF-CHAIN twin so the alarm fires before we even sign.
//
// Threat model (the Kelp class): an agent (or compromised agent) tries to
// drain reserves in a single move. Per-rule HELM-105 default action is
// 'block', but observe-first: we want to see what the natural distribution
// of tx values looks like before flipping enforce on, so the cap doesn't
// accidentally block legitimate large-USDC swaps in the first week.
//
// Promote to enforce via:
//   HELM_TXCAP_ENFORCE=on              (env)
//   setTxCapEnforceMode(true)              (runtime — admin UI)
//
// Cap source (USD):
//   1. Runtime override (admin UI) if set
//   2. process.env.HELM_TX_CAP_USD_DEFAULT
//   3. DEFAULT_CAP_USD (=5000) — matches the catalog rationale
//
// Per-agent caps from agents.risk_limit will layer on in Marathon 8 Phase 1
// once the cap-resolution path can hit DB without slowing the swap hot path.

import { logHelmEvent } from './core'

const DEFAULT_CAP_USD = 5000

// Runtime overrides (operator-flippable from the admin panel).
let _runtimeEnforceOverride: boolean | null = null
let _runtimeCapOverride: number | null = null

export interface TxCapInput {
  /** Short label for attribution: 'swap-eth-usdc', 'bridge-lz', 'execution-bet', etc. */
  source: string
  /** What kind of move this is — used for observability filtering. */
  txKind: 'swap' | 'bridge' | 'transfer' | 'approve' | 'gas-topup' | 'fee' | 'other'
  /** USD value the caller is moving. For USDC, this == amount; for ETH/HYPE,
   *  the caller computes it from the price feed before calling. */
  valueUsd: number
  chainId: number
  /** Optional metadata — useful for forensic context but not required. */
  fromAddress?: string
  toAddress?: string
  agentId?: string | null
}

function getCapUsd(): number {
  if (_runtimeCapOverride !== null) return _runtimeCapOverride
  const envCap = Number(process.env.HELM_TX_CAP_USD_DEFAULT)
  if (Number.isFinite(envCap) && envCap > 0) return envCap
  return DEFAULT_CAP_USD
}

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_TXCAP_ENFORCE === 'on'
}

/** Operator-flippable enforce mode. null = revert to env. */
export function setTxCapEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

/** Operator-flippable cap value. null = revert to env/default. */
export function setTxCapOverride(usd: number | null): void {
  _runtimeCapOverride = usd
}

/** Effective state for admin UI display. */
export function getTxCapMode(): {
  mode: 'enforce' | 'observe'
  capUsd: number
  enforceSource: 'runtime-override' | 'env'
  capSource: 'runtime-override' | 'env' | 'default'
} {
  const capSource: 'runtime-override' | 'env' | 'default' =
    _runtimeCapOverride !== null
      ? 'runtime-override'
      : Number(process.env.HELM_TX_CAP_USD_DEFAULT) > 0
        ? 'env'
        : 'default'

  if (_runtimeEnforceOverride !== null) {
    return {
      mode: _runtimeEnforceOverride ? 'enforce' : 'observe',
      capUsd: getCapUsd(),
      enforceSource: 'runtime-override',
      capSource,
    }
  }
  return {
    mode: process.env.HELM_TXCAP_ENFORCE === 'on' ? 'enforce' : 'observe',
    capUsd: getCapUsd(),
    enforceSource: 'env',
    capSource,
  }
}

/**
 * Check a tx against the value cap BEFORE broadcasting. Returns silently if
 * value <= cap. Above-cap:
 *   - observe mode: HELM-105 event with action='log-only', returns normally
 *   - enforce mode: HELM-105 event with action='block', throws
 *
 * Callers MUST await this BEFORE wallet.sendTransaction(). The throw in
 * enforce mode is the abort signal — the tx never reaches the network.
 *
 * Negative or NaN valueUsd is treated as "unknown" and skipped silently
 * (with a low-noise debug log) rather than blocking on bad inputs.
 */
export async function enforceTxCap(input: TxCapInput): Promise<void> {
  if (!Number.isFinite(input.valueUsd) || input.valueUsd < 0) {
    // Bad input — don't gate on something we can't measure. Log once for
    // visibility but never block.
    console.warn(
      `[helm HELM-105] skipping cap check — invalid valueUsd=${input.valueUsd} from ${input.source}`,
    )
    return
  }

  // S31 H2 — budget-aware cap. If the caller has an agentId AND has an
  // active weekly budget, the effective cap = min(env_default, remaining).
  // This makes spending visible at the gate level without a budget the
  // env default still applies. Lazy-import to keep heimdall/* free of DB
  // direct deps; budgets module pulls the pool itself via ../db.
  const baseCap = getCapUsd()
  let effectiveCap = baseCap
  let capSource: 'env' | 'budget' = 'env'
  if (input.agentId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { pool } = require('../db')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getEffectiveUsdCap } = require('../budgets')
      const r = await getEffectiveUsdCap(pool, input.agentId, baseCap)
      effectiveCap = r.capUsd
      capSource = r.source
    } catch {
      // Budget module unavailable — fall through to env default.
    }
  }

  if (input.valueUsd <= effectiveCap) {
    // Under cap — record spend (best-effort) and return. Spend recording
    // happens HERE rather than in callers because every enforceTxCap
    // call IS the moneymoving moment. agentId-less calls skip recording.
    if (input.agentId) {
      void recordSpendAsync(input)
    }
    return
  }

  const subject = `${input.source} → $${input.valueUsd.toFixed(2)} > $${effectiveCap} cap (${input.txKind} on chain ${input.chainId})`
  const context: Record<string, unknown> = {
    source: input.source,
    txKind: input.txKind,
    valueUsd: input.valueUsd,
    capUsd: effectiveCap,
    capSource,
    envDefault: baseCap,
    chainId: input.chainId,
  }
  if (input.fromAddress) context.fromAddress = input.fromAddress.slice(0, 14)
  if (input.toAddress) context.toAddress = input.toAddress.slice(0, 14)

  if (enforceModeOn()) {
    await logHelmEvent({
      ruleId: 'HELM-105',
      subject,
      agentId: input.agentId ?? null,
      context: { ...context, action: 'block' },
    })
    throw new Error(
      `[helm HELM-105] tx blocked: $${input.valueUsd.toFixed(2)} > $${effectiveCap} cap (${input.source})`,
    )
  } else {
    await logHelmEvent({
      ruleId: 'HELM-105',
      subject,
      agentId: input.agentId ?? null,
      context: { ...context, action: 'log-only', note: 'observe-mode' },
      actionOverride: 'log-only',
    })
  }
}

/**
 * Best-effort spend recording. Async + swallowing errors so a budget
 * write failure never blocks an on-chain action. Decoupled from the cap
 * check so the gate stays fast.
 */
async function recordSpendAsync(input: TxCapInput): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pool } = require('../db')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recordSpend } = require('../budgets')
    await recordSpend(pool, {
      agentId: input.agentId!,
      deltaUsd: input.valueUsd,
      description: `${input.source} (${input.txKind} on chain ${input.chainId})`,
      chainId: input.chainId ?? null,
    })
  } catch {
    /* swallow — spend recording is best-effort */
  }
}

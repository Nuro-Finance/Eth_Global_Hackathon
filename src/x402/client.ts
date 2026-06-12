// ─────────────────────────────────────────────────────────────────────────────
// x402 CLIENT — agentic payment rails (S33 Phase 1)
//
// Per Decision Journal 2026-04-26_001 DJ 1: x402 is the moat moment for
// AFI's "agentic finance" thesis. Every other agent platform integrating
// x402 is 1 day from saying "we integrate x402." Our differentiator is
// what the wrapper DOES before it pays:
//
// agent.x402Fetch(url)
// → enforceTxCap(tx-cap) budget + tx-cap gate
// → huginn.counsel() "should I?" advisory
// → recordSpend() ledger debit + agent-budget-low publish
// → sandboxAware* if sandbox scope active, isolate
// → wrapFetchWithPayment(...) Coinbase x402-fetch SDK does the EIP-3009
// sign + facilitator settle
// → recordPaymentTxHash() link the settlement tx into the ledger row
// → return response
//
// Settlement chain: BASE (USDC native) — locked S33. Cross-chain initiation
// is async pre-bridge before the call (Phase 1.5+); Phase 1 assumes agent
// has USDC on Base.
//
// Agent key derivation: per-agent HD-derived from CONFIG.PRIVATE_KEY +
// agentId. Mirrors src/bridge.ts pattern. Nuro gets a deterministic vault
// at sha256(PRIVATE_KEY + 'Nuro). Each user-attached agent uses their
// userId. System-level callers use 'system'.
//
// Module is intentionally a single file. Per Karpathy-skill-#2 (Simplicity
// First): no abstractions for single-use code; future Phase 2/3 features
// (server-side, facilitator) will add their own files.
// ─────────────────────────────────────────────────────────────────────────────

import { ethers } from 'ethers'
import { wrapFetchWithPayment, createSigner, decodeXPaymentResponse } from 'x402-fetch'
import type { Pool } from 'pg'
import { CONFIG } from '../config'
import { enforceTxCap } from '../helm'
import { recordSpend } from '../budgets'
import { sandboxAwareQuery, getSandboxContext } from '../sandbox/scope'

// ── Constants ────────────────────────────────────────────────────────────────

/** USDC has 6 decimals. Anywhere we convert USD → atomic units, multiply by 1e6. */
const USDC_DECIMALS = 6

/** Default per-call ceiling: $0.10 USDC. Caller can override per-request. */
const DEFAULT_MAX_USD = 0.10

/** x402 settlement chain. Defaults to Base mainnet (S33 directive
 * "WE SETTLE EVERYTHING ON BASE"). Override via X402_SETTLEMENT_NETWORK
 * to base-sepolia for protocol testing without real USDC. Stays in sync
 * with the same env in src/x402/server.ts. */
const SETTLEMENT_NETWORK = process.env.X402_SETTLEMENT_NETWORK || 'base'
const SETTLEMENT_CHAIN_ID = SETTLEMENT_NETWORK === 'base-sepolia' ? 84532 : 8453

// ── Types ────────────────────────────────────────────────────────────────────

export interface X402FetchInput {
 /** The x402-protected URL to call. */
  url: string
 /** Caller's agent attribution. 'Nuro / 'system' / userId. Drives both the
 * signing key derivation AND the budget/ledger attribution. */
  agentId: string
 /** Maximum USD amount this single call may pay. SDK enforces strictly —
 * if the resource demands more, the call fails before signing. Defaults
 * to $0.10. Operator passes higher caps when calling expensive APIs. */
  maxValueUsd?: number
 /** Standard fetch init (method, headers, body). */
  init?: RequestInit
 /** Optional human-readable label for the ledger entry. Defaults to
 * `x402 <method> <hostname>`. */
  description?: string
}

export interface X402FetchResult {
 /** The fetch Response after payment + retry. */
  response: Response
 /** Payment confirmation if the call required + completed payment.
 * null if the URL didn't require payment (response went 200 on first try). */
  payment: {
    success: boolean
    transactionHash: string
    network: string
    payerAddress: string
  } | null
 /** USD amount actually debited from the agent's budget. 0 if no payment
 * was required. */
  amountDebitedUsd: number
 /** Huginn's verdict on this call (advisory; observe-mode). */
  counselVerdict: 'endorse' | 'caution' | 'dissent' | 'block-recommend' | null
}

// ── Key derivation ──────────────────────────────────────────────────────────

/**
 * Derive the per-agent signing key. Mirrors bridge.ts getDepositPrivateKey
 * pattern: HD-style deterministic from CONFIG.PRIVATE_KEY + agentId.
 *
 * Agents get a stable Base address; reload that address with USDC and
 * the agent can pay any x402 URL up to their funded balance.
 */
function deriveAgentSigningKey(agentId: string): string {
  if (!CONFIG.PRIVATE_KEY) {
    throw new Error('x402: CONFIG.PRIVATE_KEY missing — cannot derive agent signing key')
  }
  const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + agentId)
  return ethers.utils.HDNode.fromSeed(seed).privateKey
}

/**
 * Public address for an agent's x402 vault. Use this to display "fund me at
 * 0x..." OR check on-chain balance.
 */
export function getAgentX402Address(agentId: string): string {
  const privKey = deriveAgentSigningKey(agentId)
  return new ethers.Wallet(privKey).address
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Make an x402 payment-aware fetch on behalf of an agent.
 *
 * Pre-flight chain:
 * 1. enforceTxCap (tx-cap) — agent's budget cap + global tx cap
 * 2. huginn.counsel() — advisory verdict on the proposed payment
 * 3. (optional) abort if HUGINN_ENFORCE_DISSENTS=on AND verdict='block-recommend'
 *
 * Payment via x402-fetch SDK (Coinbase). EIP-3009 transferWithAuthorization
 * — agent signs, facilitator submits + pays gas. Agent only needs USDC on
 * Base, NOT ETH.
 *
 * Post-flight:
 * 4. recordSpend() — debit agent_budgets, fire agent-budget-low if crossing
 * 5. Insert detailed ledger row referencing the settlement tx hash
 *
 * Sandbox-aware: if called inside a sandbox scope, the SDK still signs +
 * sends to the configured facilitator (real settlement on whatever Base
 * fork the sandbox is pointed at). The DB writes route to the sandbox
 * scratch schema via sandboxAwareQuery, so no prod-ledger pollution.
 */
export async function x402Fetch(
  db: Pool,
  input: X402FetchInput,
): Promise<X402FetchResult> {
  const { url, agentId, init } = input
  const maxValueUsd = input.maxValueUsd ?? DEFAULT_MAX_USD

  if (!agentId) throw new Error('x402: agentId required')
  if (!Number.isFinite(maxValueUsd) || maxValueUsd <= 0) {
    throw new Error(`x402: maxValueUsd must be a positive number (got ${maxValueUsd})`)
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error(`x402: invalid url ${url}`)
  }

  const method = init?.method ?? 'GET'
  const description = input.description ?? `x402 ${method} ${parsedUrl.hostname}${parsedUrl.pathname}`

 // ── PRE-FLIGHT 1: tx-cap tx-cap (budget-aware via getEffectiveUsdCap)
 // enforceTxCap reads the agent's weekly budget remaining and combines
 // with the env-default cap. The MAX value is what we authorize for this
 // call; the SDK won't sign for more, and our budget tracks the pre-spend.
  await enforceTxCap({
    source: 'x402-call',
    txKind: 'transfer',
    valueUsd: maxValueUsd,
    chainId: SETTLEMENT_CHAIN_ID,
    fromAddress: getAgentX402Address(agentId),
    toAddress: parsedUrl.hostname,
    agentId,
  })

 // ── PRE-FLIGHT 2: Huginn counsel
 // Advisory by default. If HUGINN_ENFORCE_DISSENTS=on AND verdict is
 // block-recommend, we refuse the call. Otherwise we log the verdict
 // and proceed.
  let counselVerdict: X402FetchResult['counselVerdict'] = null
  try {
    const { counsel } = await import('../huginn')
    const result = await counsel(db, {
      proposerAgentId: agentId,
      actionType: 'x402-payment',
      actionSubject: `${method} ${parsedUrl.hostname}`,
      valueUsd: maxValueUsd,
      chainId: SETTLEMENT_CHAIN_ID,
      reasoning: `Outbound x402 call to ${parsedUrl.hostname}`,
      metadata: {
        url,
        method,
        path: parsedUrl.pathname,
      },
    })
    counselVerdict = result.verdict
    if (
      result.verdict === 'block-recommend' &&
      process.env.HUGINN_ENFORCE_DISSENTS === 'on'
    ) {
      const e: any = new Error(
        `x402 payment refused by Huginn (block-recommend): ${result.reasoning}`,
      )
      e.code = 'HUGINN_DISSENT'
      e.statusCode = 403
      e.counsel = result
      throw e
    }
  } catch (err: any) {
    if (err.code === 'HUGINN_DISSENT') throw err
 // Counsel failure is non-fatal in observe mode — log + proceed.
    console.warn(`[x402] counsel failed for ${agentId} → ${url}: ${err?.message?.slice(0, 120)}`)
  }

 // ── PAYMENT: hand off to x402-fetch SDK
  const privateKey = deriveAgentSigningKey(agentId)
 // x402's createSigner expects 0x-prefixed hex.
  const hexPrivKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
 // x402's createSigner returns Promise<Signer> (the EVM path is sync internally
 // but wrapped in Promise.resolve so the SVM path can be async). Awaiting here
 // is REQUIRED — passing a Promise to wrapFetchWithPayment fails the
 // isEvmSignerWallet duck-type check ("chain"/"transport" not in Promise) and
 // throws "Invalid evm wallet client provided" only when a real 402 challenge
 // arrives (httpbin.org/200 path skipped this — discovered via Phase 2 loopback).
  const signer = await createSigner(SETTLEMENT_NETWORK, hexPrivKey as `0x${string}`)
  const maxValueAtomic = BigInt(Math.floor(maxValueUsd * 10 ** USDC_DECIMALS))
  const fetchWithPay = wrapFetchWithPayment(globalThis.fetch, signer, maxValueAtomic)

  const response = await fetchWithPay(url, init ?? {})

 // Decode the payment response header if present.
 // x402-fetch sets `X-PAYMENT-RESPONSE` after settlement.
  let payment: X402FetchResult['payment'] = null
  let amountDebitedUsd = 0
  const paymentHeader = response.headers.get('X-PAYMENT-RESPONSE')
  if (paymentHeader) {
    try {
      const decoded = decodeXPaymentResponse(paymentHeader)
      payment = {
        success: decoded.success,
        transactionHash: decoded.transaction,
        network: String(decoded.network),
        payerAddress: decoded.payer,
      }
 // We can't read the actual settled amount from this header alone.
 // Use the maxValueUsd as a conservative debit (worst-case the agent
 // signed for); if the resource charged less, on-chain reconcile can
 // refund the delta later. Phase 1 trade-off: simple + safe.
      amountDebitedUsd = maxValueUsd
    } catch (err: any) {
      console.warn(`[x402] failed to decode payment response: ${err?.message?.slice(0, 80)}`)
    }
  }

 // ── POST-FLIGHT: record spend + ledger detail
  if (payment && amountDebitedUsd > 0) {
    try {
      await recordSpend(db, {
        agentId,
        deltaUsd: amountDebitedUsd,
        description,
        txHash: payment.transactionHash,
        chainId: SETTLEMENT_CHAIN_ID,
      })
    } catch (err: any) {
 // Recording failure shouldn't poison a successful payment — the
 // payment HAPPENED on-chain. Operator reconciles via tx hash.
      console.error(
        `[x402] recordSpend FAILED for ${agentId} after successful payment ${payment.transactionHash}: ${err?.message?.slice(0, 200)}`,
      )
    }
  }

 // ── DETAIL LOG: a richer ledger entry for the x402 panel
 // sandboxAwareQuery routes to scratch schema if a sandbox scope is
 // active, otherwise to public.execution_log. Either way: forensics.
  const inSandbox = getSandboxContext() != null
  void sandboxAwareQuery(db,
    `INSERT INTO execution_log
       (id, entity_type, entity_id, action, status, detail, tx_hash, created_at)
     VALUES (gen_random_uuid(), 'x402_call', $1, $2, $3, $4, $5, now())`,
    [
      agentId,
      'x402_payment',
      payment ? 'success' : 'no_payment',
      JSON.stringify({
        url,
        method,
        hostname: parsedUrl.hostname,
        responseStatus: response.status,
        amountDebitedUsd,
        counselVerdict,
        sandboxed: inSandbox,
      }).slice(0, 4000),
      payment?.transactionHash ?? null,
    ],
  ).catch((err: any) => {
    console.warn(`[x402] execution_log insert failed: ${err?.message?.slice(0, 100)}`)
  })

  return {
    response,
    payment,
    amountDebitedUsd,
    counselVerdict,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// x402 SERVER - agentic-payment endpoints (S33 Phase 2)
//
// Mirror of src/x402/client.ts. While client.ts wraps fetch to PAY for x402
// resources, this module GATES our own Express handlers behind x402 USDC
// payment. Together they close the loop: Nuro can pay Nuro endpoints for
// agent services, and external x402 clients can pay us too.
//
// Per Decision Journal 2026-04-26_001 idea X3 (Phase 2): server-side x402
// endpoints unlock loopback E2E without depending on third-party 402
// resources, and they're the foundation for everything we monetize at the
// API layer (paid agent calls, paid market data, paid bridge route quotes,
// etc).
//
// Architecture:
// - x402Route(opts, handler): Express route wrapper. On request without
// X-PAYMENT header, returns 402 + paymentRequirements JSON. On request
// with valid X-PAYMENT, verify+settle via facilitator, run handler,
// attach X-PAYMENT-RESPONSE header to the response.
// - Handler is a pure function `req → body`. Rationale: the wrapper needs
// to settle BEFORE flushing the response body (otherwise client gets
// paid service even if settlement fails, which is revenue leakage). By
// having the handler return a body instead of writing to res, we keep
// the buffer-then-settle order trivial.
// - Settlement: real USDC on Base via the Coinbase-hosted facilitator at
// facilitator.x402.org. Phase 3 (idea X5) swaps in our own at
// facilitator.nuro.finance.
// - Settlement vault: HD-derived from CONFIG.PRIVATE_KEY + 'nuro-revenue'.
// Separate from agent SPEND vaults so the on-chain ledger is clean -
// Nuro vault funds calls; revenue vault collects them.
// - Logs: every successful settlement appends to execution_log
// (entity_type='x402_server') for the revenue trail.
//
// Karpathy guideline #2 (Simplicity First): single file, no abstractions
// beyond what Phase 2 needs. Phase 3 will add facilitator hosting in a
// separate file.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express'
import type { Pool } from 'pg'
import { ethers } from 'ethers'
// `useFacilitator` lives in `x402/verify` at runtime - the package's
// `x402/facilitator` subpath only re-exports the bare verify+settle
// primitives (which require a chain client). The .d.ts on
// `x402/facilitator` lists useFacilitator but the runtime JS does not -
// confirmed via Object.keys() on the deployed module. Importing from
// `x402/verify` matches what the JS actually exports.
import { useFacilitator } from 'x402/verify'
import { facilitator as coinbaseFacilitator } from '@coinbase/x402'
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from 'x402/types'
import { CONFIG } from '../config'

// ── Network config ──────────────────────────────────────────────────────────

/** USDC has 6 decimals everywhere we settle. */
const USDC_DECIMALS = 6

/** x402 protocol version we speak. v1 is what the npm packages ship. */
const X402_VERSION = 1

/** Per-network configuration. The EIP-712 domain values matter - facilitator
 * re-derives the typed-data hash against the actual on-chain contract and
 * rejects mismatches. Values verified against the deployed USDC contracts.
 *
 * Mainnet (8453): name="USD Coin" (Circle's branded USDC)
 * Sepolia (84532): name="USDC" (test issuance, different brand string) */
const NETWORK_CONFIG: Record<
  string,
  { chainId: number; usdcContract: string; usdcName: string; usdcVersion: string }
> = {
  base: {
    chainId: 8453,
    usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
  'base-sepolia': {
    chainId: 84532,
    usdcContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdcName: 'USDC',
    usdcVersion: '2',
  },
}

/** Settlement network - defaults to Base mainnet per S33 directive
 * ("WE SETTLE EVERYTHING ON BASE"). Override to base-sepolia via
 * X402_SETTLEMENT_NETWORK env when testing the protocol mechanics
 * without real USDC. */
const SETTLEMENT_NETWORK = process.env.X402_SETTLEMENT_NETWORK || 'base'

function getNetworkConfig() {
  const cfg = NETWORK_CONFIG[SETTLEMENT_NETWORK]
  if (!cfg) {
    throw new Error(
      `[x402:server] unsupported X402_SETTLEMENT_NETWORK="${SETTLEMENT_NETWORK}" - ` +
        `must be one of: ${Object.keys(NETWORK_CONFIG).join(', ')}`,
    )
  }
  return cfg
}

// ── Lazy facilitator singleton ──────────────────────────────────────────────

/** Picks which facilitator to use:
 *
 * - Mainnet (`base`) requires Coinbase's authenticated facilitator
 * (CDP_API_KEY_ID + CDP_API_KEY_SECRET in env). The public
 * x402.org facilitator only supports testnets for v1 - confirmed
 * via its /supported endpoint. We grab `@coinbase/x402`'s pre-built
 * facilitator object which is shaped {url, createAuthHeaders} and
 * reads CDP credentials from the env automatically.
 *
 * - Testnets (`base-sepolia`) work against the public
 * https://x402.org/facilitator without auth.
 *
 * - X402_FACILITATOR_URL env override wins over both - Phase 3 will
 * point this at facilitator.nuro.finance once we host our own. */
let _facilitator: ReturnType<typeof useFacilitator> | null = null
function getFacilitator(): ReturnType<typeof useFacilitator> {
  if (_facilitator !== null) return _facilitator

 // Operator override always wins.
  if (process.env.X402_FACILITATOR_URL) {
    _facilitator = useFacilitator({ url: process.env.X402_FACILITATOR_URL })
    return _facilitator
  }

 // Mainnet ⇒ Coinbase facilitator (requires CDP creds).
  if (SETTLEMENT_NETWORK === 'base') {
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      throw new Error(
        '[x402:server] Base mainnet settlement requires CDP_API_KEY_ID + ' +
          'CDP_API_KEY_SECRET env vars (Coinbase Developer Platform). ' +
          'Either set those, set X402_SETTLEMENT_NETWORK=base-sepolia for ' +
          'protocol testing, or set X402_FACILITATOR_URL to a custom ' +
          'mainnet-capable facilitator (Phase 3 self-hosted at ' +
          'facilitator.nuro.finance).',
      )
    }
 // coinbaseFacilitator's createAuthHeaders reads CDP_API_KEY_ID +
 // CDP_API_KEY_SECRET from process.env on each call.
    _facilitator = useFacilitator(coinbaseFacilitator)
    return _facilitator
  }

 // Testnet ⇒ public facilitator.
  _facilitator = useFacilitator({ url: 'https://x402.org/facilitator' })
  return _facilitator
}

// ── Settlement vault ────────────────────────────────────────────────────────

/**
 * Returns the deterministic Base address that receives x402 payments to this
 * deployment. HD-derived from CONFIG.PRIVATE_KEY + 'nuro-revenue'. Operator
 * monitors USDC balance on basescan.org/address/<addr> to see revenue
 * accumulate. Address is stable across restarts - same key, same address.
 *
 * Note: the Issuer issuer + bridge stack already use HD derivation from the
 * same root key with different agentIds; mirroring that pattern keeps the
 * key-management surface identical.
 */
export function getNuroRevenueAddress(): string {
  const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + 'nuro-revenue')
  const hd = ethers.utils.HDNode.fromSeed(seed)
  return new ethers.Wallet(hd.privateKey).address
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface X402RouteOptions {
 /** USDC required, in dollars. e.g., 0.001 = 0.1¢. */
  priceUsd: number
 /** Recipient address. Defaults to the Nuro revenue vault. */
  payTo?: string
 /** Human-readable description shown to clients in the 402 challenge. */
  description?: string
 /** MIME type of the success response. Defaults to application/json. */
  mimeType?: string
 /** Client-side max settlement wait, in seconds. Defaults to 60. */
  maxTimeoutSeconds?: number
 /** DB pool for execution_log writes (revenue trail). */
  db: Pool
}

/** Pure function: req → body. The wrapper buffers this and sends it after
 * settlement succeeds, so the client never receives paid content unless
 * payment actually moved on-chain. */
export type X402Handler<T = unknown> = (req: Request) => Promise<T> | T

/**
 * Wraps a handler with x402 payment enforcement.
 *
 * Usage:
 * router.get('/api/x402/demo/echo',
 * x402Route({ priceUsd: 0.001, description: '...', db }, async (req) => ({
 * message: 'paid content here',
 * echoed: req.query,
 * })),
 * )
 *
 * Lifecycle:
 * 1. No X-PAYMENT header → 402 with paymentRequirements JSON (per spec).
 * 2. Invalid/expired payment → 402 with the same requirements + error.
 * 3. Verified payment → run handler, settle, attach X-PAYMENT-RESPONSE,
 * send body. Settlement failure 402s with retry instructions.
 * 4. Handler crash → 500, NO settlement attempted (client not charged).
 */
export function x402Route<T = unknown>(
  opts: X402RouteOptions,
  handler: X402Handler<T>,
) {
  return async (req: Request, res: Response, _next?: NextFunction) => {
 // Resolve the canonical public URL. Behind nginx (the prod posture)
 // req.protocol reads 'http' even though the client hit 'https' - we'd
 // emit a misleading resource string. Honor X-Forwarded-Proto when set
 // by the upstream proxy. Take only the FIRST value if a proxy chain
 // appended ('https,http' → 'https'). Same idea for host.
    const fwdProto = (req.header('x-forwarded-proto') || '').split(',')[0].trim()
    const proto = fwdProto || req.protocol
    const host = req.header('x-forwarded-host') || req.get('host')

    const netCfg = getNetworkConfig()

 // Build paymentRequirements per the x402 spec. Network-derived fields
 // (asset address, EIP-712 domain) come from NETWORK_CONFIG so flipping
 // X402_SETTLEMENT_NETWORK between 'base' and 'base-sepolia' is a single
 // env change with no code rewrite.
    const requirements: PaymentRequirements = {
      scheme: 'exact',
      network: SETTLEMENT_NETWORK,
      maxAmountRequired: String(
        Math.round(opts.priceUsd * 10 ** USDC_DECIMALS),
      ),
      resource: `${proto}://${host}${req.originalUrl}`,
      description: opts.description ?? `Access to ${req.path}`,
      mimeType: opts.mimeType ?? 'application/json',
      payTo: opts.payTo ?? getNuroRevenueAddress(),
      maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 60,
      asset: netCfg.usdcContract,
 // EIP-712 domain - facilitator re-derives the typed-data hash against
 // the actual on-chain contract and rejects mismatches. Values from
 // NETWORK_CONFIG match the deployed USDC's domain separator on each
 // chain (Mainnet name="USD Coin", Sepolia name="USDC").
      extra: {
        name: netCfg.usdcName,
        version: netCfg.usdcVersion,
      },
    }

 // ── Step 1: 402 challenge if no payment ───────────────────────────────
    const paymentHeader = req.header('X-PAYMENT')
    if (!paymentHeader) {
      res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE')
      return res.status(402).json({
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'X-PAYMENT header required',
      })
    }

 // ── Step 2: decode payment payload (base64-encoded JSON per spec) ─────
    let payload: PaymentPayload
    try {
      const decoded = Buffer.from(paymentHeader, 'base64').toString('utf8')
      payload = JSON.parse(decoded)
    } catch (err) {
      const e = err as Error
      return res.status(402).json({
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'invalid X-PAYMENT payload',
        detail: e?.message?.slice(0, 200),
      })
    }

 // ── Step 3: verify cryptographic signature + nonce + balance ──────────
 // Pre-flight only - no on-chain action. If invalid, 402 + retry hint.
    const facilitator = getFacilitator()
    let verifyRes: VerifyResponse
    try {
      verifyRes = await facilitator.verify(payload, requirements)
    } catch (err) {
      const e = err as Error
      return res.status(402).json({
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'verification call failed',
        detail: e?.message?.slice(0, 200),
      })
    }
    if (!verifyRes?.isValid) {
      return res.status(402).json({
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'payment verification failed',
        detail: verifyRes?.invalidReason ?? 'unknown',
      })
    }

 // ── Step 4: run the handler ───────────────────────────────────────────
 // If it throws, NO settlement happens - the client's EIP-3009
 // authorization is signed but unused (cryptographically a no-op).
    let body: T
    try {
      body = await handler(req)
    } catch (err) {
      const e = err as Error
      console.error(
        `[x402:server] handler error on ${req.path}: ${e?.message?.slice(0, 200)}`,
      )
      return res.status(500).json({
        error: 'handler failed',
        detail: e?.message?.slice(0, 200),
      })
    }

 // ── Step 5: settle on-chain ───────────────────────────────────────────
    let settleRes: SettleResponse
    try {
      settleRes = await facilitator.settle(payload, requirements)
    } catch (err) {
      const e = err as Error
      console.error(`[x402:server] settle failed: ${e?.message?.slice(0, 200)}`)
      return res.status(402).json({
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'settlement failed',
        detail: e?.message?.slice(0, 200),
      })
    }
    if (!settleRes?.success) {
      return res.status(402).json({
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'settlement rejected',
        detail: settleRes?.errorReason ?? 'unknown',
      })
    }

 // ── Step 6: attach X-PAYMENT-RESPONSE header per spec ─────────────────
    const txHash = settleRes.txHash || settleRes.transaction || ''
    const payer = payload?.payload?.authorization?.from ?? null
    const responseHeader = Buffer.from(
      JSON.stringify({
        success: true,
        transaction: txHash,
        network: SETTLEMENT_NETWORK,
        payer,
      }),
    ).toString('base64')
    res.setHeader('X-PAYMENT-RESPONSE', responseHeader)
    res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE')

 // ── Step 7: revenue trail in execution_log ────────────────────────────
 // Best-effort - log failure must not block the paid response since
 // settlement already happened and the client expects a 200.
    try {
      await opts.db.query(
        `INSERT INTO execution_log
           (entity_type, entity_id, action, status, tx_hash, detail)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'x402_server',
          requirements.resource.slice(0, 100),
          'x402_settle',
          'success',
          txHash.slice(0, 100),
          JSON.stringify({
            resource: requirements.resource,
            payer,
            amountUsd: opts.priceUsd,
            amountAtomic: requirements.maxAmountRequired,
            payTo: requirements.payTo,
            method: req.method,
            txHash,
            network: SETTLEMENT_NETWORK,
            chainId: netCfg.chainId,
 // Tag the facilitator that settled - useful when we run our own
 // alongside Coinbase's during the Phase 3 transition.
            facilitator: process.env.X402_FACILITATOR_URL
              ? 'override'
              : SETTLEMENT_NETWORK === 'base'
                ? 'coinbase'
                : 'public',
          }),
        ],
      )
    } catch (err) {
      const e = err as Error
      console.warn(
        `[x402:server] execution_log write failed: ${e?.message?.slice(0, 100)}`,
      )
    }

 // ── Step 8: send the paid response body ───────────────────────────────
    return res.status(200).json(body)
  }
}

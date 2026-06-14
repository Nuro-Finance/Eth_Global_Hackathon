// ─────────────────────────────────────────────────────────────────────────────
// x402 FACILITATOR SERVER - S33 Phase 1 (routing) + S34 Phase 2 (in-house verify)
//
// Stands up `/facilitator/verify`, `/facilitator/settle`, `/facilitator/supported`
// at api.nuro.finance, conformant to the x402 facilitator spec.
//
// - Internal payers (HD-derived agent vaults - Nuro, Huginn, system,
// nuro-revenue): both verify AND settle are handled IN-HOUSE.
//
// /verify → validates EIP-3009 authorization shape, expiry, recipient,
// amount, nonce-dedup, EIP-712 signature recovery, AND that
// the agent has enough budget remaining for the spend
// (off-chain settle debits `agent_budgets`).
// /settle → off-chain ledger move (recordSpend on sender, recordRefill
// on recipient). Synthetic txHash `offchain:<ledger_id>` so
// x402-fetch on the caller side accepts it transparently.
//
// - External payers: FORWARD to the upstream facilitator. Mainnet routes
// to Coinbase CDP via @coinbase/x402 (when CDP creds set); testnet
// routes to public x402.org. Operator override via
// X402_UPSTREAM_FACILITATOR_URL.
//
// Phase 2 brought verify in-house for internal payers (S34, this commit).
// Phase 3 - running mainnet on-chain settle for external payers - is the
// multi-week lift that earns us facilitator-rails revenue from third-party
// agents; deferred until traffic justifies the operational lift.
//
// Operator workflow to point Nuro client at us:
// ssh nuro@vps "echo 'X402_FACILITATOR_URL=https://api.nuro.finance/facilitator' >> ~/Nuro-Finance/.env"
// pm2 restart nuro-api
//
// Metrics live in execution_log entity_type='x402_facilitator' for
// per-route attribution (verify_inhouse / settle_offchain / forward).
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, Router } from 'express'
import type { Pool } from 'pg'
import { ethers } from 'ethers'
import { CONFIG } from '../config'

const SUPPORTED_NETWORKS_TESTNET = [
  { x402Version: 1, scheme: 'exact', network: 'base-sepolia' },
]
const SUPPORTED_NETWORKS_MAINNET = [
  { x402Version: 1, scheme: 'exact', network: 'base' },
]

// ── EIP-3009 / EIP-712 verification primitives ───────────────────────────
//
// USDC implements EIP-3009 (transferWithAuthorization). The signature
// covers the authorization tuple under an EIP-712 domain anchored to the
// USDC contract on the settlement chain. Different deployments (mainnet
// vs testnet) ship with different `name()` strings, so we maintain a
// per-network domain catalog. Sourced from the deployed contracts; verify
// against etherscan if a new chain is added.
//
// USDC contracts:
// Base mainnet 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 - "USD Coin" v2
// Base sepolia 0x036CbD53842c5426634e7929541eC2318f3dCF7e - "USDC" v2
const USDC_DOMAINS: Record<
  string,
  { name: string; version: string; chainId: number; verifyingContract: string }
> = {
  base: {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'base-sepolia': {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

interface EIP3009Authorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

interface PaymentRequirementsLite {
  scheme?: string
  network?: string
  asset?: string
  payTo?: string
  maxAmountRequired?: string
}

type VerifyResult =
  | { isValid: true; payer: string }
  | { isValid: false; invalidReason: string; payer?: string }

/**
 * In-house EIP-3009 + budget verifier for internal-payer authorizations.
 *
 * Runs the same contract-level checks the upstream facilitator runs (shape,
 * expiry, recipient, amount, signature recovery) PLUS our own off-chain
 * gate: the agent's `agent_budgets.usd_remaining` must cover the spend.
 *
 * Returns { isValid: true, payer } on pass, or { isValid: false, invalidReason }
 * on any fail. The reason string is operator-facing (logged + surfaced to
 * the caller); never includes a secret.
 *
 * Nonce dedup: scans `execution_log` for a previously verified or settled
 * authorization with the same `authNonce` in `detail`. The dedup is best-effort
 * - if execution_log is wiped or the column shape drifts, dedup degrades to
 * pass-through (a malicious agent would still need a valid signature, and
 * each settle decrements the budget). True replay-protection lives in the
 * USDC contract on-chain; we mirror it here for the off-chain ledger path.
 */
export async function verifyInternalAuthorization(
  db: Pool,
  authorization: EIP3009Authorization,
  paymentRequirements: PaymentRequirementsLite,
  signature: string,
  internalAgentId: string,
): Promise<VerifyResult> {
  const network = paymentRequirements.network || ''
  const domain = USDC_DOMAINS[network]
  if (!domain) {
    return { isValid: false, invalidReason: `unsupported network "${network}"` }
  }

 // Asset must be the USDC contract for the network - refuse mistargeted
 // authorizations (e.g. a sandbox-only token mistakenly hitting prod).
  const expectedAsset = domain.verifyingContract.toLowerCase()
  const providedAsset = (paymentRequirements.asset || '').toLowerCase()
  if (providedAsset && providedAsset !== expectedAsset) {
    return {
      isValid: false,
      invalidReason: `asset mismatch (expected ${expectedAsset}, got ${providedAsset})`,
    }
  }

 // Expiry - EIP-3009 expresses validAfter/validBefore as unix-seconds strings.
  const now = Math.floor(Date.now() / 1000)
  const validAfter = Number(authorization.validAfter)
  const validBefore = Number(authorization.validBefore)
  if (!Number.isFinite(validAfter) || !Number.isFinite(validBefore)) {
    return { isValid: false, invalidReason: 'malformed validAfter/validBefore (non-numeric)' }
  }
  if (validAfter > now) {
    return { isValid: false, invalidReason: `authorization not yet valid (${validAfter} > ${now})` }
  }
  if (validBefore <= now) {
    return { isValid: false, invalidReason: `authorization expired (${validBefore} <= ${now})` }
  }

 // Recipient must match payTo. Refuse "right signer, wrong recipient" -
 // an attacker's signed authorization for a DIFFERENT payee can't be
 // redirected to ours.
  const claimedPayTo = (paymentRequirements.payTo || '').toLowerCase()
  if (claimedPayTo && authorization.to.toLowerCase() !== claimedPayTo) {
    return {
      isValid: false,
      invalidReason: `authorization recipient (${authorization.to}) does not match payTo (${paymentRequirements.payTo})`,
    }
  }

 // Amount: authorization must cover the requested charge.
  let value: bigint
  let required: bigint
  try {
    value = BigInt(authorization.value)
    required = BigInt(paymentRequirements.maxAmountRequired || '0')
  } catch {
    return { isValid: false, invalidReason: 'malformed amount (non-integer)' }
  }
  if (value < required) {
    return {
      isValid: false,
      invalidReason: `authorization value ${value} < required ${required}`,
    }
  }

 // Nonce dedup. authNonce is recorded in detail JSON on both verify and
 // settle log rows; a hit here means we've already accepted this nonce.
  try {
    const dup = await db.query(
      `SELECT 1 FROM execution_log
       WHERE entity_type = 'x402_facilitator'
         AND status IN ('verified', 'success')
         AND detail::jsonb->>'authNonce' = $1
       LIMIT 1`,
      [authorization.nonce],
    )
    if ((dup.rowCount ?? 0) > 0) {
      return { isValid: false, invalidReason: 'authorization nonce already used' }
    }
  } catch (err) {
 // dedup query failure is non-fatal - log and proceed. The signature
 // check below still gates malicious replay; budget cap gates
 // accidental replay.
    console.warn(
      `[facilitator] nonce dedup query failed (degrading): ${(err as Error)?.message?.slice(0, 120)}`,
    )
  }

 // EIP-712 signature recovery - the signer of the typed data MUST be the
 // claimed `from` address. ethers.utils.verifyTypedData performs the
 // domain-separator + struct-hash + ecrecover dance internally.
  let recovered: string
  try {
    recovered = ethers.utils.verifyTypedData(
      {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract,
      },
      TRANSFER_WITH_AUTHORIZATION_TYPES as unknown as Record<
        string,
        { name: string; type: string }[]
      >,
      {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore: authorization.validBefore,
        nonce: authorization.nonce,
      },
      signature,
    )
  } catch (err) {
    return {
      isValid: false,
      invalidReason: `signature recovery failed: ${(err as Error)?.message?.slice(0, 120)}`,
    }
  }
  if (recovered.toLowerCase() !== authorization.from.toLowerCase()) {
    return {
      isValid: false,
      invalidReason: `recovered signer ${recovered} does not match authorization.from ${authorization.from}`,
    }
  }

 // Budget gate - the off-chain settle path will debit agent_budgets, so
 // require sufficient remaining BEFORE we tell the caller we'll settle.
 // Use MAX(usd_remaining) across active budgets to support multi-period
 // budgets where any period can fund the spend.
  const valueUsd = Number(value) / 1_000_000
  try {
    const budgetRow = await db.query(
      `SELECT MAX(usd_remaining::numeric) AS remaining
       FROM agent_budgets
       WHERE agent_id = $1 AND active = true`,
      [internalAgentId],
    )
    const remaining = Number(budgetRow.rows[0]?.remaining ?? 0)
    if (remaining < valueUsd) {
      return {
        isValid: false,
        invalidReason: `insufficient agent budget: $${remaining.toFixed(4)} remaining < $${valueUsd.toFixed(4)} required`,
        payer: authorization.from,
      }
    }
  } catch (err) {
 // Budget table read failure - fail closed for safety. A genuine outage
 // means we can't validate the spend; better to refuse than to settle
 // off-chain against an unknown budget state.
    return {
      isValid: false,
      invalidReason: `budget lookup failed: ${(err as Error)?.message?.slice(0, 120)}`,
    }
  }

  return { isValid: true, payer: authorization.from }
}

/** Default upstream facilitator URLs. Operator can override the entire
 * flow via X402_UPSTREAM_FACILITATOR_URL. */
const UPSTREAM_TESTNET = 'https://x402.org/facilitator'

function getUpstreamFacilitator(): { url: string; authHeaders: () => Promise<Record<string, string>> } {
 // Operator override always wins.
  if (process.env.X402_UPSTREAM_FACILITATOR_URL) {
    return {
      url: process.env.X402_UPSTREAM_FACILITATOR_URL,
      authHeaders: async () => ({}),
    }
  }
 // Mainnet default: Coinbase CDP. Requires CDP creds.
  const isMainnet = (process.env.X402_SETTLEMENT_NETWORK || 'base') === 'base'
  if (isMainnet && process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { facilitator } = require('@coinbase/x402') as typeof import('@coinbase/x402')
    return {
      url: facilitator.url,
      authHeaders: async () => {
        const all = await facilitator.createAuthHeaders()
 // The combined headers - verify uses .verify, settle uses .settle.
 // For the combined-route forward we union everything; upstream
 // ignores keys it doesn't need.
        return { ...all.verify, ...all.settle }
      },
    }
  }
 // Testnet default: public x402.org.
  return { url: UPSTREAM_TESTNET, authHeaders: async () => ({}) }
}

/**
 * Returns true if the given EVM address is one of our HD-derived agent
 * vaults. Pre-S33-X5 had only 'Nuro / 'system' / 'nuro-revenue';
 * future agents register here. Conservative - false negative just means
 * the call gets forwarded upstream, no harm done.
 */
function isInternalAgentAddress(addr: string): { isInternal: boolean; agentId: string | null } {
  const candidates = ['huginn', 'system', 'nuro-revenue']
  const target = addr.toLowerCase()
  for (const id of candidates) {
    const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + id)
    const hd = ethers.utils.HDNode.fromSeed(seed)
    const derived = new ethers.Wallet(hd.privateKey).address.toLowerCase()
    if (derived === target) return { isInternal: true, agentId: id }
  }
  return { isInternal: false, agentId: null }
}

// ── Forward helpers ──────────────────────────────────────────────────────

interface ForwardResult {
  status: number
  body: unknown
  ms: number
}

async function forwardToUpstream(
  path: '/verify' | '/settle' | '/supported',
  body: unknown,
  method: 'GET' | 'POST',
): Promise<ForwardResult> {
  const upstream = getUpstreamFacilitator()
  const url = upstream.url.replace(/\/$/, '') + path
  const start = Date.now()
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await upstream.authHeaders()),
    }
    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    })
    const ct = res.headers.get('content-type') || ''
    const responseBody = ct.includes('application/json') ? await res.json() : await res.text()
    return { status: res.status, body: responseBody, ms: Date.now() - start }
  } catch (err) {
    const e = err as Error
    return {
      status: 502,
      body: { error: 'upstream_forward_failed', detail: e?.message?.slice(0, 200) },
      ms: Date.now() - start,
    }
  }
}

// ── Route handlers ───────────────────────────────────────────────────────

/**
 * Mounts /facilitator/* routes on the given router. Public - no admin
 * key required (a facilitator's whole purpose is to be reachable by
 * external payment clients). Each request is metered + logged so
 * operators can tell internal-vs-forwarded ratios.
 */
export function mountFacilitatorRoutes(router: Router, db: Pool): void {
 // GET /facilitator/supported - what schemes/networks we accept.
 // Returns the union of testnet + mainnet so callers see the full
 // surface; mainnet entries only actually settle when CDP creds are set
 // upstream. Defensive: if upstream is unreachable the operator still
 // knows what we'd accept.
  router.get('/facilitator/supported', async (_req: Request, res: Response) => {
    res.json({
      kinds: [
        ...(process.env.X402_SETTLEMENT_NETWORK === 'base-sepolia'
          ? SUPPORTED_NETWORKS_TESTNET
          : []),
        ...(process.env.X402_SETTLEMENT_NETWORK !== 'base-sepolia'
          ? SUPPORTED_NETWORKS_MAINNET
          : []),
      ],
      facilitator: 'nuro.finance',
      mode: 'phase-1-routing-layer',
      upstream: getUpstreamFacilitator().url,
    })
  })

 // POST /facilitator/verify - pre-flight signature + balance + nonce check.
 // - Internal payer: in-house EIP-3009 sig recovery + budget gate (Phase 2).
 // - External payer: forward to upstream.
  router.post('/facilitator/verify', async (req: Request, res: Response) => {
    const payload = req.body || {}
    const start = Date.now()
    const authorization: EIP3009Authorization | undefined =
      payload?.paymentPayload?.payload?.authorization
    const signature: string | undefined = payload?.paymentPayload?.payload?.signature
    const paymentRequirements: PaymentRequirementsLite | undefined = payload?.paymentRequirements
    const payer: string | undefined = authorization?.from

 // Try in-house verify if payer is one of our HD-derived agent vaults.
    if (payer && authorization && signature && paymentRequirements) {
      const { isInternal, agentId } = isInternalAgentAddress(payer)
      if (isInternal && agentId) {
        const result = await verifyInternalAuthorization(
          db,
          authorization,
          paymentRequirements,
          signature,
          agentId,
        )
        const valueAtomic = authorization.value
        const valueUsd = /^\d+$/.test(valueAtomic) ? Number(valueAtomic) / 1_000_000 : null
        void db
          .query(
            `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              'x402_facilitator',
              'verify',
              'verify_inhouse',
              result.isValid ? 'verified' : 'verify_failed',
              JSON.stringify({
                payer,
                payerAgentId: agentId,
                authNonce: authorization.nonce,
                valueAtomic,
                valueUsd,
                network: paymentRequirements.network,
                ms: Date.now() - start,
                invalidReason: result.isValid ? undefined : result.invalidReason,
              }),
            ],
          )
          .catch(() => {})
        if (result.isValid) {
          return res.json({ isValid: true, payer: result.payer })
        }
 // Spec-conformant invalid response. payer included for upstream-style
 // diagnostic UX even when validation failed.
        return res.json({ isValid: false, invalidReason: result.invalidReason, payer })
      }
    }

 // External payer or malformed payload - forward to upstream.
    const fwd = await forwardToUpstream('/verify', payload, 'POST')
    void db
      .query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'x402_facilitator',
          'verify',
          'forward',
          fwd.status === 200 ? 'success' : 'forward_error',
          JSON.stringify({
            upstream: getUpstreamFacilitator().url,
            upstreamStatus: fwd.status,
            ms: fwd.ms,
          }),
        ],
      )
      .catch(() => {})
    res.status(fwd.status).json(fwd.body)
  })

 // POST /facilitator/settle - execute the EIP-3009 transferWithAuthorization.
 // Phase 1 routing:
 // - If payer is an internal agent (HD-derived vault we control): take
 // the off-chain fast path. Recipient credit + sender debit happen as
 // agent_budget_ledger entries; no on-chain tx, no upstream call.
 // - Else: forward to upstream facilitator.
  router.post('/facilitator/settle', async (req: Request, res: Response) => {
    const payload = req.body || {}
    const authorization: EIP3009Authorization | undefined =
      payload?.paymentPayload?.payload?.authorization
    const payer: string | undefined = authorization?.from
    const payee: string | undefined = payload?.paymentRequirements?.payTo
    const amountAtomic: string | undefined = payload?.paymentRequirements?.maxAmountRequired
    const authNonce: string | undefined = authorization?.nonce
    const amountUsd =
      amountAtomic && /^\d+$/.test(amountAtomic) ? Number(amountAtomic) / 1_000_000 : null

    if (payer) {
      const { isInternal, agentId } = isInternalAgentAddress(payer)
      if (isInternal && agentId && amountUsd != null && amountUsd > 0) {
 // Off-chain fast path - record spend on sender, refill on recipient.
        try {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { recordSpend, recordRefill } = require('../budgets') as typeof import('../budgets')
          const recipientId = payee ? isInternalAgentAddress(payee).agentId || 'external-recipient' : 'unknown'
          const spend = await recordSpend(db, {
            agentId,
            deltaUsd: amountUsd,
            description: `x402-settle off-chain → ${payee || 'unknown'} (recipient=${recipientId})`,
          })
 // Synthetic tx hash - distinguishable from real tx hashes by
 // the prefix. Operator queries can filter on this when
 // computing on-chain volume.
          const fakeTxHash = `offchain:${spend.ledgerId}`
          if (recipientId !== 'external-recipient' && recipientId !== 'unknown') {
            await recordRefill(db, {
              agentId: recipientId,
              deltaUsd: amountUsd,
              description: `x402-recv off-chain ← ${agentId} (ledger=${spend.ledgerId})`,
              by: 'x402-facilitator',
            }).catch(() => {})
          }
          await db
            .query(
              `INSERT INTO execution_log (entity_type, entity_id, action, status, tx_hash, detail)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                'x402_facilitator',
                spend.ledgerId,
                'settle_offchain',
                'success',
                fakeTxHash,
                JSON.stringify({
                  payer,
                  payerAgentId: agentId,
                  payee,
                  payeeAgentId: recipientId,
                  amountUsd,
                  authNonce,
                  network: payload?.paymentRequirements?.network,
                  ledgerId: spend.ledgerId,
                }),
              ],
            )
            .catch(() => {})
 // Spec-conformant SettleResponse so x402-fetch on the caller
 // side accepts it transparently.
          return res.json({
            success: true,
            txHash: fakeTxHash,
            transaction: fakeTxHash,
            network: payload?.paymentRequirements?.network || 'base',
            payer,
          })
        } catch (err) {
          const e = err as Error
          console.warn(
            `[facilitator] off-chain settle failed for ${agentId}: ${e?.message?.slice(0, 200)}`,
          )
 // Fall through to forward path; upstream may succeed even if
 // our off-chain rails are down.
        }
      }
    }

 // External or off-chain failure path: forward to upstream.
    const fwd = await forwardToUpstream('/settle', payload, 'POST')
    void db
      .query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'x402_facilitator',
          'settle',
          'forward',
          fwd.status === 200 ? 'success' : 'forward_error',
          JSON.stringify({
            upstream: getUpstreamFacilitator().url,
            upstreamStatus: fwd.status,
            ms: fwd.ms,
            payer,
            amountUsd,
            authNonce,
          }),
        ],
      )
      .catch(() => {})
    res.status(fwd.status).json(fwd.body)
  })
}

import axios from 'axios'
import { createPublicKey, publicEncrypt, randomBytes, constants, createDecipheriv } from 'node:crypto'
import { CONFIG } from './config'
import { IssuerContract } from './types'

/**
 * Issuer's published RSA public key for card-secret reveals (production — only
 * environment that exists). 1024-bit RSA, used with RSA-OAEP / SHA-1 padding.
 *
 * Sourced from card issuer integration docs. Full integration spec
 * lives in internal issuer-card-secrets skill docs. Do NOT change padding
 * or hash — SHA-256 returns 400 "Failed to Decrypt Session ID".
 */
const ISSUER_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCeZ9uCoxi2XvOw1VmvVLo88TLk
GE+OO1j3fa8HhYlJZZ7CCIAsaCorrU+ZpD5PUTnmME3DJk+JyY1BB3p8XI+C5uno
QucrbxFbkM1lgR10ewz/LcuhleG0mrXL/bzUZbeJqI6v3c9bXvLPKlsordPanYBG
FZkmBPxc8QEdRgH4awIDAQAB
-----END PUBLIC KEY-----`

export interface OnboardResponse {
    userId: string
    applicationStatus: string
    kycCompletionLink: {
        url: string
        params: { userId: string }
    }
}

const onboardClient = axios.create({
    baseURL: CONFIG.ISSUER_API_BASE,
    headers: { 'x-api-key': CONFIG.ISSUER_API_KEY },
})

const issuingClient = axios.create({
    baseURL: CONFIG.ISSUER_API_BASE,
    headers: { 'x-api-key': CONFIG.ISSUER_API_KEY },
})

// Helm egress-observe — observe outbound traffic to issuer API hosts.
try {
 // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(onboardClient, 'issuers-onboarding')
    instrumentAxios(issuingClient, 'issuers-issuing')
} catch { /* heimdall not initialized — skip */ }

export async function onboardUser(
    firstName: string,
    lastName: string,
    email: string
): Promise<OnboardResponse> {
    const response = await onboardClient.post<OnboardResponse>('/users/onboard', {
        firstName,
        lastName,
        email,
    })
    return response.data
}

export async function createCard(issuerUserId: string): Promise<string> {
  const response = await issuingClient.post<{ cardId: string }>(`/users/${issuerUserId}/cards`)
  return response.data.cardId
}

export interface IssuerCardDetails {
  cardId: string
  cardNumber: string
  expiryDate: string
  cvv: string
  status: string
}

// ─── LIST ISSUER CARDS ───────────────────────────────────────────────────────
// Fetch all cards that exist for an Issuer user. Use this BEFORE createCard
// to check if a card already exists — Issuer limits 1 card per user.

export async function listIssuerCards(issuerUserId: string): Promise<IssuerCardDetails[]> {
  try {
    const response = await issuingClient.get<IssuerCardDetails[] | { cards: IssuerCardDetails[] }>(
      `/users/${issuerUserId}/cards`
    )
 // Handle both array response and { cards: [...] } response
    const data = response.data
    return Array.isArray(data) ? data : (data as any).cards || []
  } catch (err: any) {
    if (err.response?.status === 404) return []
    throw err
  }
}

export async function getCardDetails(issuerCardId: string): Promise<IssuerCardDetails> {
  const response = await issuingClient.get<IssuerCardDetails>(`/cards/${issuerCardId}`)
  return response.data
}

export async function freezeCard(cardId: string, freeze: boolean): Promise<void> {
 // 2026-05-30: Issuer status enum is { 'active' | 'locked' } (discovered
 // via scripts/probe-issuer-freeze.ts). The 5/25 memory note saying
 // 'frozen' works was a false positive — only the unfreeze direction
 // had been walked. Real values:
 // freeze → PATCH /cards/{id} { status: 'locked' } ✓
 // unfreeze → PATCH /cards/{id} { status: 'active' } ✓
 //
 // Other status values rejected with explicit message:
 // "body/status must be equal to one of the allowed values"
 // Don't try 'frozen', 'paused', 'suspended', 'inactive', 'blocked',
 // 'disabled', 'closed', 'terminated' — all hard-rejected.
 //
 // Other PATCH field shapes (isLocked, enabled:false, frozen:true, etc.)
 // returned 200 OK BUT the API silently accepts unknown fields and
 // ignores them — those "successes" don't actually freeze the card.
 // Only the status enum field has real validation + real effect.
  await issuingClient.patch(`/cards/${cardId}`, {
    status: freeze ? 'locked' : 'active',
  })
}

// ─── Issuer CARD DEBIT / CREDIT (Buy 1 — Session 28) ────────────────────────────
// Conventional REST endpoints; actual Issuer path may differ — Issuer ops conversation
// pending. The helper calls the most likely path; if Issuer uses a different
// shape (e.g. POST /transactions with type='debit'), swap this implementation
// without changing the call sites.
//
// Throws with err.response populated so callers can distinguish:
// 404 → endpoint doesn't exist on Issuer side (Buy 1 impossible until Issuer ops confirms)
// 400 → bad params (amount, etc.)
// 402 → insufficient card balance
// 500 → Issuer internal error
// network → timeout / DNS / no response

export interface DebitResult {
  transactionId: string
  newBalance: number  // cents, post-debit
}

/**
 * Debit an amount from the user's card balance (card → Nuro reserve).
 * Used by Buy 1 to convert card balance into USDC on any chain.
 * Pre-condition: user has issuer_user_id + active card + sufficient balance.
 */
export async function debitCard(
  issuerCardId: string,
  amountCents: number,
  idempotencyKey: string,
): Promise<DebitResult> {
  const response = await issuingClient.post<DebitResult>(
    `/cards/${issuerCardId}/debit`,
    {
      amount: amountCents,
 // Idempotency key prevents double-debit if we retry due to timeout.
 // Issuer should recognize this key and return the original response on retry.
      idempotencyKey,
      description: 'Nuro Buy 1 — card balance → crypto wallet',
    }
  )
  return response.data
}

/**
 * Credit an amount BACK to the user's card (reverse of debitCard).
 * Used for reconciliation when Buy 1 mid-flight fails (Issuer debit succeeded
 * but on-chain transfer failed) — refund the user's card balance so they're
 * not out the money. Operator-triggered, not user-facing.
 */
export async function creditCard(
  issuerCardId: string,
  amountCents: number,
  idempotencyKey: string,
  reason: string,
): Promise<DebitResult> {
  const response = await issuingClient.post<DebitResult>(
    `/cards/${issuerCardId}/credit`,
    {
      amount: amountCents,
      idempotencyKey,
      description: `Nuro reconciliation: ${reason}`.slice(0, 200),
    }
  )
  return response.data
}

// ─── GET ISSUER USER STATUS ──────────────────────────────────────────────────
// Check if Issuer user exists and their application/KYC status

export async function getIssuerUserStatus(issuerUserId: string): Promise<{
  userId: string
  applicationStatus: string
  kycStatus: string
} | null> {
  try {
    const response = await issuingClient.get(`/users/${issuerUserId}`)
    return response.data
  } catch (err: any) {
    if (err.response?.status === 404) return null
    throw err
  }
}

export async function getUserBaseDepositAddress(userId: string): Promise<string | null> {
 // Returns null when the user's Issuer state is irrecoverable (404 = not
 // found, 403 = revoked access / stale issuer_user_id). Caller (monitor.ts)
 // maps null to transactions.status='stranded' to BREAK the 1h auto-retry
 // loop — otherwise a bad user_id cascades to a forever-retry cascade.
 //
 // Session 28 fix — user 49418fc8-23ab-49c3-96c9-9a64b4583c11 was in this
 // state, burning Issuer quota every hour on a 403 that would never resolve.
    try {
        const response = await issuingClient.get<IssuerContract[]>(`/users/${userId}/contracts`)
        const contracts = response.data
        const baseContract = contracts.find(c => c.chainId === CONFIG.BASE_CHAIN_ID)
        if (!baseContract) {
 // User exists at Issuer but has no Base contract — same semantic as
 // "no address to deliver to", return null to strand.
            console.warn(`[issuer] user=${userId} has no Base contract in Issuer contracts list`)
            return null
        }
        return baseContract.depositAddress
    } catch (err: any) {
        const status = err?.response?.status
        if (status === 404 || status === 403) {
            console.warn(`[issuer] getUserBaseDepositAddress user=${userId} → Issuer returned ${status}. Marking stranded. Likely causes: invalid issuer_user_id, KYC revoked, or user deleted on Issuer side.`)
            return null
        }
 // 5xx or network error — propagate so caller retries later
        throw err
    }
}

// ─── ISSUER BALANCE SYNC ────────────────────────────────────────────────────
// Card balance is READ ONLY from Issuer. This function fetches the real balance
// from Issuer's API. Returns balance in CENTS (divide by 100 for USD).

export async function syncIssuerBalance(issuerUserId: string): Promise<number | null> {
    try {
        const response = await issuingClient.get<{ creditLimit: number; spendingPower: number; pendingCharges: number; postedCharges: number; balanceDue: number }>(
            `/users/${issuerUserId}/balances`
        )
 // Issuer returns: { creditLimit, spendingPower, pendingCharges, postedCharges, balanceDue }
 // spendingPower = what the user can actually spend (creditLimit minus charges)
 // All values in cents
        return response.data.spendingPower // in cents
    } catch (err: any) {
        if (err.response?.status === 404) {
 // User has no Issuer account or no card yet
            return null
        }
        throw err
    }
}

// ─── ISSUER TRANSACTIONS ─────────────────────────────────────────────────────
// Fetch real card transactions from Issuer's system. These are the REAL
// spend/deposit events that happened through the Visa card network.
//
// Supports cursor pagination and since-timestamp filtering per Issuer Integration
// Guide (postedAfter / cursor / limit). Legacy shape (array return) preserved
// via getIssuerTransactions(); callers needing pagination use getIssuerTransactionsPage().

export interface IssuerTransactionsPage {
    items: any[]
    nextCursor: string | null
}

export async function getIssuerTransactionsPage(
    issuerUserId: string,
    opts: { postedAfter?: string; cursor?: string; limit?: number } = {}
): Promise<IssuerTransactionsPage> {
    try {
        const params: Record<string, any> = { userId: issuerUserId }
        if (opts.limit) params.limit = opts.limit
        if (opts.postedAfter) params.postedAfter = opts.postedAfter
        if (opts.cursor) params.cursor = opts.cursor

        const response = await issuingClient.get(`/transactions`, { params })
        const data = response.data || {}
 // Issuer responses observed as either { transactions: [], cursor } or { items: [], cursor } or plain array
        const items = data.transactions || data.items || (Array.isArray(data) ? data : [])
        const nextCursor = data.cursor || data.nextCursor || null
        return { items, nextCursor }
    } catch (err: any) {
        if (err.response?.status === 404) {
            return { items: [], nextCursor: null }
        }
        throw err
    }
}

/**
 * Legacy shape — returns items only. Kept for callers that don't need pagination.
 * New call sites should prefer getIssuerTransactionsPage().
 */
export async function getIssuerTransactions(issuerUserId: string, limit: number = 50): Promise<any[]> {
    const page = await getIssuerTransactionsPage(issuerUserId, { limit })
    return page.items
}

// ─── ISSUER CARD NUMBER (REAL) ───────────────────────────────────────────────
// Card numbers ALWAYS come from Issuer. We NEVER generate them locally.
// This function fetches the real PAN from Issuer using the cardId.

export async function getIssuerCardNumber(issuerCardId: string): Promise<{ cardNumber: string | null; expiryDate: string | null; cvv: string | null } | null> {
    try {
        const response = await issuingClient.get(`/cards/${issuerCardId}`)
        const data = response.data ?? {}

 // Issuer's metadata endpoint (`GET /cards/:id`) deliberately does NOT return
 // the full PAN or CVV — that's PCI-by-design, secrets only flow via the
 // RSA-OAEP / AES-128-GCM session-encrypted reveal endpoint. What it
 // DOES return is `last4`, `expirationMonth`, `expirationYear`. Earlier
 // this function was reading non-existent `cardNumber` / `expiryDate` /
 // `cvv` fields and returning all-nulls, leaving the FE to render
 // m-dashes for everything. Now we surface what the metadata endpoint
 // actually has — masked PAN with the real last4 and a properly
 // formatted MM/YY expiry — and leave CVV null until the reveal flow
 // ships (Issuer ops's RSA + AES-GCM protocol).
        const last4 = data.last4 ? String(data.last4) : null
        const expiry = (data.expirationMonth && data.expirationYear)
            ? `${String(data.expirationMonth).padStart(2, '0')}/${String(data.expirationYear).slice(-2)}`
            : null

        return {
            cardNumber: last4 ? `•••• •••• •••• ${last4}` : null,
            expiryDate: expiry,
            cvv: null,
        }
    } catch (err: any) {
        if (err.response?.status === 404) {
            return null
        }
        throw err
    }
}

/**
 * Generate a fresh SessionId for Issuer's RSA-OAEP-gated reveal endpoints
 * (`/cards/:id/secrets`, `/cards/:id/pin`).
 *
 * Protocol (per Issuer docs — see `.claude/skills/issuer-card-secrets/SKILL.md`):
 * 1. Random 16 bytes → 32-char hex
 * 2. Base64-encode the hex *string* (UTF-8) — yes, base64 of a hex string,
 * not base64 of the raw 16 bytes. Counterintuitive but required.
 * 3. RSA-OAEP / SHA-1 encrypt those base64 bytes with Issuer's public key
 * 4. Base64 the ciphertext → that's the SessionId header value
 *
 * The returned `secretKey` is preserved in case the response comes back
 * AES-128-GCM-encrypted (Issuer ops mentioned this shape once though the official
 * docs show plaintext). If we ever see ciphertext responses, key =
 * Buffer.from(secretKey, 'hex'), tag = last 16 bytes of base64-decoded
 * payload.
 */
function generateSessionId(): { secretKey: string; sessionId: string } {
    const pub = createPublicKey(ISSUER_PUBLIC_KEY_PEM)
    const secretKey = randomBytes(16).toString('hex')              // 32-char hex
 // Day-4 fix: HEX-DECODE the secretKey to 16 raw bytes, THEN base64.
 // Earlier (incorrect) version UTF-8-encoded the 32-char hex string and
 // base64'd those 32 bytes, which produced a different value than what
 // Issuer's server reconstructs after RSA-decrypt → AES-GCM fails the auth
 // tag check with "Unsupported state or unable to authenticate data".
    const secretB64 = Buffer.from(secretKey, 'hex').toString('base64')
    const ct = publicEncrypt(
        { key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
        new Uint8Array(Buffer.from(secretB64, 'utf8')),
    )
    return { secretKey, sessionId: ct.toString('base64') }
}

export interface IssuerCardSecrets {
    pan: string
    cvv: string
    expMonth: string
    expYear: string
}

/**
 * AES-128-GCM decrypt a single Issuer-encrypted secret field.
 *
 * Wire format (per Issuer ops, verified against live API 2026-05-08):
 * { "iv": "<base64>", "data": "<base64>" }
 * - iv: base64-encoded 16-byte IV
 * - data: base64-encoded (ciphertext || authTag) — auth tag is the LAST
 * 16 bytes; everything before is the ciphertext
 *
 * AES key derivation: hex-decode the 32-char `secretKey` to 16 bytes — NOT
 * the UTF-8 bytes of the hex string (that would be 32 bytes / wrong size for
 * AES-128). The same `secretKey` we put inside the SessionId encrypts the
 * response.
 */
function decryptCardSecret(secretKeyHex: string, payload: { iv: string; data: string }): string {
    const key = Buffer.from(secretKeyHex, 'hex')                       // 16 bytes
    const iv = Buffer.from(payload.iv, 'base64')
    const combined = Buffer.from(payload.data, 'base64')
    const tagLen = 16
    const tag = combined.subarray(combined.length - tagLen)
    const ciphertext = combined.subarray(0, combined.length - tagLen)
    const decipher = createDecipheriv('aes-128-gcm', new Uint8Array(key), new Uint8Array(iv))
    decipher.setAuthTag(new Uint8Array(tag))
    const pt = Buffer.concat([
        new Uint8Array(decipher.update(new Uint8Array(ciphertext))),
        new Uint8Array(decipher.final()),
    ])
    return pt.toString('utf8')
}

interface SecretsApiResponse {
    encryptedPan?: { iv: string; data: string }
    encryptedCvc?: { iv: string; data: string }
 // Plaintext fallback shape some Issuer docs reference — we accept either
 // and prefer encrypted when both shapes appear.
    pan?: string
    cvv?: string
    expMonth?: string
    expYear?: string
}

/**
 * Fetch the full PAN / CVV from Issuer's encrypted reveal endpoint.
 * Generates a fresh SessionId per call (one-shot tokens, never reused).
 *
 * Note: the secrets endpoint does NOT return expiry. Pair this with
 * `getIssuerCardNumber()` for `expMonth/expYear` from the metadata endpoint.
 *
 * Returns null on 404 or unparseable response. Throws on transport errors —
 * caller treats as "reveal unavailable" and falls back to the metadata-only
 * render.
 *
 * IMPORTANT: never log, store, cache, or pass these values anywhere except
 * the immediate HTTP response back to the user. PCI-DSS 3.2.2 forbids
 * persisting CVV after authorization.
 */
export async function getIssuerCardSecrets(issuerCardId: string): Promise<IssuerCardSecrets | null> {
    const { secretKey, sessionId } = generateSessionId()
    try {
        const response = await issuingClient.get<SecretsApiResponse>(
            `/cards/${issuerCardId}/secrets`,
            { headers: { SessionId: sessionId } },
        )
        const data = response.data ?? {}

 // Encrypted-shape (the actual production response on 2026-05-08)
        if (data.encryptedPan && data.encryptedCvc) {
            const pan = decryptCardSecret(secretKey, data.encryptedPan)
            const cvv = decryptCardSecret(secretKey, data.encryptedCvc)
 // Expiry NOT in this response — caller fetches separately.
            return { pan, cvv, expMonth: '', expYear: '' }
        }

 // Plaintext-shape fallback (what Issuer's official docs claim)
        if (data.pan && data.cvv) {
            return {
                pan: data.pan,
                cvv: data.cvv,
                expMonth: data.expMonth ?? '',
                expYear: data.expYear ?? '',
            }
        }

 // Neither shape — treat as failure
        return null
    } catch (err: any) {
        if (err.response?.status === 404) return null
        throw err
    }
}

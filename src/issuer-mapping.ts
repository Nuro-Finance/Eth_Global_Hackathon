/**
 * ─── SD3 → CARD_TRANSACTIONS MAPPING ─────────────────────────────────────────
 *
 * Pure functions mapping SD3 webhook/API payloads into our card_transactions
 * row shape. No DB calls; call sites handle upsert.
 *
 * SD3 envelope shapes seen in production code:
 *   New: { id, type: 'transaction', action: 'completed', data: { ... }, timestamp }
 *   Old: { resource: 'transaction', action: 'completed', body: { ... } }
 *
 * We accept both via extractEventData() below.
 */

const VALID_CATEGORIES = new Set([
  'groceries', 'entertainment', 'transport', 'crypto', 'shopping',
  'food', 'utilities', 'health', 'travel', 'other', 'income', 'transfer',
])

/**
 * Minimal MCC (ISO 18245 Merchant Category Code) → our category mapping.
 * Covers the most common codes; unknown codes fall back to 'other' and the
 * raw value is preserved in merchant_category_raw for future expansion.
 */
const MCC_TO_CATEGORY: Record<string, string> = {
  // Groceries
  '5411': 'groceries',
  '5422': 'groceries',
  '5451': 'groceries',
  // Food / restaurants
  '5812': 'food',
  '5813': 'food',
  '5814': 'food',
  // Transport
  '4111': 'transport',
  '4121': 'transport',
  '4131': 'transport',
  '5541': 'transport',
  '5542': 'transport',
  '7523': 'transport',
  // Shopping
  '5311': 'shopping',
  '5399': 'shopping',
  '5732': 'shopping',
  '5999': 'shopping',
  '5651': 'shopping',
  // Utilities
  '4899': 'utilities',
  '4900': 'utilities',
  // Health
  '8011': 'health',
  '8021': 'health',
  '8041': 'health',
  '8099': 'health',
  '5912': 'health',
  // Travel
  '3000': 'travel', '3001': 'travel', '3002': 'travel', '3003': 'travel',
  '4511': 'travel',
  '3501': 'travel', '3502': 'travel', '3503': 'travel',
  '7011': 'travel',
  // Entertainment
  '7832': 'entertainment',
  '7929': 'entertainment',
  '7991': 'entertainment',
  '7994': 'entertainment',
  '5815': 'entertainment',
}

export function mapSd3ToCategory(raw: string | null | undefined): string {
  if (!raw) return 'other'
  const s = String(raw).trim()
  if (!s) return 'other'

  // Case 1: SD3 sent a numeric MCC
  if (/^\d{3,4}$/.test(s)) {
    return MCC_TO_CATEGORY[s] || 'other'
  }

  // Case 2: SD3 sent a human-readable string — normalize and match
  const lower = s.toLowerCase().replace(/[_-]/g, '')
  if (VALID_CATEGORIES.has(lower)) return lower

  // Common synonyms
  if (lower.includes('grocer') || lower.includes('supermarket')) return 'groceries'
  if (lower.includes('restaurant') || lower.includes('dining') || lower.includes('cafe')) return 'food'
  if (lower.includes('gas') || lower.includes('fuel') || lower.includes('uber') || lower.includes('lyft') || lower.includes('taxi')) return 'transport'
  if (lower.includes('airline') || lower.includes('hotel') || lower.includes('lodging')) return 'travel'
  if (lower.includes('pharmacy') || lower.includes('medical') || lower.includes('doctor')) return 'health'
  if (lower.includes('stream') || lower.includes('movie') || lower.includes('music')) return 'entertainment'

  return 'other'
}

export function mapSd3Status(status: string | null | undefined): 'pending' | 'completed' | 'failed' {
  if (!status) return 'pending'
  const s = String(status).toLowerCase()
  if (s === 'completed' || s === 'posted' || s === 'settled' || s === 'success') return 'completed'
  if (s === 'failed' || s === 'declined' || s === 'reversed' || s === 'error') return 'failed'
  return 'pending'
}

export interface Sd3Spend {
  id?: string
  amount?: number            // cents per SD3 Integration Guide
  currency?: string
  merchantName?: string
  merchantCategory?: string
  status?: string
  cardId?: string            // SD3 card id — maps to cards.issuer_card_id
  userId?: string            // SD3 user id
  authorizedAt?: string
  postedAt?: string
}

export interface Sd3TransactionData {
  id?: string
  type?: 'spend' | 'fee' | 'payment' | 'collateral' | string
  spend?: Sd3Spend
  fee?: Sd3Spend
  payment?: Sd3Spend
  collateral?: any
  [key: string]: any
}

export interface CardTxInsert {
  cardId: string
  userId: string
  name: string
  type: 'purchase' | 'deposit' | 'withdrawal'
  amount: number             // USD, signed (negative for debit)
  isIncoming: boolean        // true for deposit/payment, false for spend/fee/withdrawal
  category: string
  status: 'pending' | 'completed' | 'failed'
  issuerTransactionId: string
  merchantCategoryRaw: string | null
  merchantName: string | null
  transactionType: string    // 'visa_spend' | 'issuer_fee' | 'issuer_payment'
  occurredAt: Date
  sourceVerified: boolean
  /**
   * For observability — if amount interpretation is uncertain, includes the
   * alternative interpretation so reconciliation can flag drift.
   */
  amountInterpretations?: { asCents: number; asMicro: number }
}

/**
 * Map an SD3 transaction `data` object to our card_transactions row shape.
 * `dbCardId` is our internal card PK (already looked up from cards.issuer_card_id).
 */
export function mapSd3SpendToCardTx(
  data: Sd3TransactionData,
  dbCardId: string,
  dbUserId: string
): CardTxInsert {
  const sd3Type = (data.type || 'spend').toLowerCase()
  const inner: Sd3Spend = data.spend || data.fee || data.payment || (data as unknown as Sd3Spend)

  const amountCents = typeof inner.amount === 'number' ? inner.amount : 0
  const amountUsd = amountCents / 100
  const signedAmount = sd3Type === 'payment' ? Math.abs(amountUsd) : -Math.abs(amountUsd)

  const txType: CardTxInsert['type'] =
    sd3Type === 'payment' ? 'deposit' : 'purchase'
  const transactionType =
    sd3Type === 'fee' ? 'issuer_fee' :
    sd3Type === 'payment' ? 'issuer_payment' :
    'visa_spend'

  const occurredAt = inner.postedAt || inner.authorizedAt
    ? new Date(inner.postedAt || inner.authorizedAt!)
    : new Date()

  const issuerTransactionId = data.id || inner.id || ''

  // Defensive truncation. Migration 048 widened these columns to varchar(255),
  // but a single overflow tanks the entire sync batch (Day-4 incident: CAFE
  // WEST's 65-char merchantCategory blew the 50-char column and stranded 5
  // rows for ~14h). Cheap insurance against the next time SD3 returns
  // something longer than we expect.
  const truncate = (s: string | null | undefined, max: number): string | null => {
    if (s == null) return null
    return s.length > max ? s.slice(0, max) : s
  }

  // Day-4 fix: payment-type events are USDC-bridge top-ups (income — money
  // INTO the card). Without isIncoming = true, the FE cash flow chart sums
  // them under "expenses" (or worse, drops them via type-not-purchase
  // fallback) and the income column reads $0 even when the user has been
  // funding their card. Source of truth: SD3 type === 'payment' OR amount
  // direction. We trust sd3Type — the issuer is authoritative.
  const isIncoming = sd3Type === 'payment'

  return {
    cardId: dbCardId,
    userId: dbUserId,
    name: truncate(inner.merchantName, 255) || (sd3Type === 'fee' ? 'Issuer fee' : sd3Type === 'payment' ? 'Card payment' : 'Purchase'),
    type: txType,
    amount: signedAmount,
    isIncoming,
    category: mapSd3ToCategory(inner.merchantCategory),
    status: mapSd3Status(inner.status),
    issuerTransactionId: truncate(issuerTransactionId, 100) || '',
    merchantCategoryRaw: truncate(inner.merchantCategory, 255),
    merchantName: truncate(inner.merchantName, 255),
    transactionType,
    occurredAt,
    sourceVerified: false,
    amountInterpretations: {
      asCents: amountUsd,
      asMicro: amountCents / 1_000_000,
    },
  }
}

/**
 * Normalize the SD3 webhook envelope across the two observed shapes.
 * Returns null if neither shape is present.
 */
export function extractEventData(payload: any): {
  resource: string
  action: string
  data: any
  eventId: string | null
} | null {
  if (!payload || typeof payload !== 'object') return null

  const resource = (payload.type || payload.resource || '').toLowerCase()
  const action = (payload.action || '').toLowerCase()
  const data = payload.data || payload.body || {}
  const eventId = payload.id || null

  if (!resource || !action) return null

  return { resource, action, data, eventId }
}

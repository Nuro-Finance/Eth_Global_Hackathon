// ─── DWOLLA CLIENT ──────────────────────────────────────────────────────────
// Thin axios wrapper around Dwolla REST API v2. Handles OAuth2 client_credentials
// token lifecycle + the subset of resources Buy 2 needs: customers, funding
// sources (from Plaid processor_token), transfers.
//
// Session 28 Phase 8 — scaffold only. All calls throw if DWOLLA_KEY/SECRET
// unset. Flag-gated upstream by CONFIG.BUY_2_ENABLED.
//
// Buy 2 flow (Dwolla half):
//   1. Plaid processor_token → createFundingSource(customerId, processorToken)
//      → returns funding_source_url  (the user's bank at Dwolla)
//   2. initiateTransfer({ sourceUrl: funding_source_url, destUrl: CONFIG.DWOLLA_MASTER_FUNDING_SOURCE_URL, amount })
//      → returns transfer_url  (Dwolla pulls ACH bank → Nuro master)
//   3. Poll getTransferStatus(transfer_url) until 'processed' (3-5 business days ACH)
//      OR rely on Dwolla webhook (future — not in scaffold scope)
//   4. Once 'processed', Nuro can recognize the inbound funds and sweep to Fee Vault
//
// Why axios-direct (not `dwolla-v2` npm SDK):
//   • Same rationale as plaid-client.ts — minimal deps, matches issuers.ts style
//   • Dwolla's auth is OAuth2 client_credentials — 30 lines of token cache logic
//
// Ref: https://developers.dwolla.com/docs/api-reference (stable since 2018)

import axios, { AxiosInstance } from 'axios'
import { CONFIG } from './config'

const DWOLLA_API_BASE: Record<typeof CONFIG.DWOLLA_ENV, string> = {
  sandbox: 'https://api-sandbox.dwolla.com',
  production: 'https://api.dwolla.com',
}
const DWOLLA_AUTH_BASE: Record<typeof CONFIG.DWOLLA_ENV, string> = {
  sandbox: 'https://api-sandbox.dwolla.com/token',
  production: 'https://api.dwolla.com/token',
}

function assertConfigured(): void {
  if (!CONFIG.DWOLLA_KEY || !CONFIG.DWOLLA_SECRET) {
    throw new Error('Dwolla credentials not configured (DWOLLA_KEY / DWOLLA_SECRET)')
  }
}

// ─── OAUTH TOKEN CACHE ───────────────────────────────────────────────────────
// Dwolla access tokens TTL 1 hour. Cache in-memory with 60s skew so we refresh
// proactively. No cross-process sharing — each PM2 worker holds its own token;
// this is fine at current scale (1 worker). Revisit if we shard.

interface CachedToken {
  access_token: string
  expires_at: number   // unix ms
}

let _token: CachedToken | null = null

// Helm HELM-101 — module-level auth client kept around so the egress
// observer is registered exactly once (interceptors compound otherwise).
// Used only for the OAuth2 token POST.
let _authClient: AxiosInstance | null = null
function authClient(): AxiosInstance {
  if (_authClient) return _authClient
  _authClient = axios.create({ timeout: 10000 })
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_authClient, `dwolla-auth-${CONFIG.DWOLLA_ENV}`)
  } catch { /* skip */ }
  return _authClient
}

async function getAccessToken(): Promise<string> {
  assertConfigured()
  const now = Date.now()
  if (_token && _token.expires_at > now + 60_000) return _token.access_token

  const basic = Buffer.from(`${CONFIG.DWOLLA_KEY}:${CONFIG.DWOLLA_SECRET}`).toString('base64')
  const res = await authClient().post(
    DWOLLA_AUTH_BASE[CONFIG.DWOLLA_ENV],
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  _token = {
    access_token: res.data.access_token,
    expires_at: now + (Number(res.data.expires_in) || 3600) * 1000,
  }
  return _token.access_token
}

async function client(): Promise<AxiosInstance> {
  const token = await getAccessToken()
  const inst = axios.create({
    baseURL: DWOLLA_API_BASE[CONFIG.DWOLLA_ENV],
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.dwolla.v1.hal+json',
      'Content-Type': 'application/vnd.dwolla.v1.hal+json',
    },
    timeout: 15000,
  })
  // Helm HELM-101 — token-bound clients are minted per-refresh (max ~hourly).
  // Instrumenting each is idempotent and microsecond-cheap.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(inst, `dwolla-client-${CONFIG.DWOLLA_ENV}`)
  } catch { /* skip */ }
  return inst
}

/**
 * Dwolla POST responses put the new resource URL in the Location header.
 * This helper extracts it — we store these URLs verbatim as stable refs.
 */
function extractLocation(headers: any): string {
  const loc = headers?.location || headers?.Location
  if (!loc) throw new Error('Dwolla response missing Location header')
  return String(loc)
}

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  firstName: string
  lastName: string
  email: string
  // We currently create "unverified" customers — $5K/wk ACH cap is fine for MVP.
  // "verified" customers need SSN + DOB + address; add when we exceed the cap.
  type?: 'unverified' | 'verified'
}

/**
 * Create a Dwolla customer. Returns the customer URL (stable ref for all
 * subsequent operations on this user). Store in DB on users.dwolla_customer_url.
 */
export async function createCustomer(input: CreateCustomerInput): Promise<string> {
  const c = await client()
  const res = await c.post('/customers', {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    type: input.type || 'unverified',
  })
  return extractLocation(res.headers)
}

// ─── FUNDING SOURCES ─────────────────────────────────────────────────────────

export interface FundingSource {
  url: string              // Stable ref
  name: string
  type: string             // 'bank' | 'balance'
  bankAccountType: string  // 'checking' | 'savings'
  status: 'unverified' | 'verified' | 'removed'
}

/**
 * Create a funding source for a customer using a Plaid processor_token.
 * This is the preferred path — Dwolla pulls routing/account directly from
 * Plaid, meaning our server never touches sensitive banking data.
 *
 * customerUrl = value from createCustomer(); processorToken from plaid-client.createProcessorToken
 */
export async function createFundingSource(
  customerUrl: string,
  processorToken: string,
  name: string = 'Linked Bank'
): Promise<string> {
  const c = await client()
  // customerUrl is absolute; axios baseURL is ignored when url starts with 'http'.
  const res = await c.post(`${customerUrl}/funding-sources`, {
    plaidToken: processorToken,
    name: name.slice(0, 50),  // Dwolla 50-char cap
  })
  return extractLocation(res.headers)
}

/**
 * Fetch funding source by URL — used to check .status before initiating a transfer.
 * A freshly-created Plaid-linked source is immediately verified (no micro-deposits).
 */
export async function getFundingSource(fundingSourceUrl: string): Promise<FundingSource> {
  const c = await client()
  const res = await c.get(fundingSourceUrl)
  return {
    url: res.data._links?.self?.href || fundingSourceUrl,
    name: res.data.name,
    type: res.data.type,
    bankAccountType: res.data.bankAccountType,
    status: res.data.status,
  }
}

// ─── TRANSFERS ───────────────────────────────────────────────────────────────

export interface TransferInput {
  sourceFundingSourceUrl: string
  destFundingSourceUrl: string
  amountUsd: number          // decimal USD — e.g. 100.00
  idempotencyKey: string     // prevents double-pull on retry
  metadata?: Record<string, string>  // e.g. { nuroTxId, userId }
}

/**
 * Initiate an ACH transfer. Returns transfer URL for status polling.
 * ACH is 3-5 business days to settle. Dwolla sandbox auto-settles in ~60s.
 *
 * CRITICAL: idempotencyKey MUST be unique per intended transfer. If the same
 * key is reused with identical payload, Dwolla returns the original transfer
 * instead of creating a new one (safe for retries). With different payload,
 * Dwolla 400s — which is what we want (catches programming bugs).
 */
export async function initiateTransfer(input: TransferInput): Promise<string> {
  const c = await client()
  const amountStr = input.amountUsd.toFixed(2)
  const res = await c.post(
    '/transfers',
    {
      _links: {
        source: { href: input.sourceFundingSourceUrl },
        destination: { href: input.destFundingSourceUrl },
      },
      amount: { currency: 'USD', value: amountStr },
      metadata: input.metadata || {},
    },
    { headers: { 'Idempotency-Key': input.idempotencyKey } }
  )
  return extractLocation(res.headers)
}

export interface TransferStatus {
  url: string
  status: 'pending' | 'processed' | 'failed' | 'cancelled' | 'reclaimed'
  amount: { currency: string; value: string }
  created: string
  // When status='failed', Dwolla exposes a _links.failure resource with the
  // ACH return code. We fetch lazily — scaffold returns status only.
}

/**
 * Fetch transfer status. Poll this after initiateTransfer until status
 * becomes 'processed' (success) or 'failed' / 'cancelled' / 'reclaimed' (bad).
 *
 * For production we should subscribe to Dwolla webhooks instead of polling —
 * scaffold uses polling to keep the first-cut flow simple.
 */
export async function getTransferStatus(transferUrl: string): Promise<TransferStatus> {
  const c = await client()
  const res = await c.get(transferUrl)
  return {
    url: res.data._links?.self?.href || transferUrl,
    status: res.data.status,
    amount: res.data.amount,
    created: res.data.created,
  }
}

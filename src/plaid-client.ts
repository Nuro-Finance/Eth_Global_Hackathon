// ─── PLAID CLIENT ───────────────────────────────────────────────────────────
// Thin axios wrapper around Plaid REST API. Used for Buy 2 (bank → crypto wallet)
// where the user links their bank via Plaid Link on the FE, and we exchange
// the public_token for a processor_token that Dwolla consumes as a funding source.
//
// Session 28 Phase 8 — scaffold only. All calls throw if PLAID_CLIENT_ID /
// PLAID_SECRET unset so misconfigured prod env fails loud instead of silently
// returning empty data. Flag-gated upstream by CONFIG.BUY_2_ENABLED.
//
// Flow for Buy 2:
//   1. Client calls /buy-from-bank/link-token → server calls createLinkToken → returns link_token
//   2. User completes Plaid Link flow on FE → FE gets public_token
//   3. Client posts public_token back → server calls exchangePublicToken → access_token stored
//   4. Server calls createProcessorToken(accessToken, accountId, 'dwolla') → returns dwolla processor_token
//   5. Dwolla createFundingSource(processor_token) → funding_source_url
//   6. Dwolla initiateTransfer(bank→nuro) → wait for settlement
//
// Why axios-direct (not `plaid` npm SDK):
//   • Keeps deps minimal — one fewer package to audit/update (Richard's stability rule)
//   • Mirrors existing issuers.ts pattern — consistent style across integrations
//   • Plaid REST is stable; SDK value-add is mostly TS types we can supply locally
//
// Ref: https://plaid.com/docs/api/ (stable since 2021)

import axios, { AxiosInstance } from 'axios'
import { CONFIG } from './config'

const PLAID_BASE_URLS: Record<typeof CONFIG.PLAID_ENV, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

function assertConfigured(): void {
  if (!CONFIG.PLAID_CLIENT_ID || !CONFIG.PLAID_SECRET) {
    throw new Error('Plaid credentials not configured (PLAID_CLIENT_ID / PLAID_SECRET)')
  }
}

let _client: AxiosInstance | null = null

function client(): AxiosInstance {
  if (_client) return _client
  _client = axios.create({
    baseURL: PLAID_BASE_URLS[CONFIG.PLAID_ENV],
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  })
  // Helm HELM-101 — observe outbound traffic. Observe-only unless
  // HELM_EGRESS_ENFORCE=on. All three Plaid envs (sandbox / development
  // / production) are on the default allowlist.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { instrumentAxios } = require('./helm')
    instrumentAxios(_client, `plaid-client-${CONFIG.PLAID_ENV}`)
  } catch { /* heimdall not initialized — skip */ }
  return _client
}

/**
 * Plaid auth envelope appended to every request. Keeps the client stateless
 * so rotating secrets mid-process picks up on next call.
 */
function authEnvelope() {
  return {
    client_id: CONFIG.PLAID_CLIENT_ID,
    secret: CONFIG.PLAID_SECRET,
  }
}

// ─── LINK TOKEN ──────────────────────────────────────────────────────────────

export interface CreateLinkTokenOpts {
  userId: string               // Nuro user id — passed as client_user_id for linking in Plaid dashboard
  userEmail?: string
  // Default products / country codes come from CONFIG; overridable per-call.
  products?: string[]
  countryCodes?: string[]
}

export interface LinkTokenResult {
  link_token: string
  expiration: string  // ISO — typically 4h
}

/**
 * Create a Plaid Link token the FE can use to initialize <PlaidLink>.
 * One-shot (expires ~4h). Cache briefly if you want to avoid hitting Plaid
 * on every page load, but don't persist — expired tokens 400 on the FE.
 */
export async function createLinkToken(opts: CreateLinkTokenOpts): Promise<LinkTokenResult> {
  assertConfigured()
  const { data } = await client().post('/link/token/create', {
    ...authEnvelope(),
    client_name: 'Nuro Finance',
    user: { client_user_id: opts.userId, email_address: opts.userEmail },
    products: opts.products || CONFIG.PLAID_PRODUCTS,
    country_codes: opts.countryCodes || CONFIG.PLAID_COUNTRY_CODES,
    language: 'en',
  })
  return { link_token: data.link_token, expiration: data.expiration }
}

// ─── PUBLIC TOKEN EXCHANGE ───────────────────────────────────────────────────

export interface ExchangeResult {
  access_token: string  // DO NOT log — long-lived, stored in DB per-user
  item_id: string       // Plaid's stable ref for the linked Item (bank)
}

/**
 * Exchange the short-lived public_token (from FE Plaid Link onSuccess callback)
 * for the long-lived access_token. Store access_token encrypted in DB keyed
 * by user_id — re-use for every Plaid call on that bank link.
 */
export async function exchangePublicToken(publicToken: string): Promise<ExchangeResult> {
  assertConfigured()
  const { data } = await client().post('/item/public_token/exchange', {
    ...authEnvelope(),
    public_token: publicToken,
  })
  return { access_token: data.access_token, item_id: data.item_id }
}

// ─── PROCESSOR TOKEN (Dwolla) ────────────────────────────────────────────────

export interface ProcessorTokenResult {
  processor_token: string  // consumed by Dwolla createFundingSource — one-time use
}

/**
 * Mint a one-time processor_token scoped to `dwolla` that Dwolla consumes to
 * create a funding source without us ever seeing raw routing/account numbers.
 *
 * accountId = Plaid's account id (from /accounts/get) — the user's chosen bank
 * account at the linked Item. We currently pick the first depository account
 * automatically; future UX should let the user pick if they have multiple.
 */
export async function createProcessorToken(
  accessToken: string,
  accountId: string,
  processor: 'dwolla' = 'dwolla'
): Promise<ProcessorTokenResult> {
  assertConfigured()
  const { data } = await client().post('/processor/token/create', {
    ...authEnvelope(),
    access_token: accessToken,
    account_id: accountId,
    processor,
  })
  return { processor_token: data.processor_token }
}

// ─── ACCOUNT METADATA ────────────────────────────────────────────────────────

export interface PlaidAccount {
  account_id: string
  name: string
  mask: string | null      // last 4 of account number
  subtype: string | null   // 'checking' | 'savings' | etc
  type: string             // 'depository' | 'credit' | 'loan' | ...
}

/**
 * Fetch linked accounts for a user. Used to let them pick which account
 * to use for Buy 2 if they linked a bank with multiple accounts.
 */
export async function getAccounts(accessToken: string): Promise<PlaidAccount[]> {
  assertConfigured()
  const { data } = await client().post('/accounts/get', {
    ...authEnvelope(),
    access_token: accessToken,
  })
  return (data.accounts || []).map((a: any) => ({
    account_id: a.account_id,
    name: a.name,
    mask: a.mask,
    subtype: a.subtype,
    type: a.type,
  }))
}

// ─── BALANCES ────────────────────────────────────────────────────────────────
//
// /accounts/balance/get returns account metadata + a freshly-fetched balance
// for each account. Unlike /accounts/get (cached at Plaid), balance/get
// invalidates Plaid's cache and pulls live from the institution. Cost: ~1.5s
// median latency. We use balance/get on the dashboard read path so the user
// always sees a fresh number.
//
// Returned row shape mirrors PlaidAccount + adds the balances. Callers that
// only need metadata (Buy-2 funding-source picker) should keep using
// getAccounts().

export interface PlaidAccountWithBalance extends PlaidAccount {
  official_name: string | null
  current_balance: number | null
  available_balance: number | null
  iso_currency_code: string | null
}

export async function getAccountsWithBalance(
  accessToken: string,
): Promise<PlaidAccountWithBalance[]> {
  assertConfigured()
  const { data } = await client().post('/accounts/balance/get', {
    ...authEnvelope(),
    access_token: accessToken,
  })
  return (data.accounts || []).map((a: any) => ({
    account_id: a.account_id,
    name: a.name,
    official_name: a.official_name ?? null,
    mask: a.mask,
    subtype: a.subtype,
    type: a.type,
    current_balance: a.balances?.current ?? null,
    available_balance: a.balances?.available ?? null,
    iso_currency_code: a.balances?.iso_currency_code ?? null,
  }))
}

// ─── IDENTITY (Name match vs Dwolla customer) ────────────────────────────────

export interface PlaidIdentityOwner {
  names: string[]
  emails: { data: string; primary: boolean }[]
}

/**
 * Identity returns account-holder names, emails, phones. We match against
 * Dwolla customer's legal name to block trivial "link someone else's bank"
 * fraud. Full name match is strict; we may relax to surname-only for MVP.
 */
export async function getIdentity(accessToken: string): Promise<PlaidIdentityOwner[]> {
  assertConfigured()
  const { data } = await client().post('/identity/get', {
    ...authEnvelope(),
    access_token: accessToken,
  })
  // Identity is an array of accounts; each account has owners[].
  const owners: PlaidIdentityOwner[] = []
  for (const acct of data.accounts || []) {
    for (const o of acct.owners || []) {
      owners.push({ names: o.names || [], emails: o.emails || [] })
    }
  }
  return owners
}

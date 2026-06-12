// ─────────────────────────────────────────────────────────────────────────────
// HELM-101 EGRESS OBSERVER — outbound HTTP host allowlist
//
// Session 30 H1 — observe-mode only. Install axios interceptors that log
// every outbound request's destination host. When HELM_EGRESS_ENFORCE=on
// is set in env, convert the observer into a hard-blocking gate for hosts
// not on the allowlist.
//
// Observe-first rollout is deliberate: we don't know our complete outbound
// surface yet (Jupiter, Hyperliquid, 0x, Alchemy, Infura, Circle CCTP,
// SD3, Privy, Plaid, Dwolla, GoPlus, CoinGecko, Moltbook, 1inch, ...).
// Blocking on day-one would break production. Observe phase catches the
// real surface, then we move to enforcement with a curated allowlist.
//
// Each non-allowlisted call fires a HELM-101 event at severity=critical
// but action='log-only' (downgraded from the catalog's 'block' default).
// When enforcement flips on, the override drops and the rule's native
// action takes over.

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { logHelmEvent } from './core'

// Baseline allowlist — every host we KNOW we call from the backend as of
// S31 H1 plumbing pass. When enforcement mode flips on, hosts not in this
// set trigger the block action. Anything observed in the wild but not
// here gets caught during the observe phase and added in a follow-up.
//
// Discovery method (S31 morning): grep for axios.create / axios.get /
// axios.post / fetch('https://...') across src/, then audit each
// destination. Coverage extended from ~25 hosts (S30) to ~50+ (S31).
const DEFAULT_EGRESS_ALLOWLIST = new Set<string>([
  // ── Quote aggregators / DEX APIs ──
  'api.hyperliquid.xyz',
  'app.hyperliquid.xyz',
  'lite-api.jup.ag',
  'quote-api.jup.ag',        // legacy; harmless to keep
  'api.jup.ag',              // paid tier
  'api.0x.org',
  'api.1inch.dev',

  // ── Banking / fiat rails ──
  'api.plaid.com',
  'sandbox.plaid.com',
  'development.plaid.com',
  'production.plaid.com',
  'api.dwolla.com',
  'api-sandbox.dwolla.com',
  'sandbox.dwolla.com',
  'rocket.sd3.gg',           // SD3 onboarding API
  'rocket.sd3.gg',           // SD3 issuer/card API (CONFIG.ISSUER_API_BASE)
  'api.stripe.com',
  'cardmemberportal.com',    // issuer-side webhook target

  // ── Cross-chain / Circle ──
  'api.circle.com',
  'iris-api.circle.com',     // CCTP attestation service

  // ── Identity / auth ──
  'oauth2.googleapis.com',
  'www.googleapis.com',
  'accounts.google.com',
  'api.privy.io',
  'auth.privy.io',

  // ── Token data / risk ──
  'api.gopluslabs.io',
  'api.coingecko.com',
  'gamma-api.polymarket.com',
  'clob.polymarket.com',

  // ── Sports / events feeds ──
  'www.thesportsdb.com',
  'thesportsdb.com',

  // ── Growth-agent surface ──
  'moltbook.com',
  'www.moltbook.com',
  'api.moltbook.com',
  'api.heygen.com',          // avatar video gen for TikTok
  'open.tiktokapis.com',     // TikTok publishing
  'api.telegram.org',
  'api.twitter.com',
  'api.x.com',
  'oauth2.googleapis.com',
  'www.googleapis.com',      // YouTube data API
  'youtube.googleapis.com',

  // ── Code/infra ──
  'api.github.com',

  // ── External doc-monitor scanners (S31 H2 daily cron) ──
  'docs.layerzero.network',
  'developers.circle.com',

  // ── DeFi-yield aggregator (S31 H2 — HyperSwap LP pool data) ──
  'api.llama.fi',
  'yields.llama.fi',
  'stats-data.hyperliquid.xyz',

  // ── Chain RPCs (canonical public fallbacks; real RPCs land via env at
  // boot and dynamically populate via initHelm) ──
  'api.mainnet-beta.solana.com',
  'mainnet.base.org',
  'arb1.arbitrum.io',
  'mainnet.optimism.io',
  'polygon-rpc.com',
  'eth.llamarpc.com',
  'cloudflare-eth.com',
  'rpc.ankr.com',

  // ── Wallet portfolio / on-chain data ──
  'eth-mainnet.g.alchemy.com',
  'arb-mainnet.g.alchemy.com',
  'base-mainnet.g.alchemy.com',
  'polygon-mainnet.g.alchemy.com',
  'opt-mainnet.g.alchemy.com',
  'solana-mainnet.g.alchemy.com',
])

// Mutable at runtime — init() adds env-configured RPC hosts.
const _egressAllowlist = new Set<string>(DEFAULT_EGRESS_ALLOWLIST)

/** Extend the allowlist with additional hosts. Called at boot to pull env-
 *  configured RPC URLs into the set so our own chain RPCs don't trip. */
export function addEgressAllowlist(hosts: string[]): void {
  for (const h of hosts) {
    if (h && typeof h === 'string') _egressAllowlist.add(h.toLowerCase())
  }
}

// Runtime-mutable override so operators can flip enforce mode from the
// admin panel without a redeploy. null = follow env, true/false = override.
let _runtimeEnforceOverride: boolean | null = null

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_EGRESS_ENFORCE === 'on'
}

/** Set runtime override. Pass null to revert to env-driven behavior. */
export function setEgressEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

/** Effective egress mode, accounting for runtime override + env. */
export function getEgressMode(): { mode: 'enforce' | 'observe'; source: 'runtime-override' | 'env' } {
  if (_runtimeEnforceOverride !== null) {
    return { mode: _runtimeEnforceOverride ? 'enforce' : 'observe', source: 'runtime-override' }
  }
  return {
    mode: process.env.HELM_EGRESS_ENFORCE === 'on' ? 'enforce' : 'observe',
    source: 'env',
  }
}

function extractHost(url: string | undefined, baseURL: string | undefined): string | null {
  try {
    const raw = url || ''
    if (!raw) return baseURL ? new URL(baseURL).host.toLowerCase() : null
    // Axios supports relative URLs when baseURL is set. Join them.
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).host.toLowerCase()
    }
    if (baseURL) return new URL(baseURL).host.toLowerCase()
    return null
  } catch {
    return null
  }
}

let _installed = false

/**
 * Install HELM-101 on the given axios instance. Called per-client at module
 * init (jupiter-client, oneinch-client, issuers, plaid-client, dwolla-client,
 * hyperliquid-client). Idempotent per-instance.
 */
export function installEgressObserver(axiosInstance: AxiosInstance, source: string): void {
  axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const host = extractHost(config.url, config.baseURL)
    if (!host) return config // opaque — can't enforce without a host
    if (_egressAllowlist.has(host)) return config

    // Non-allowlisted host.
    const subject = `${source} → ${host}`
    const context = {
      host,
      method: (config.method || 'GET').toUpperCase(),
      path: config.url?.slice(0, 100),
      source,
    }

    if (enforceModeOn()) {
      // HELM-101 full action: block.
      void logHelmEvent({
        ruleId: 'HELM-101',
        subject,
        context: { ...context, action: 'block' },
      })
      throw new Error(`[helm HELM-101] blocked outbound request to ${host} (not on allowlist)`)
    } else {
      // Observe mode: log-only, request proceeds.
      void logHelmEvent({
        ruleId: 'HELM-101',
        subject,
        context: { ...context, action: 'log-only', note: 'observe-mode' },
        actionOverride: 'log-only',
      })
    }
    return config
  })
  _installed = true
}

/** Snapshot of the current allowlist for admin UI display. */
export function getEgressAllowlist(): string[] {
  return Array.from(_egressAllowlist).sort()
}

export function isEgressObserverInstalled(): boolean {
  return _installed
}

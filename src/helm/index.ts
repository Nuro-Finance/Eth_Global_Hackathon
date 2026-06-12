// ─────────────────────────────────────────────────────────────────────────────
// HELM INIT — call initHelm() once at boot from src/index.ts.
//
// Installs:
//   - HELM-108 log-scanner (active) — secret-in-log redaction
//   - HELM-101 egress observer (observe-mode) — outbound HTTP tracking
//
// Scaffold-only:
//   - HELM-105 tx-cap — wired per call-site in execution-dispatch.ts later
//   - HELM-205 mass-file-write — will need fs hook when agents run locally
//
// Env switches:
//   HELM_LOG_SCAN=off           → skip log-scanner installation
//   HELM_EGRESS_ENFORCE=on      → promote HELM-101 from observe to block

import { installHelmLogScanner } from './log-scanner'
import { addEgressAllowlist, installEgressObserver } from './egress'
import axios, { type AxiosInstance } from 'axios'

export * from './core'
export * from './egress'
export * from './tx-cap'
export * from './fs-guard'
// S31 H2 hardening pass — five new TS-side defenders
export * from './compound-detector'
export * from './mass-write-counter'
export * from './reasoning-detectors'
export * from './merkle-manifest'
export * from './watchdog'

let _initialized = false

export function initHelm(): void {
  if (_initialized) return
  _initialized = true

  // 1. HELM-108 live enforcement (redaction)
  if (process.env.HELM_LOG_SCAN !== 'off') {
    installHelmLogScanner()
  } else {
    console.log('[helm] HELM-108 log-scanner DISABLED (HELM_LOG_SCAN=off)')
  }

  // 2. Dynamically add configured RPC hosts to the egress allowlist so our
  //    own infrastructure never trips the observer. Pulls from the usual
  //    env soup; extra hosts can be added by chain operators without code
  //    changes.
  const rpcHosts: string[] = []
  const rpcEnvKeys = Object.keys(process.env).filter(
    (k) => k.startsWith('RPC_URL_') || k === 'SOLANA_RPC_URL',
  )
  for (const key of rpcEnvKeys) {
    const url = process.env[key]
    if (!url) continue
    try {
      rpcHosts.push(new URL(url).host.toLowerCase())
    } catch { /* skip malformed */ }
  }
  if (rpcHosts.length > 0) {
    addEgressAllowlist(rpcHosts)
    console.log(`[helm] egress allowlist extended with ${rpcHosts.length} RPC host(s) from env`)
  }

  // 3. Catch-all: instrument the GLOBAL axios singleton. Per-instance clients
  //    (jupiter, oneinch, hyperliquid, plaid, dwolla, issuers, moltbook, ...)
  //    are still individually instrumented for per-source attribution, but
  //    the long tail of one-off `axios.get(...)`/`axios.post(...)` calls in
  //    growth-agent skills, market-feeds, swap, token-audit, bridge, etc.
  //    flows through the default singleton. Hooking it here means we don't
  //    have to chase every file that touches the network — the request goes
  //    through this interceptor unless the caller explicitly opted out by
  //    creating a fresh `axios.create()` instance (and those are already
  //    individually instrumented).
  installEgressObserver(axios as unknown as AxiosInstance, 'global-axios')

  const mode = process.env.HELM_EGRESS_ENFORCE === 'on' ? 'ENFORCE' : 'observe'
  console.log(`[helm] HELM-101 egress observer armed — mode=${mode}`)

  // 4. S31 H2 hardening pass — log armed defenders so admin sees what's
  //    running. The compound-detector + watchdog crons are wired separately
  //    in src/index.ts; this print is just the boot signal.
  const heimdallEnvFlags = {
    HELM_501_compound: process.env.HELM_GJALLARHORN_ENFORCE === 'on' ? 'ENFORCE' : 'observe',
    HELM_205_mass_write: process.env.HELM_MASS_WRITE_ENFORCE === 'on' ? 'ENFORCE' : 'observe',
    HELM_401_403_reasoning: process.env.HELM_REASONING_ENFORCE === 'on' ? 'ENFORCE' : 'observe',
    HELM_208_merkle: process.env.HELM_MERKLE_ENFORCE === 'on' ? 'ENFORCE' : 'observe',
    HELM_105_txcap: process.env.HELM_TXCAP_ENFORCE === 'on' ? 'ENFORCE' : 'observe',
    HELM_201_fs_guard: process.env.HELM_FS_GUARD_ENFORCE === 'on' ? 'ENFORCE' : 'observe',
  }
  console.log(`[helm] hardening defenders armed: ${JSON.stringify(heimdallEnvFlags)}`)

  // 5. Run boot-time Merkle integrity check. Non-blocking — runs async so
  //    boot doesn't wait on disk I/O for the manifest. In enforce mode,
  //    a mismatch will throw and PM2 will restart-loop (the desired behavior:
  //    we WANT to surface tampering loudly).
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { runBootIntegrityCheck } = require('./merkle-manifest')
      await runBootIntegrityCheck()
    } catch (err: any) {
      // Re-throw only in enforce mode — the inner code already logged
      // the event. Observe mode swallows so boot proceeds.
      if (process.env.HELM_MERKLE_ENFORCE === 'on') {
        console.error('[helm:merkle] boot integrity check failed in enforce mode:', err?.message)
        // Schedule process exit so PM2 visibly restart-loops; don't kill
        // synchronously since we're inside an async IIFE that's swallowed.
        setTimeout(() => process.exit(1), 100)
      }
    }
  })()

  // 6. HELM-105B — boot-time scan for PATCH/PUT/POST authoritative-monetary-
  //    field acceptance. Closes the rule-catalog gap surfaced by the S32
  //    balance-spoof exploit. observe-mode by default; HELM_105B_ENFORCE=on
  //    promotes to PM2 restart-loop on violation.
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { runHelm105BBootCheck } = require('./helm-105b-scanner')
      await runHelm105BBootCheck()
    } catch (err: any) {
      if (process.env.HELM_105B_ENFORCE === 'on') {
        console.error('[helm:HELM-105B] enforce-mode boot rejection:', err?.message?.slice(0, 200))
        setTimeout(() => process.exit(1), 100)
      }
    }
  })()

  const heim105bMode = process.env.HELM_105B_ENFORCE === 'on' ? 'ENFORCE' : 'observe'
  console.log(`[helm] HELM-105B route scanner armed — mode=${heim105bMode}`)

  // 7. HELM-202 — Decision Journal append-only enforcement (boot scanner).
  //    Pre-commit hook in .husky/pre-commit blocks the common case at
  //    write time. This boot scanner detects mods that bypassed via
  //    --no-verify or non-husky environments. observe-mode by default;
  //    HELM_202_ENFORCE=on promotes to PM2 restart-loop.
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { runHelm202BootCheck } = require('./helm-202-scanner')
      await runHelm202BootCheck()
    } catch (err: any) {
      if (process.env.HELM_202_ENFORCE === 'on') {
        console.error('[helm:HELM-202] enforce-mode boot rejection:', err?.message?.slice(0, 200))
        setTimeout(() => process.exit(1), 100)
      }
    }
  })()
  const heim202Mode = process.env.HELM_202_ENFORCE === 'on' ? 'ENFORCE' : 'observe'
  console.log(`[helm] HELM-202 DJ append-only scanner armed — mode=${heim202Mode}`)
}

/**
 * Wire the egress observer onto an axios client. Call this from every
 * module that creates a long-lived axios instance for outbound HTTP.
 * Idempotent per instance — calling twice on the same instance just
 * double-registers the interceptor (harmless; no-op on allowlisted calls).
 */
export function instrumentAxios(client: AxiosInstance, source: string): void {
  installEgressObserver(client, source)
}

// ─── LAYERZERO RESERVE RECONCILIATION MONITOR ──────────────────────────────
//
// Session 28 Kelp-hardening — response to 2026-04-18 Kelp DAO exploit ($292M
// drained via forged LayerZero message against a vanilla OFT receive handler).
//
// What this watches:
//   The Nuro OFTAdapter on Arbitrum holds real USDC as backing reserve for
//   wrapped USDC (MyOFT) deployed on 5 spoke chains (zkSync, Scroll, Celo,
//   Gnosis, BSC). The invariant that MUST hold at all times:
//
//     balanceOf(OFTAdapter on Arbitrum) >= sum of totalSupply(MyOFT on each spoke)
//
//   If this breaks, someone has minted synthetic USDC on a spoke without
//   corresponding escrow on Arbitrum — exactly the Kelp attack signature.
//   The monitor's job: detect this drift FAST and raise an alert, well
//   before the attacker can bridge the unbacked synthetic back to Arbitrum
//   and drain the escrow.
//
// How it alerts:
//   1. console.error — PM2 captures to log, visible in `pm2 logs 4`
//   2. execution_log row — admin console surfaces it
//   3. reportError to the error-reporter pipeline (existing infra)
//
// It does NOT auto-pause. Auto-pause on a monitoring blip that's actually
// a RPC stall would be worse than a 46-minute manual pause. Alert-then-
// -operator-decides matches the Kelp operator pattern that DID work
// (46min manual pause saved the second $100M wave).
//
// Invocation:
//   pollLzReserveReconciliation(db) — called from scheduler every 5 min
//   OR from admin UI on-demand via /admin/api/lz/reconcile

import { ethers } from 'ethers'
import { Pool } from 'pg'
import { CONFIG } from './config'
import { reportError } from './error-reporter'

// Chain metadata for the 5 LayerZero spokes + Arbitrum hub.
// Addresses match layerzero.config.ts + src/bridge.ts LZ_ADAPTER map.
interface LzChain {
  chainId: number
  name: string
  rpcUrl: string
  /** OFTAdapter on Arbitrum (hub) OR MyOFT on spoke. Same address for
   *  all 4 of the peer-mesh chains we deployed same-salt; BSC differs. */
  contract: string
  /** True if this is the hub (holds USDC reserve). False for spokes
   *  (which mint synthetic MyOFT tokens). */
  isHub: boolean
  /** USDC address on this chain — only used on the hub to read adapter balance. */
  usdcAddress?: string
}

const LZ_CHAINS: LzChain[] = [
  {
    chainId: 42161,
    name: 'Arbitrum',
    rpcUrl: CONFIG.RPC_URL_ARBITRUM,
    contract: '0xd58C1412e50fF00212770B170D86e2387D2d2b18',
    isHub: true,
    usdcAddress: CONFIG.USDC_ARBITRUM,
  },
  {
    chainId: 324,
    name: 'zkSync Era',
    rpcUrl: process.env.RPC_URL_ZKSYNC || '',
    contract: '0xA150EC8B718C22E12036f916d90FF72af14B3E96',
    isHub: false,
  },
  {
    chainId: 534352,
    name: 'Scroll',
    rpcUrl: process.env.RPC_URL_SCROLL || '',
    contract: '0xA150EC8B718C22E12036f916d90FF72af14B3E96',
    isHub: false,
  },
  {
    chainId: 42220,
    name: 'Celo',
    rpcUrl: process.env.RPC_URL_CELO || 'https://forno.celo.org',
    contract: '0xA150EC8B718C22E12036f916d90FF72af14B3E96',
    isHub: false,
  },
  {
    chainId: 100,
    name: 'Gnosis',
    rpcUrl: process.env.RPC_URL_GNOSIS || 'https://rpc.gnosischain.com',
    contract: '0xA150EC8B718C22E12036f916d90FF72af14B3E96',
    isHub: false,
  },
  {
    chainId: 56,
    name: 'BSC',
    rpcUrl: process.env.RPC_URL_BSC || 'https://bsc-dataseed.binance.org',
    contract: '0xce4c2270890267aC860fdc72b6946359d0898675',
    isHub: false,
  },
]

// Minimal ABIs — we only need two read calls.
const ERC20_BALANCE_ABI = [
  'function balanceOf(address) view returns (uint256)',
]
const MYOFT_TOTALSUPPLY_ABI = [
  'function totalSupply() view returns (uint256)',
]

export interface LzReserveSnapshot {
  timestamp: string
  hubBalanceUsdc: number            // USDC held by adapter on Arbitrum (human units)
  spokeSupplyBySpoke: Record<string, number>  // chain name → MyOFT supply (human units)
  totalSpokeSupply: number          // sum across all spokes (human units)
  drift: number                     // hubBalance - totalSpokeSupply (positive = healthy surplus; negative = DEFICIT, ATTACK SIGNAL)
  status: 'healthy' | 'drift_warning' | 'drift_critical' | 'rpc_failure'
  rpcFailures: string[]             // chain names that failed to read
}

// Drift tolerances — USDC (not wei).
// Small positive drift is normal (fees accumulate in the adapter). Small
// negative drift triggers warning (could be in-flight unbridged send).
// Anything beyond CRITICAL_THRESHOLD is the attack signal.
const DRIFT_WARNING_THRESHOLD_USD = -10       // -$10 (dust, could be precision)
const DRIFT_CRITICAL_THRESHOLD_USD = -100     // -$100 — wake-the-operator threshold

// S35 M11 Day-3: per-chain log-rate-limiter. The 5 spoke chains (zkSync,
// Scroll, Celo, Gnosis, BSC) currently revert on totalSupply() because the
// CREATE2 mesh deployed MyOFTAdapter (no totalSupply) instead of MyOFT
// (the synthetic with totalSupply). Architectural gap — MyOFT not yet
// deployed to those chains. Until then, the monitor would spam
// "spoke X read failed" every 5 min × 5 chains = ~1500 log lines/day.
// This map suppresses repeats: log once per chain per process, plus a
// summary boot warning, plus optional periodic resurfacing every 4h so
// the issue doesn't drop off operational radar entirely.
const _spokeFailureLoggedAt: Map<string, number> = new Map()
const SPOKE_FAILURE_RESURFACE_MS = 4 * 60 * 60 * 1000  // 4h

/**
 * Read USDC balance of the OFTAdapter on Arbitrum.
 * Returns human-units (USDC has 6 decimals).
 */
async function readHubBalance(chain: LzChain): Promise<number> {
  if (!chain.usdcAddress) throw new Error('hub chain missing usdcAddress')
  const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl)
  const usdc = new ethers.Contract(chain.usdcAddress, ERC20_BALANCE_ABI, provider)
  const balanceRaw = await usdc.balanceOf(chain.contract)
  return Number(ethers.utils.formatUnits(balanceRaw, 6))
}

/**
 * Read totalSupply() of MyOFT on a spoke chain.
 * Returns human-units (assumes same 6 decimals as underlying USDC on hub).
 */
async function readSpokeSupply(chain: LzChain): Promise<number> {
  const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl)
  const myoft = new ethers.Contract(chain.contract, MYOFT_TOTALSUPPLY_ABI, provider)
  const supplyRaw = await myoft.totalSupply()
  return Number(ethers.utils.formatUnits(supplyRaw, 6))
}

/**
 * Main reconciliation pass. Reads hub balance + all spoke supplies,
 * computes drift, emits alerts on threshold breach, writes an audit row.
 *
 * Returns the snapshot for callers that want to surface it (admin UI).
 */
export async function pollLzReserveReconciliation(db: Pool): Promise<LzReserveSnapshot> {
  const snapshot: LzReserveSnapshot = {
    timestamp: new Date().toISOString(),
    hubBalanceUsdc: 0,
    spokeSupplyBySpoke: {},
    totalSpokeSupply: 0,
    drift: 0,
    status: 'healthy',
    rpcFailures: [],
  }

  // --- 1. Read hub balance ---
  const hub = LZ_CHAINS.find((c) => c.isHub)
  if (!hub) {
    // Shouldn't happen unless config drift. Bail fast + loud.
    snapshot.status = 'rpc_failure'
    snapshot.rpcFailures.push('hub_chain_missing')
    return snapshot
  }
  try {
    snapshot.hubBalanceUsdc = await readHubBalance(hub)
  } catch (err: any) {
    console.warn(`[lz-monitor] hub balance read failed: ${err.message?.slice(0, 120)}`)
    snapshot.rpcFailures.push(hub.name)
    snapshot.status = 'rpc_failure'
    // Early return — can't compute drift without hub balance
    return snapshot
  }

  // --- 2. Read spoke supplies in parallel (with individual error isolation) ---
  const spokes = LZ_CHAINS.filter((c) => !c.isHub)
  const spokeResults = await Promise.allSettled(
    spokes.map(async (c) => ({ chain: c, supply: await readSpokeSupply(c) }))
  )
  for (let i = 0; i < spokeResults.length; i++) {
    const r = spokeResults[i]
    const spoke = spokes[i]
    if (r.status === 'fulfilled') {
      snapshot.spokeSupplyBySpoke[spoke.name] = r.value.supply
      snapshot.totalSpokeSupply += r.value.supply
      // Successful read clears any prior failure stamp for this chain.
      _spokeFailureLoggedAt.delete(spoke.name)
    } else {
      // Rate-limited logging — once per chain at boot + every 4h after.
      // The error is structurally fixed-state (MyOFT not deployed yet on
      // these chains), so polling it every 5 min produces zero new info
      // and ~1500 log lines/day of pure noise.
      const now = Date.now()
      const lastLogged = _spokeFailureLoggedAt.get(spoke.name) ?? 0
      if (now - lastLogged > SPOKE_FAILURE_RESURFACE_MS) {
        console.warn(`[lz-monitor] spoke ${spoke.name} read failed: ${String(r.reason).slice(0, 120)} (rate-limited; will resurface in 4h)`)
        _spokeFailureLoggedAt.set(spoke.name, now)
      }
      snapshot.rpcFailures.push(spoke.name)
    }
  }

  // If ANY spoke failed, we can't compute canonical drift — degrade gracefully.
  // Still write the partial snapshot so the admin UI shows what we know.
  if (snapshot.rpcFailures.length > 0) {
    snapshot.status = 'rpc_failure'
  }

  // --- 3. Compute drift ---
  snapshot.drift = snapshot.hubBalanceUsdc - snapshot.totalSpokeSupply

  if (snapshot.status !== 'rpc_failure') {
    if (snapshot.drift < DRIFT_CRITICAL_THRESHOLD_USD) {
      snapshot.status = 'drift_critical'
    } else if (snapshot.drift < DRIFT_WARNING_THRESHOLD_USD) {
      snapshot.status = 'drift_warning'
    } else {
      snapshot.status = 'healthy'
    }
  }

  // --- 4. Alert on drift ---
  if (snapshot.status === 'drift_critical') {
    const detail = `CRITICAL: LZ bridge reserve drift ${snapshot.drift.toFixed(2)} USDC. ` +
      `Hub balance: ${snapshot.hubBalanceUsdc.toFixed(2)}. ` +
      `Spoke supplies: ${JSON.stringify(snapshot.spokeSupplyBySpoke)}. ` +
      `Suggests a forged/anomalous mint on a spoke OR an unauthorized withdrawal from hub. ` +
      `ACTION: pause MyOFTAdapter via setPaused(true) on Arbitrum IMMEDIATELY.`
    console.error(`[lz-monitor] ${detail}`)
    await reportError('bridge', 'lz_reserve_drift_critical', 'lz-bridge', detail, new Error('lz_reserve_drift_critical'))
  } else if (snapshot.status === 'drift_warning') {
    console.warn(`[lz-monitor] WARNING drift ${snapshot.drift.toFixed(2)} USDC — below $${-DRIFT_WARNING_THRESHOLD_USD} threshold`)
  }

  // --- 5. Audit row (every poll, regardless of status — trend visibility) ---
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'lz_bridge', 'reserve_reconciliation', 'reconcile', $1, $2, now())`,
    [
      snapshot.status === 'healthy' ? 'success' : snapshot.status === 'rpc_failure' ? 'skipped' : 'failed',
      `hub=${snapshot.hubBalanceUsdc.toFixed(2)} total_spoke=${snapshot.totalSpokeSupply.toFixed(2)} drift=${snapshot.drift.toFixed(2)} status=${snapshot.status} rpc_failures=[${snapshot.rpcFailures.join(',')}]`,
    ]
  ).catch((e: any) => console.warn('[lz-monitor] audit log insert failed:', e.message?.slice(0, 80)))

  return snapshot
}

/**
 * Convenience for on-demand admin-UI invocation.
 * Returns { ok, snapshot, durationMs }.
 */
export async function runLzReconcileOnce(db: Pool): Promise<{
  ok: boolean
  snapshot: LzReserveSnapshot
  durationMs: number
}> {
  const start = Date.now()
  const snapshot = await pollLzReserveReconciliation(db)
  return {
    ok: snapshot.status === 'healthy',
    snapshot,
    durationMs: Date.now() - start,
  }
}

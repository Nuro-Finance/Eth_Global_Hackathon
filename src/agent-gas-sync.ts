// ─────────────────────────────────────────────────────────────────────────────
// AGENT GAS BALANCE SYNC — hourly on-chain refresh (S32)
//
// Refreshes agent_gas_balances rows with on-chain provider.getBalance()
// data + USD conversion via native-price.ts. Drives the Nuro POV "gas
// across chains" view + ops alerts when a chain dips under
// low_threshold_usd.
//
// Schema (migration 037):
// agent_gas_balances(agent_id, chain_id, wallet_address,
// balance_native [wei], balance_usd, last_synced_at,
// low_threshold_usd)
//
// Cron pattern matches existing reputation / hl-sync crons:
// - Pull rows older than 1h (bounded by LIMIT)
// - Per-chain provider cached within the cycle
// - Per-row failure isolated; cycle continues
// - USD pricing best-effort (null on price-feed outage)
//
// Wired in src/index.ts. Disable with AGENT_GAS_SYNC_OFF=true.
// ─────────────────────────────────────────────────────────────────────────────

import { ethers } from 'ethers'
import type { Pool } from 'pg'
import { RPC_URLS } from './bridge'
import { nativeUsdPrice } from './native-price'

interface SyncRow {
  agent_id: string
  chain_id: number
  wallet_address: string
}

export async function runGasBalanceSyncCycle(db: Pool): Promise<{
  scanned: number
  refreshed: number
  failed: number
  lowAlertCount: number
}> {
  let scanned = 0
  let refreshed = 0
  let failed = 0
  let lowAlertCount = 0

  try {
 // Pull rows whose last_synced_at is older than 1 hour. Cap at 200 per
 // cycle so a backlog doesn't stall the cron — next pass catches the
 // rest.
    const due = await db.query<SyncRow>(
      `SELECT agent_id, chain_id, wallet_address
       FROM agent_gas_balances
       WHERE last_synced_at < now() - interval '1 hour'
       ORDER BY last_synced_at ASC
       LIMIT 200`,
    )
    scanned = due.rows.length

 // Cache providers per chain to avoid creating one per row.
    const providers = new Map<number, ethers.providers.JsonRpcProvider>()

    for (const row of due.rows) {
      try {
        const rpcUrl = RPC_URLS[row.chain_id]
        if (!rpcUrl) {
 // Unsupported chain — skip without failure-noise. Schema allows
 // any chain_id; we only sync ones we have an RPC for.
          continue
        }
        let provider = providers.get(row.chain_id)
        if (!provider) {
          provider = new ethers.providers.JsonRpcProvider(rpcUrl)
          providers.set(row.chain_id, provider)
        }

        const wei = await provider.getBalance(row.wallet_address)
        const weiStr = wei.toString()

 // USD conversion best-effort. nativeUsdPrice() returns null on
 // price-feed outage; we store null and let the FE degrade.
        let balanceUsd: number | null = null
        try {
          const priceUsd = await nativeUsdPrice(row.chain_id)
          if (priceUsd != null && Number.isFinite(priceUsd) && priceUsd > 0) {
            const ethValue = Number(ethers.utils.formatEther(wei))
            balanceUsd = +(ethValue * priceUsd).toFixed(2)
          }
        } catch {
 /* swallow — leave balance_usd null */
        }

        const updRes = await db.query(
          `UPDATE agent_gas_balances
           SET balance_native = $1, balance_usd = $2, last_synced_at = now()
           WHERE agent_id = $3 AND chain_id = $4
           RETURNING low_threshold_usd::text`,
          [weiStr, balanceUsd, row.agent_id, row.chain_id],
        )
        refreshed++

 // Track when we land below the configured threshold. Doesn't
 // alert directly — surfaced via the snapshot view. Future
 // enhancement: fire to the bus on threshold-cross (matches the
 // budget-low pattern from S32).
        const lowThr = updRes.rows[0]?.low_threshold_usd
        if (
          balanceUsd != null &&
          lowThr != null &&
          balanceUsd < Number(lowThr)
        ) {
          lowAlertCount++
        }
      } catch (err: any) {
        failed++
        console.warn(
          `[gas-sync] ${row.agent_id} chain ${row.chain_id}: ${err?.message?.slice(0, 100)}`,
        )
      }
    }
  } catch (err: any) {
    console.error('[gas-sync] cycle error:', err?.message?.slice(0, 120))
  }

  return { scanned, refreshed, failed, lowAlertCount }
}

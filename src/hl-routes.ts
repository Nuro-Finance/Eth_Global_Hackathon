// ─────────────────────────────────────────────────────────────────────────────
// HL ROUTES — Hyperliquid vault endpoints (Phase 1 + Phase 1.2)
//
// S31 H2: read-only slice (vaults list + positions list).
// S32 (Phase 1.2): deposit / withdraw endpoints + hourly position-sync cron.
//
// Mounts on the same Express router as nuro-routes. Path prefix `/api`.
//
// Endpoints:
//   GET  /api/hl/vaults    — list approved vaults (public)
//   GET  /api/hl/positions — caller's positions (authed)
//   POST /api/hl/deposit   — kick off deposit pipeline (authed)        [S32]
//   POST /api/hl/withdraw  — initiate withdrawal (authed)              [S32]
//
// Mounting: import { mountHlRoutes } from './hl-routes' and call from the
// same place nuro-routes.mountNuroRoutes(router, db) is called.
// Cron: import { runHlPositionSyncCycle } and schedule from src/index.ts.
//
// On-chain driver scope (S32):
// The deposit/withdraw endpoints validate, write the DB row, and return 202.
// The actual multi-step on-chain pipeline (CCTP bridge legs, vault.deposit,
// epoch withdraw, etc.) is intentionally a stub: it requires real-money
// testing on a funded wallet to verify the CCTP attestation timing + the
// HL-vault-specific Deposit event shape. Until the operator funds a smoke-
// test deposit and signs off, the pipeline driver logs the queued state
// but does not broadcast. Positions stay in 'pending' / 'withdrawing'
// until the operator advances them via SQL or a follow-up driver lands.

import { ethers } from 'ethers'
import type { Router, Request, Response } from 'express'
import type { Pool } from 'pg'
import { fetchVaultDetailsBatch, fetchUserVaultPosition } from './hl-vault-client'
import { enforceTxCap } from './helm'

// requireAuth is the same middleware nuro-routes uses. Importing dynamically
// to avoid a circular import in case nuro-routes ever imports hl-routes.
type AuthedRequest = Request & { user?: { id: string; email?: string } }

interface HlVaultRow {
  id: string
  display_name: string
  vault_address: string
  leader: string
  min_deposit_usd: string
  audit_status: string
  audit_notes: string | null
  description: string | null
  risk_level: string | null
  cached_apr_pct: string | null
  cached_tvl_usd: string | null
  cached_at: string | null
  score_tvl: number | null
  score_age: number | null
  score_drawdown: number | null
  score_leader: number | null
}

interface HlPositionRow {
  id: string
  user_id: string
  vault_id: string
  deposit_amount_usdc: string
  shares_held: string
  status: string
  opened_at: string
  closed_at: string | null
  last_known_value_usd: string | null
  last_synced_at: string
  withdraw_initiated_at: string | null
  withdraw_completes_at: string | null
  vault_display_name: string
  vault_address: string
}

export function mountHlRoutes(router: Router, db: Pool, requireAuth: any): void {
  // ── GET /api/hl/vaults ─────────────────────────────────────────────────────
  // Lists approved vaults with cached APR + TVL. Public.
  // Optional ?refresh=1 forces a live HL Info-API fetch and updates the
  // cached_* columns. Otherwise returns whatever the daily sync wrote last.
  router.get('/api/hl/vaults', async (req: Request, res: Response) => {
    try {
      const refresh = req.query.refresh === '1'
      const vaultsRes = await db.query<HlVaultRow>(
        `SELECT id, display_name, vault_address, leader, min_deposit_usd::text,
                audit_status, audit_notes, description, risk_level,
                cached_apr_pct::text, cached_tvl_usd::text, cached_at,
                score_tvl, score_age, score_drawdown, score_leader
         FROM hl_vaults
         WHERE audit_status = 'approved'
         ORDER BY cached_tvl_usd DESC NULLS LAST, display_name ASC`,
      )

      let liveData: Map<string, { apr: number | null; tvl: number | null; followers: number | null }> | null = null
      if (refresh && vaultsRes.rows.length > 0) {
        // Best-effort live refresh; if HL API fails we fall through to cached.
        try {
          const addresses = vaultsRes.rows.map((v) => v.vault_address)
          const live = await fetchVaultDetailsBatch(addresses)
          liveData = new Map()
          for (const entry of live) {
            if (entry.details) {
              liveData.set(entry.vaultAddress.toLowerCase(), {
                apr: Number.isFinite(entry.details.apr30d) ? entry.details.apr30d : null,
                tvl: Number.isFinite(entry.details.totalEquityUsd) ? entry.details.totalEquityUsd : null,
                followers: entry.details.followers,
              })
              // Persist back to cache so the next non-refresh call sees fresh data.
              await db.query(
                `UPDATE hl_vaults
                 SET cached_apr_pct = $1, cached_tvl_usd = $2, cached_at = now()
                 WHERE vault_address = $3`,
                [entry.details.apr30d, entry.details.totalEquityUsd, entry.vaultAddress.toLowerCase()],
              ).catch(() => undefined)
            }
          }
        } catch (err: any) {
          console.warn(`[hl-routes] live refresh failed: ${err?.message?.slice(0, 120)}`)
        }
      }

      const vaults = vaultsRes.rows.map((v) => {
        const live = liveData?.get(v.vault_address.toLowerCase())
        const apr = live?.apr ?? (v.cached_apr_pct ? Number(v.cached_apr_pct) : null)
        const tvl = live?.tvl ?? (v.cached_tvl_usd ? Number(v.cached_tvl_usd) : null)
        return {
          id: v.id,
          displayName: v.display_name,
          vaultAddress: v.vault_address,
          leader: v.leader,
          minDepositUsd: Number(v.min_deposit_usd),
          description: v.description,
          riskLevel: v.risk_level,
          apr30dPct: apr,
          tvlUsd: tvl,
          followers: live?.followers ?? null,
          cachedAt: v.cached_at,
          isLive: live != null,
          // Audit-rubric transparency for the UI
          auditScores: {
            tvl: v.score_tvl,
            age: v.score_age,
            drawdown: v.score_drawdown,
            leader: v.score_leader,
          },
          auditNotes: v.audit_notes,
        }
      })

      res.json({
        vaults,
        count: vaults.length,
        refreshed: refresh && liveData != null,
      })
    } catch (err: any) {
      console.error('[GET /api/hl/vaults] error:', err?.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── GET /api/hl/positions ──────────────────────────────────────────────────
  // Authed. Returns the caller's open + recently-closed HL vault positions.
  // Optional ?live=1 reads on-chain share balance for every active row
  // (slow; ~one RPC per row). Default = cached only.
  router.get('/api/hl/positions', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user?.id
      if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

      const live = req.query.live === '1'

      const rowsRes = await db.query<HlPositionRow>(
        `SELECT p.id, p.user_id, p.vault_id, p.deposit_amount_usdc::text,
                p.shares_held::text, p.status, p.opened_at, p.closed_at,
                p.last_known_value_usd::text, p.last_synced_at,
                p.withdraw_initiated_at, p.withdraw_completes_at,
                v.display_name AS vault_display_name,
                v.vault_address
         FROM hl_vault_positions p
         JOIN hl_vaults v ON v.id = p.vault_id
         WHERE p.user_id = $1
           AND (p.status IN ('pending', 'active', 'withdrawing')
                OR (p.status IN ('closed', 'failed')
                    AND p.closed_at > now() - interval '90 days'))
         ORDER BY p.opened_at DESC`,
        [userId],
      )

      // Optional live refresh — read on-chain share balances. We need the
      // user's HyperEVM address; for Phase 1.2 each user has an HD-derived
      // HyperEVM deposit address (same pattern as evm/solana). For now,
      // read it from deposit_addresses (chain='hype' or 'evm'?).
      // Defensive: if no address found, just return cached.
      let liveByPositionId: Map<string, { equityUsd: number; readAtMs: number }> | null = null
      if (live && rowsRes.rows.length > 0) {
        try {
          const addrRes = await db.query<{ address: string }>(
            `SELECT address FROM deposit_addresses
             WHERE user_id = $1 AND chain IN ('hype', 'evm')
             ORDER BY (chain = 'hype') DESC LIMIT 1`,
            [userId],
          )
          const userAddr = addrRes.rows[0]?.address
          if (userAddr) {
            liveByPositionId = new Map()
            await Promise.all(
              rowsRes.rows
                .filter((r) => r.status === 'active' || r.status === 'withdrawing')
                .map(async (r) => {
                  const view = await fetchUserVaultPosition(r.vault_address, userAddr)
                  if (view) {
                    liveByPositionId!.set(r.id, {
                      equityUsd: view.equityUsd,
                      readAtMs: view.readAtMs,
                    })
                    // Update cache
                    await db.query(
                      `UPDATE hl_vault_positions
                       SET last_known_value_usd = $1, last_synced_at = now()
                       WHERE id = $2`,
                      [view.equityUsd, r.id],
                    ).catch(() => undefined)
                  }
                }),
            )
          }
        } catch (err: any) {
          console.warn(`[hl-routes] live position refresh failed: ${err?.message?.slice(0, 120)}`)
        }
      }

      const positions = rowsRes.rows.map((r) => {
        const liveData = liveByPositionId?.get(r.id)
        const valueUsd = liveData
          ? liveData.equityUsd
          : (r.last_known_value_usd ? Number(r.last_known_value_usd) : null)
        const depositUsd = Number(r.deposit_amount_usdc)
        const pnlUsd = valueUsd != null ? valueUsd - depositUsd : null
        return {
          id: r.id,
          vaultId: r.vault_id,
          vaultDisplayName: r.vault_display_name,
          vaultAddress: r.vault_address,
          status: r.status,
          depositAmountUsdc: depositUsd,
          sharesHeld: r.shares_held,
          valueUsd,
          pnlUsd,
          openedAt: r.opened_at,
          closedAt: r.closed_at,
          lastSyncedAt: r.last_synced_at,
          withdrawInitiatedAt: r.withdraw_initiated_at,
          withdrawCompletesAt: r.withdraw_completes_at,
          isLive: liveData != null,
        }
      })

      res.json({
        positions,
        count: positions.length,
        refreshed: live && liveByPositionId != null,
      })
    } catch (err: any) {
      console.error('[GET /api/hl/positions] error:', err?.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── POST /api/hl/deposit ───────────────────────────────────────────────────
  // Authed. Body: { vaultId: string, amountUsdc: number }
  // Validates → HELM-105 cap → inserts hl_vault_positions row in 'pending'
  // → returns 202 with positionId. The on-chain pipeline (Base USDC charge
  // + CCTP bridge to HyperEVM + vault.deposit broadcast) is driven async
  // by processDepositPipeline() — see file-header note about the stub.
  router.post('/api/hl/deposit', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user?.id
      if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

      const vaultId = String(req.body?.vaultId || '').trim()
      const amountUsdc = Number(req.body?.amountUsdc)
      if (!vaultId) return res.status(400).json({ error: 'vaultId required' })
      if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
        return res.status(400).json({ error: 'amountUsdc must be a positive number' })
      }

      // Vault must exist + be approved.
      const vRes = await db.query(
        `SELECT id, vault_address, min_deposit_usd::text, audit_status
         FROM hl_vaults WHERE id = $1`,
        [vaultId],
      )
      if (vRes.rows.length === 0) {
        return res.status(404).json({ error: 'vault not found' })
      }
      const vault = vRes.rows[0]
      if (vault.audit_status !== 'approved') {
        return res.status(403).json({ error: `vault not deposit-eligible (audit_status='${vault.audit_status}')` })
      }
      const minDeposit = Number(vault.min_deposit_usd)
      if (amountUsdc < minDeposit) {
        return res.status(400).json({ error: `amount $${amountUsdc} below min deposit $${minDeposit}` })
      }

      // HELM-105 — observe-mode unless HELM_TXCAP_ENFORCE=on. agentId =
      // userId so the spend lands in the user's ledger when Task 4's
      // plumbing fires through enforceTxCap below.
      await enforceTxCap({
        source: 'hl-vault-deposit',
        txKind: 'transfer',
        valueUsd: amountUsdc,
        chainId: 8453, // Base — where the user holds USDC pre-bridge
        agentId: userId,
      })

      // Insert pending position. The pipeline driver (cron-driven sweep) will
      // advance it through the on-chain flow once that driver is wired.
      const insRes = await db.query(
        `INSERT INTO hl_vault_positions
           (user_id, vault_id, deposit_amount_usdc, shares_held, status)
         VALUES ($1, $2, $3, 0, 'pending')
         RETURNING id, opened_at`,
        [userId, vaultId, amountUsdc],
      )
      const position = insRes.rows[0]

      // Fire-and-forget: queue the deposit pipeline. Returns immediately so
      // the FE can show "deposit pending" and poll /api/hl/positions for
      // status updates.
      void processDepositPipeline(db, position.id).catch((err) => {
        console.warn(`[hl-pipeline] deposit ${position.id} kickoff failed: ${err?.message?.slice(0, 120)}`)
      })

      return res.status(202).json({
        positionId: position.id,
        status: 'pending',
        openedAt: position.opened_at,
        message: 'Deposit queued. Pipeline progress visible via GET /api/hl/positions.',
      })
    } catch (err: any) {
      // HELM-105 enforce-mode throws — propagate as a clear 4xx.
      if (typeof err?.message === 'string' && err.message.includes('HELM-105')) {
        return res.status(403).json({ error: err.message.slice(0, 240) })
      }
      console.error('[POST /api/hl/deposit] error:', err?.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── POST /api/hl/withdraw ──────────────────────────────────────────────────
  // Authed. Body: { positionId: string }
  // Position must belong to caller and be 'active'. Records the withdraw
  // intent + epoch-window completion estimate, returns 202. The on-chain
  // unstake (vault.requestWithdraw → wait epoch → vault.claim → CCTP back to
  // Base) is driven async by processWithdrawPipeline() — currently stub.
  router.post('/api/hl/withdraw', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user?.id
      if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

      const positionId = String(req.body?.positionId || '').trim()
      if (!positionId) return res.status(400).json({ error: 'positionId required' })

      // Validate ownership + state.
      const pRes = await db.query(
        `SELECT id, user_id, vault_id, status, deposit_amount_usdc::text,
                shares_held::text, last_known_value_usd::text
         FROM hl_vault_positions WHERE id = $1`,
        [positionId],
      )
      if (pRes.rows.length === 0) {
        return res.status(404).json({ error: 'position not found' })
      }
      const pos = pRes.rows[0]
      if (pos.user_id !== userId) {
        return res.status(403).json({ error: 'not your position' })
      }
      if (pos.status !== 'active') {
        return res.status(400).json({ error: `cannot withdraw from position in status='${pos.status}'` })
      }

      // S33 Tier 1 #4: HELM-105 cap on user-initiated HL withdrawal.
      // The actual unstake happens async (epoch wait + vault.claim +
      // CCTP back to Base); cap fires here at intent so we catch a
      // runaway-value withdraw at the user-authorization point. Use
      // last_known_value_usd from position-sync as the off-chain proxy
      // for the move; falls back to deposit_amount_usdc if the sync
      // hasn't run yet (cap still meaningful from the deposit basis).
      const valueUsdHl = Number(pos.last_known_value_usd ?? pos.deposit_amount_usdc)
      await enforceTxCap({
        source: 'user-hl-withdraw',
        txKind: 'transfer',
        valueUsd: Number.isFinite(valueUsdHl) ? valueUsdHl : 0,
        chainId: 999, // HyperEVM mainnet — withdraw initiates on HL, CCTPs back to Base later
        agentId: userId,
      })

      // HL vaults use epoch-based withdrawal windows — typically 4 days,
      // but the value can vary per vault. Default to 4d here; a future
      // pass can read the actual epoch length from the vault contract.
      const EPOCH_WINDOW_DAYS = 4
      const completesAt = new Date(Date.now() + EPOCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)

      const updRes = await db.query(
        `UPDATE hl_vault_positions
         SET status = 'withdrawing',
             withdraw_initiated_at = now(),
             withdraw_completes_at = $1
         WHERE id = $2 AND status = 'active'
         RETURNING id, withdraw_initiated_at, withdraw_completes_at`,
        [completesAt.toISOString(), positionId],
      )
      // Race: another concurrent withdraw could have advanced it.
      if (updRes.rows.length === 0) {
        return res.status(409).json({ error: 'position state changed; retry GET /positions' })
      }

      void processWithdrawPipeline(db, positionId).catch((err) => {
        console.warn(`[hl-pipeline] withdraw ${positionId} kickoff failed: ${err?.message?.slice(0, 120)}`)
      })

      return res.status(202).json({
        positionId,
        status: 'withdrawing',
        withdrawInitiatedAt: updRes.rows[0].withdraw_initiated_at,
        withdrawCompletesAt: updRes.rows[0].withdraw_completes_at,
        epochWindowDays: EPOCH_WINDOW_DAYS,
        message: `Withdrawal queued. Funds claimable after epoch window (~${EPOCH_WINDOW_DAYS} days).`,
      })
    } catch (err: any) {
      console.error('[POST /api/hl/withdraw] error:', err?.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Position-sync cron (S32)
//
// Hourly sweep that refreshes `last_known_value_usd` for every active or
// withdrawing position. Reads on-chain share balance × vault NAV via
// fetchUserVaultPosition. Read-only, safe to run today (no writes to the
// chain).
//
// Drives the "X minutes ago" freshness label + portfolio-card USD value.
// ─────────────────────────────────────────────────────────────────────────────

interface SyncRow {
  id: string
  user_id: string
  vault_address: string
}

export async function runHlPositionSyncCycle(db: Pool): Promise<{
  scanned: number
  refreshed: number
  failed: number
}> {
  let scanned = 0
  let refreshed = 0
  let failed = 0

  try {
    // Pick positions whose last_synced_at is older than 1 hour. Cap at 100
    // per cycle so a backlog doesn't stall the cron — the next pass
    // catches the rest.
    const due = await db.query<SyncRow>(
      `SELECT p.id, p.user_id, v.vault_address
       FROM hl_vault_positions p
       JOIN hl_vaults v ON v.id = p.vault_id
       WHERE p.status IN ('active', 'withdrawing')
         AND p.last_synced_at < now() - interval '1 hour'
       ORDER BY p.last_synced_at ASC
       LIMIT 100`,
    )
    scanned = due.rows.length

    for (const row of due.rows) {
      try {
        // Look up the user's HyperEVM address (HD-derived). 'hype' is the
        // canonical chain label for HyperEVM in deposit_addresses; some
        // older rows may still use 'evm'.
        const addrRes = await db.query<{ address: string }>(
          `SELECT address FROM deposit_addresses
           WHERE user_id = $1 AND chain IN ('hype', 'evm')
           ORDER BY (chain = 'hype') DESC LIMIT 1`,
          [row.user_id],
        )
        const userAddr = addrRes.rows[0]?.address
        if (!userAddr) {
          failed++
          continue
        }

        const view = await fetchUserVaultPosition(row.vault_address, userAddr)
        if (!view) {
          failed++
          continue
        }

        await db.query(
          `UPDATE hl_vault_positions
           SET last_known_value_usd = $1, last_synced_at = now()
           WHERE id = $2`,
          [view.equityUsd, row.id],
        )
        refreshed++
      } catch (err: any) {
        failed++
        console.warn(`[hl-sync] position ${row.id} failed: ${err?.message?.slice(0, 120)}`)
      }
    }
  } catch (err: any) {
    console.error('[hl-sync] cycle error:', err?.message?.slice(0, 120))
  }

  return { scanned, refreshed, failed }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline driver stubs (S32 — TODO: wire on-chain execution)
//
// These functions are the place where the real on-chain steps go once the
// operator has funded a smoke-test deposit + verified each leg. Wiring them
// up requires:
//   - Real USDC on Base (~$10-50 to test minimum deposit)
//   - Native HYPE on HyperEVM for vault.deposit gas
//   - Real CCTP attestation polling (iris-api.circle.com)
//   - HL-vault-specific Deposit event shape (need a smoke-test to confirm)
//
// Until wired, deposits stay in 'pending' and withdrawals stay in 'withdrawing'
// indefinitely. Operator can manually advance positions via SQL UPDATE while
// validating the on-chain flow leg-by-leg.
// ─────────────────────────────────────────────────────────────────────────────

async function processDepositPipeline(db: Pool, positionId: string): Promise<void> {
  console.log(`[hl-pipeline] deposit ${positionId} queued — awaiting on-chain driver wire-up (real-money testing required)`)
  // Future steps:
  //   1. SELECT position + vault (vault_address + min_deposit) + user's
  //      HD-derived addresses (Base + HyperEVM).
  //   2. ethers.Contract(USDC_BASE, …).transfer(userBaseDepositAddr, amount)
  //      — only if user's main vault on Base differs from their bridge address.
  //   3. cctpBurnAndMint(BASE → HYPEREVM, amount, userBaseAddr, userHypeAddr)
  //      — reuses bridge.ts infra. Polls iris-api for attestation; mints
  //      USDC on HyperEVM (chainId 999).
  //   4. ethers.Contract(USDC_HYPER, …).approve(vault_address, amount)
  //      from userHypeAddr.
  //   5. ethers.Contract(vault_address, …).deposit(amount) — parse Deposit
  //      event for sharesMinted.
  //   6. UPDATE hl_vault_positions SET status='active', shares_held=$,
  //      deposit_tx_hash=$, last_known_value_usd=amount WHERE id=$.
  //
  // On any failure: UPDATE position SET status='failed', closed_at=now()
  // and log the error to execution_log so ops can investigate.
  void db, positionId
}

async function processWithdrawPipeline(db: Pool, positionId: string): Promise<void> {
  console.log(`[hl-pipeline] withdraw ${positionId} queued — awaiting on-chain driver wire-up (real-money testing required)`)
  // Future steps:
  //   1. SELECT position + vault. Read shares_held.
  //   2. ethers.Contract(vault, …).requestWithdraw(shares) on HyperEVM —
  //      enters epoch queue. Returns immediately; actual claim is gated on
  //      the vault's epoch boundary.
  //   3. After withdraw_completes_at: ethers.Contract(vault, …).claim()
  //      — receives USDC into userHypeAddr. Parse the claim event for
  //      actual USDC amount returned (may differ from initial deposit
  //      based on PnL).
  //   4. cctpBurnAndMint(HYPEREVM → BASE, claimedAmount, userHypeAddr,
  //      userBaseAddr) — bridges USDC back to user's Base vault.
  //   5. UPDATE hl_vault_positions SET status='closed', closed_at=now(),
  //      closed_amount_usdc=$, closed_pnl_usdc=$ - deposit_amount_usdc,
  //      withdraw_tx_hash=$ WHERE id=$.
  //
  // The cron should poll for 'withdrawing' positions where now() >=
  // withdraw_completes_at and advance them — so this driver can be
  // re-entered idempotently per cycle until each step lands.
  void db, positionId
  // Touch ethers import so TS doesn't strip it before the on-chain code
  // lands. Remove this line when the pipeline wires up.
  void ethers
}

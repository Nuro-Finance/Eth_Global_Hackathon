/**
 * ─── EXECUTION DISPATCH ENGINE ────────────────────────────────────────────────
 *
 * The bridge between Intent Layer (DB) and Execution Layer (On-Chain).
 *
 * This module runs periodic sweeps to find pending intents and route them
 * to on-chain execution. It never creates fake data - it either executes
 * for real or leaves the intent in pending state with a clear reason.
 *
 * Architecture:
 * Intent recorded (DB) → Execution Dispatch picks up → On-chain tx → Status updated
 *
 * Sweep types (public build):
 * 1. Card transactions - pending deposits → verify issuer credit → complete
 * 2. Card settlements - vault → issuer
 * 3. Transfers + scheduled intents + issuer sync
 *
 * Errors are logged to execution_log.
 *
 * Golden Rule: Card balance comes from Issuer ONLY. We never write to cards.balance.
 */

import { Pool } from 'pg'
import { ethers } from 'ethers'
import { enforceTxCap } from './helm'
import { CONFIG } from './config'
import { syncIssuerBalance, getIssuerTransactions, getUserBaseDepositAddress } from './issuers'
import { syncIssuerTransactions } from './issuer-sync'
import { acquireChainLock, releaseChainLock, getFreshNonce, recordNonceUsed, createFreshWallet } from './nonce-manager'
import { syncCardBalanceFromIssuer } from './card-balance-sync'
// Sprint B: card settlement tunables
const MIN_CARD_SETTLEMENT_USD = 1.0
const MAX_SETTLEMENT_ATTEMPTS = 10

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface ExecutionLogEntry {
  entity_type:
    | 'card_transaction'
    | 'market_position'
    | 'market_payout'
    | 'card_settlement'
    | 'creator_payout'
    | 'transfer'
    | 'withdrawal'
    | 'issuer_sync'
    | 'agent_funding'
    | 'agent_bet_settlement'
    | 'agent_profit_sweep'
    | 'agent_reconcile'
    | 'agent_cycle'
    | 'error'
  entity_id: string
  action: string
  status: 'success' | 'failed' | 'skipped'
  tx_hash: string | null
  detail: string
  error_message: string | null
}

// ─── WALLET DERIVATION (HD from master key) ──────────────────────────────────

function deriveWallet(salt: string): ethers.utils.HDNode {
  const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + salt)
  return ethers.utils.HDNode.fromSeed(seed)
}

function deriveVaultWallet(userId: string): ethers.utils.HDNode {
  return deriveWallet('vault_' + userId)
}


// ─── EXECUTION LOG ───────────────────────────────────────────────────────────

async function logExecution(db: Pool, entry: ExecutionLogEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now())`,
      [entry.entity_type, entry.entity_id, entry.action, entry.status, entry.tx_hash, entry.detail, entry.error_message]
    )
  } catch (e: any) {
    console.error('[execution-dispatch] Failed to write execution log:', e.message?.slice(0, 80))
  }
}

// ─── BASE USDC HELPER ────────────────────────────────────────────────────────

function getBaseUsdcContract(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(
    CONFIG.USDC_BASE,
    [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)',
    ],
    signer
  )
}

async function getBaseUsdcBalance(address: string): Promise<number> {
  const provider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL)
  const usdc = new ethers.Contract(
    CONFIG.USDC_BASE,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  )
  const raw = await usdc.balanceOf(address)
  return parseFloat(ethers.utils.formatUnits(raw, 6))
}

// ─── SPRINT B: CARD SETTLEMENT HELPERS ───────────────────────────────────────

/**
 * Cache-then-fetch user's Issuer Base deposit address.
 * Uses deposit_addresses table with chain='base-issuer' as cache layer to avoid
 * repeated Issuer API calls on every settlement sweep.
 */
async function resolveIssuerBaseAddress(db: Pool, userId: string, issuerUserId: string): Promise<string | null> {
  const cached = await db.query(
    `SELECT address FROM deposit_addresses WHERE user_id = $1 AND chain = 'base-issuer' LIMIT 1`,
    [userId]
  )
  if (cached.rows[0]?.address) return cached.rows[0].address
  try {
    const addr = await getUserBaseDepositAddress(issuerUserId)
    if (addr) {
      await db.query(
        `INSERT INTO deposit_addresses (user_id, chain, address) VALUES ($1, 'base-issuer', $2)
         ON CONFLICT (user_id, chain) DO NOTHING`,
        [userId, addr]
      ).catch(() => {})
      return addr
    }
  } catch (err: any) {
    console.error('[card-settlement] Issuer address fetch failed for user', userId, ':', err.message?.slice(0, 80))
  }
  return null
}

/**
 * Enqueue a card_settlements row if the user's payout_destination starts with 'card'.
 * Called from sweepMarketPayouts success branch. Uniqueness is enforced by
 * card_settlements.position_id UNIQUE - safe to call multiple times for the same position.
 */
async function enqueueCardSettlement(
  db: Pool,
  userId: string,
  positionId: string | null,
  payoutAmount: number
): Promise<void> {
  if (payoutAmount < MIN_CARD_SETTLEMENT_USD) return

  const userRow = await db.query(
    `SELECT payout_destination, issuer_user_id FROM users WHERE id = $1`,
    [userId]
  )
  const dest = userRow.rows[0]?.payout_destination || 'vault'
  if (!dest.startsWith('card')) return  // only 'card' destination enqueues settlements

  const issuerUserId = userRow.rows[0]?.issuer_user_id
  if (!issuerUserId) {
    console.warn('[card-settlement] user', userId, 'has no Issuer ID - skipping enqueue')
    return
  }

  const feePercent = Number(CONFIG.FEE_PERCENT) || 5
  const feeAmount = Number((payoutAmount * feePercent / 100).toFixed(6))
  const forwardAmount = Number((payoutAmount - feeAmount).toFixed(6))

  await db.query(
    `INSERT INTO card_settlements (id, user_id, position_id, amount, fee_amount, forward_amount, destination, status, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', now())
     ON CONFLICT (position_id) DO NOTHING`,
    [userId, positionId, payoutAmount, feeAmount, forwardAmount, dest]
  )
}

// ─── SWEEP 1: PENDING CARD TRANSACTIONS (deposits) ──────────────────────────
//
// When a bridge deposit completes, we insert a card_transaction with status='pending'.
// This sweep checks if Issuer has received the USDC by querying Issuer's balance/transactions,
// and marks the transaction as 'completed' once confirmed.
//
// We NEVER write to cards.balance - Issuer is the source of truth.

async function sweepPendingCardTransactions(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT ct.id, ct.user_id, ct.amount, ct.type, ct.name, ct.created_at,
              u.issuer_user_id
       FROM card_transactions ct
       JOIN users u ON u.id = ct.user_id
       WHERE ct.status = 'pending' AND ct.type = 'deposit'
       ORDER BY ct.created_at ASC
       LIMIT 20`
    )

    for (const tx of pending.rows) {
      const issuerUserId = tx.issuer_user_id
      if (!issuerUserId) {
        await logExecution(db, {
          entity_type: 'card_transaction',
          entity_id: tx.id,
          action: 'verify_deposit',
          status: 'skipped',
          tx_hash: null,
          detail: `User ${tx.user_id} has no Issuer ID - cannot verify deposit`,
          error_message: null,
        })
        continue
      }

      try {
 // Check if Issuer has received the deposit by querying their transactions API
        const issuerTxns = await getIssuerTransactions(issuerUserId)
        const depositAmount = Math.abs(parseFloat(tx.amount))

 // Look for a matching Issuer transaction within a reasonable time window (30 min)
        const txCreatedAt = new Date(tx.created_at).getTime()
        const matchingIssuerTx = issuerTxns.find((ot: any) => {
          const otAmount = Math.abs(parseFloat(ot.amount || ot.value || '0')) / 100 // Issuer stores in cents
          const otTime = new Date(ot.createdAt || ot.created_at).getTime()
          const timeDelta = Math.abs(otTime - txCreatedAt)
          return Math.abs(otAmount - depositAmount) < 0.02 && timeDelta < 30 * 60 * 1000
        })

        if (matchingIssuerTx) {
 // Issuer confirmed the deposit - mark as completed
          await db.query(
            `UPDATE card_transactions SET status = 'completed', updated_at = now() WHERE id = $1`,
            [tx.id]
          )
          await logExecution(db, {
            entity_type: 'card_transaction',
            entity_id: tx.id,
            action: 'verify_deposit',
            status: 'success',
            tx_hash: matchingIssuerTx.transactionId || matchingIssuerTx.id || null,
            detail: `Issuer confirmed deposit of $${depositAmount.toFixed(2)} for user ${tx.user_id}`,
            error_message: null,
          })
          processed++
        } else {
 // Check age - if pending > 2 hours, flag as potentially failed
          const ageMs = Date.now() - txCreatedAt
          if (ageMs > 2 * 60 * 60 * 1000) {
            await logExecution(db, {
              entity_type: 'card_transaction',
              entity_id: tx.id,
              action: 'verify_deposit',
              status: 'failed',
              tx_hash: null,
              detail: `Deposit of $${depositAmount.toFixed(2)} pending > 2 hours - may need manual review`,
              error_message: 'Timeout: Issuer has not confirmed deposit after 2 hours',
            })
          }
 // Don't mark as failed yet - Issuer may still be processing
        }
      } catch (err: any) {
        await logExecution(db, {
          entity_type: 'card_transaction',
          entity_id: tx.id,
          action: 'verify_deposit',
          status: 'failed',
          tx_hash: null,
          detail: `Error checking Issuer for deposit verification`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_card_transactions',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Card transaction sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP 3.5: CARD SETTLEMENTS (Sprint B - vault → Issuer) ─────────────────
//
// When a market payout lands in the user's vault and their payout_destination='card',
// sweepMarketPayouts enqueues a card_settlements row. This sweep executes those:
// vault → FEE_VAULT (5%), vault → Issuer Base deposit (95%). The Issuer Issuer
// infrastructure detects the Base deposit and credits the Visa card automatically.

async function sweepCardSettlements(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT cs.id, cs.user_id, cs.position_id, cs.amount, cs.fee_amount, cs.forward_amount,
              cs.destination, cs.issuer_address, cs.fee_tx_hash, cs.forward_tx_hash,
              cs.attempt_count, cs.created_at, cs.metadata,
              u.issuer_user_id
       FROM card_settlements cs
       JOIN users u ON u.id = cs.user_id
       WHERE cs.status = 'pending' AND cs.forward_tx_hash IS NULL
       ORDER BY cs.created_at ASC
       LIMIT 10`
    )

    for (const row of pending.rows) {
      try {
 // Skip unsupported destinations (placeholders for future sprints)
        if (!row.destination.startsWith('card')) {
          await db.query(
            `UPDATE card_settlements SET status = 'skipped_unsupported_destination',
               error_message = $1, completed_at = now() WHERE id = $2`,
            [`Destination '${row.destination}' not yet supported in Sprint B`, row.id]
          )
          continue
        }

 // Skip below-threshold (fee would eat the payout)
        const amount = parseFloat(row.amount)
        if (amount < MIN_CARD_SETTLEMENT_USD) {
          await db.query(
            `UPDATE card_settlements SET status = 'skipped_below_threshold',
               error_message = $1, completed_at = now() WHERE id = $2`,
            [`Amount $${amount.toFixed(2)} below $${MIN_CARD_SETTLEMENT_USD} threshold`, row.id]
          )
          continue
        }

 // Max attempts exhausted - fail + surface to admin
        if (row.attempt_count >= MAX_SETTLEMENT_ATTEMPTS) {
          const finalStatus = row.fee_tx_hash ? 'failed_post_fee' : 'failed'
          await db.query(
            `UPDATE card_settlements SET status = $1, completed_at = now(),
               error_message = COALESCE(error_message, $2) WHERE id = $3`,
            [finalStatus, `Exhausted ${MAX_SETTLEMENT_ATTEMPTS} retry attempts`, row.id]
          )
          await logExecution(db, {
            entity_type: 'card_settlement',
            entity_id: row.id,
            action: 'max_attempts',
            status: 'failed',
            tx_hash: row.fee_tx_hash || null,
            detail: `Settlement abandoned after ${MAX_SETTLEMENT_ATTEMPTS} attempts. Admin refund may be needed if fee_tx_hash is set.`,
            error_message: finalStatus,
          })
          continue
        }

 // Bump attempt count before each try
        await db.query(
          `UPDATE card_settlements SET attempt_count = attempt_count + 1, last_attempted_at = now() WHERE id = $1`,
          [row.id]
        )

 // Resolve Issuer Base address (cache then fetch)
        let issuerAddress: string | null = row.issuer_address
        if (!issuerAddress) {
          const issuerUserId = row.issuer_user_id
          if (!issuerUserId) {
            await db.query(
              `UPDATE card_settlements SET status = 'failed_no_issuer_id',
                 error_message = 'User has no Issuer ID' WHERE id = $1`,
              [row.id]
            )
            continue
          }
          issuerAddress = await resolveIssuerBaseAddress(db, row.user_id, issuerUserId)
          if (!issuerAddress) {
            await logExecution(db, {
              entity_type: 'card_settlement',
              entity_id: row.id,
              action: 'resolve_address',
              status: 'skipped',
              tx_hash: null,
              detail: 'Could not resolve Issuer Base deposit address; will retry',
              error_message: 'address_resolution_failed',
            })
            continue
          }
          await db.query(
            `UPDATE card_settlements SET issuer_address = $1 WHERE id = $2`,
            [issuerAddress, row.id]
          )
        }

        const vaultHd = deriveVaultWallet(row.user_id)
 // S33 Tier 1 #5b: compute fee/forward amounts on-the-fly when the
 // row was inserted without them (e.g. /agents/:id/settle creates a
 // bare row with just `amount`). Persist back so retries are
 // deterministic. Standard market-payout enqueues already populate
 // these via enqueueCardSettlement().
        let feeAmount = parseFloat(row.fee_amount)
        let forwardAmount = parseFloat(row.forward_amount)
        if (!Number.isFinite(feeAmount) || !Number.isFinite(forwardAmount)) {
          const feePercent = Number(CONFIG.FEE_PERCENT) || 5
          feeAmount = Number((amount * feePercent / 100).toFixed(6))
          forwardAmount = Number((amount - feeAmount).toFixed(6))
          await db.query(
            `UPDATE card_settlements SET fee_amount = $1, forward_amount = $2 WHERE id = $3`,
            [feeAmount, forwardAmount, row.id],
          )
        }

 // Vault balance check
        const vaultBalance = await getBaseUsdcBalance(vaultHd.address)
        if (vaultBalance < amount) {
          await logExecution(db, {
            entity_type: 'card_settlement',
            entity_id: row.id,
            action: 'execute_settlement',
            status: 'skipped',
            tx_hash: null,
            detail: `Vault ${vaultHd.address} has $${vaultBalance.toFixed(2)}, needs $${amount.toFixed(2)}`,
            error_message: 'Insufficient vault balance',
          })
          continue
        }

 // Execute two sequential txs inside a single chain lock - mirrors bridge.ts:447-469
        let feeTx: ethers.ContractTransaction | null = null
        let feeTxHash: string | null = row.fee_tx_hash  // may already exist from prior partial attempt
        let fwdTx: ethers.ContractTransaction | null = null

        await acquireChainLock(8453, vaultHd.address)
        try {
          const vaultSigner = createFreshWallet(vaultHd.privateKey, 8453)
          const usdc = getBaseUsdcContract(vaultSigner)
          let nonce = await getFreshNonce(8453, vaultHd.address)

 // Fee tx (skip if already sent from prior attempt)
          if (feeAmount > 0 && !feeTxHash) {
            const feeWei = ethers.utils.parseUnits(feeAmount.toFixed(6), 6)
            const feeGas = await usdc.estimateGas.transfer(CONFIG.FEE_VAULT_ADDRESS, feeWei).catch(() => ethers.BigNumber.from(100000))
            const feeGasLimit = feeGas.mul(130).div(100)
            feeTx = await usdc.transfer(CONFIG.FEE_VAULT_ADDRESS, feeWei, { gasLimit: feeGasLimit, nonce })
            await feeTx!.wait()
            recordNonceUsed(8453, nonce, vaultHd.address)
            feeTxHash = feeTx!.hash
            nonce++

            await db.query(
              `UPDATE card_settlements SET fee_tx_hash = $1 WHERE id = $2`,
              [feeTxHash, row.id]
            )
          }

 // Forward tx: vault → Issuer Base deposit address
          const fwdWei = ethers.utils.parseUnits(forwardAmount.toFixed(6), 6)
          const fwdGas = await usdc.estimateGas.transfer(issuerAddress, fwdWei).catch(() => ethers.BigNumber.from(100000))
          const fwdGasLimit = fwdGas.mul(130).div(100)
          fwdTx = await usdc.transfer(issuerAddress, fwdWei, { gasLimit: fwdGasLimit, nonce })
          const fwdReceipt = await fwdTx!.wait()
          recordNonceUsed(8453, nonce, vaultHd.address)
          if (!fwdReceipt || fwdReceipt.status !== 1) throw new Error('Forward transfer reverted')
        } finally {
          releaseChainLock(8453, vaultHd.address)
        }

        if (fwdTx) {
          await db.query(
            `UPDATE card_settlements SET status = 'completed', forward_tx_hash = $1,
               completed_at = now() WHERE id = $2`,
            [fwdTx.hash, row.id]
          )

 // S33 Tier 1 #5b: agent settle rows decrement agents.total_profit
 // on completion. metadata.agent_id is the marker /agents/:id/settle
 // stashes when it enqueues. Use GREATEST(... , 0) so concurrent
 // races (e.g. multiple settle paths landing close together) can't
 // produce a negative total_profit. The decrement is an "after
 // money moved" event - same semantic as crediting card
 // transactions for market winnings; never decrement before
 // forward_tx_hash is set.
          const settlementMetadata = (row.metadata && typeof row.metadata === 'object')
            ? row.metadata
            : (typeof row.metadata === 'string' ? (JSON.parse(row.metadata || '{}') || {}) : {})
          const agentSettleId = settlementMetadata?.agent_id
          let txLabel = `Market winnings (position ${row.position_id || 'manual'})`
          let txCategory = 'market_payout'
          let txType = 'market_settlement'
          if (agentSettleId) {
            await db.query(
              `UPDATE agents
                  SET total_profit = GREATEST(total_profit - $1, 0),
                      updated_at = now()
                WHERE id = $2`,
              [forwardAmount, agentSettleId],
            ).catch((e: any) => {
              console.error('[card-settlement] agent total_profit decrement failed:', e.message?.slice(0, 80))
            })
            txLabel = `Agent profit settlement (${settlementMetadata.agent_name || agentSettleId.slice(0, 8)})`
            txCategory = 'agent_settlement'
            txType = 'agent_settlement'
          }

 // Insert card_transactions row so existing sweepPendingCardTransactions
 // reconciles with Issuer's confirmation. User sees "Market winnings → Card"
 // (or "Agent profit settlement") in activity feed once Issuer credits it.
          const cardRow = await db.query(
            `SELECT id FROM cards WHERE user_id = $1 AND is_active = true LIMIT 1`,
            [row.user_id]
          )
          const cardId = cardRow.rows[0]?.id
          if (cardId) {
            await db.query(
              `INSERT INTO card_transactions (
                 id, card_id, user_id, name, type, amount, category, status,
                 transaction_type, execution_tx_hash, source_chain, token, created_at, date
               ) VALUES (
                 gen_random_uuid(), $1, $2, $3, 'deposit', $4, $5, 'pending',
                 $6, $7, 8453, 'USDC', now(), now()
               )`,
              [cardId, row.user_id, txLabel, forwardAmount, txCategory, txType, fwdTx.hash]
            ).catch((e: any) => {
              console.error('[card-settlement] card_transactions insert failed:', e.message?.slice(0, 80))
            })
          }

          await logExecution(db, {
            entity_type: 'card_settlement',
            entity_id: row.id,
            action: 'execute_settlement',
            status: 'success',
            tx_hash: fwdTx.hash,
            detail: `Settled $${forwardAmount.toFixed(2)} (fee $${feeAmount.toFixed(2)}) from vault → Issuer ${issuerAddress.slice(0, 8)}...`,
            error_message: null,
          })
          processed++
        }
      } catch (err: any) {
        await db.query(
          `UPDATE card_settlements SET error_message = $1 WHERE id = $2`,
          [err.message?.slice(0, 200) || 'Unknown error', row.id]
        ).catch(() => {})
        await logExecution(db, {
          entity_type: 'card_settlement',
          entity_id: row.id,
          action: 'execute_settlement',
          status: 'failed',
          tx_hash: null,
          detail: `Settlement attempt ${row.attempt_count + 1} failed for row ${row.id}`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_card_settlements',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Card settlement sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP 4: ISSUER BALANCE SYNC ─────────────────────────────────────────────
//
// Periodically sync card balances FROM Issuer API INTO our DB.
// This is a READ - Issuer is the source of truth. We store the cached value
// so the frontend can display it without calling Issuer every render.

async function sweepIssuerBalanceSync(db: Pool): Promise<number> {
  let synced = 0
  try {
 // Day-4 fix: only sweep cards linked to an actual Issuer issuer card. Phantom
 // deck-stack rows (issuer_card_id IS NULL) used to get the user-level
 // Issuer balance stamped on top of their seeded values, breaking the
 // demo accounts. Skip them at the query level.
    const users = await db.query(
      `SELECT DISTINCT u.id, u.issuer_user_id, c.id as card_id, c.balance as db_balance
       FROM users u
       JOIN cards c ON c.user_id = u.id AND c.is_active = true AND c.issuer_card_id IS NOT NULL
       WHERE (u.issuer_user_id IS NOT NULL OR u.issuer_user_id IS NOT NULL)
       ORDER BY u.id
       LIMIT 50`
    )

    for (const user of users.rows) {
      const issuerUserId = user.issuer_user_id
      try {
 // Sprint D: shared helper handles Issuer fetch, drift gate, alert, log
        const oldBalance = parseFloat(user.db_balance || '0')
        const outcome = await syncCardBalanceFromIssuer(db, user.card_id, issuerUserId, oldBalance, 'sweep')
        if (outcome.updated) synced++
      } catch (err: any) {
 // Don't log every sync failure as an error - Issuer may rate limit us
        if (!err.message?.includes('404') && !err.message?.includes('rate')) {
          await logExecution(db, {
            entity_type: 'issuer_sync',
            entity_id: user.card_id,
            action: 'balance_sync',
            status: 'failed',
            tx_hash: null,
            detail: `Issuer sync failed for user ${user.id}`,
            error_message: err.message?.slice(0, 200) || 'Unknown error',
          })
        }
      }
    }
  } catch (err: any) {
    console.error('[execution-dispatch] Issuer sync sweep error:', err.message?.slice(0, 80))
  }
  return synced
}

// ─── SWEEP 4b: ISSUER TRANSACTION SYNC ───────────────────────────────────────
//
// Pulls Visa spend data from Issuer's /transactions endpoint and upserts into
// card_transactions. Throttled per-user via users.last_tx_synced_at so we only
// hit Issuer every ~15 minutes per user. Complements the webhook push path.

const ISSUER_TX_SYNC_INTERVAL_MINUTES = 15
const ISSUER_TX_SYNC_USERS_PER_CYCLE = 50

async function sweepIssuerTransactionSync(db: Pool): Promise<number> {
  let synced = 0
  try {
    const users = await db.query(
      `SELECT id
       FROM users
       WHERE (issuer_user_id IS NOT NULL)
         AND id IN (SELECT DISTINCT user_id FROM cards WHERE is_active = true)
         AND (last_tx_synced_at IS NULL OR last_tx_synced_at < now() - (interval '1 minute' * $1))
       ORDER BY last_tx_synced_at NULLS FIRST
       LIMIT $2`,
      [ISSUER_TX_SYNC_INTERVAL_MINUTES, ISSUER_TX_SYNC_USERS_PER_CYCLE]
    )

    for (const user of users.rows) {
      try {
        const result = await syncIssuerTransactions(db, user.id)
        if (result.inserted > 0 || result.updated > 0) {
          synced++
          await logExecution(db, {
            entity_type: 'issuer_sync',
            entity_id: user.id,
            action: 'tx_sync',
            status: 'success',
            tx_hash: null,
            detail: `Tx sync: ${result.inserted} new, ${result.updated} updated, ${result.skipped} skipped (${result.pages} pages)`,
            error_message: null,
          })
        }
        if (result.error && !result.error.includes('404') && !result.error.includes('rate')) {
          await logExecution(db, {
            entity_type: 'issuer_sync',
            entity_id: user.id,
            action: 'tx_sync',
            status: 'failed',
            tx_hash: null,
            detail: `Tx sync failed`,
            error_message: result.error.slice(0, 200),
          })
        }
      } catch (err: any) {
        if (!err.message?.includes('404') && !err.message?.includes('rate')) {
          await logExecution(db, {
            entity_type: 'issuer_sync',
            entity_id: user.id,
            action: 'tx_sync',
            status: 'failed',
            tx_hash: null,
            detail: `Tx sync threw`,
            error_message: err.message?.slice(0, 200) || 'Unknown error',
          })
        }
      }
    }
  } catch (err: any) {
    console.error('[execution-dispatch] Issuer tx sync sweep error:', err.message?.slice(0, 80))
  }
  return synced
}

// ─── SWEEP 5: PENDING P2P TRANSFERS ──────────────────────────────────────────
//
// When a P2P transfer is recorded with status='pending' (vault had insufficient funds),
// this sweep retries the on-chain execution.

async function sweepPendingTransfers(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT t.id, t.sender_user_id, t.recipient_user_id, t.recipient_email,
              t.recipient_account, t.amount, t.transfer_type, t.created_at,
              t.scheduled_at
       FROM transfers t
       WHERE t.status = 'pending' AND t.execution_tx_hash IS NULL
       ORDER BY t.created_at ASC
       LIMIT 10`
    )

    for (const tx of pending.rows) {
      try {
        const transferAmount = parseFloat(tx.amount)

 // Derive sender vault
        const senderHd = deriveVaultWallet(tx.sender_user_id)

 // Resolve recipient address
        let recipientAddress: string | null = null
        if (tx.recipient_user_id) {
          recipientAddress = deriveVaultWallet(tx.recipient_user_id).address
        } else if (tx.recipient_account && tx.recipient_account.startsWith('0x')) {
          recipientAddress = tx.recipient_account
        }

        if (!recipientAddress) {
          await logExecution(db, {
            entity_type: 'transfer',
            entity_id: tx.id,
            action: 'p2p_retry',
            status: 'skipped',
            tx_hash: null,
            detail: `No recipient address resolved for transfer ${tx.id}`,
            error_message: 'Cannot resolve recipient vault address',
          })
          continue
        }

 // Check sender vault balance on Base
        const senderBalance = await getBaseUsdcBalance(senderHd.address)
        if (senderBalance < transferAmount) {
          await logExecution(db, {
            entity_type: 'transfer',
            entity_id: tx.id,
            action: 'p2p_retry',
            status: 'skipped',
            tx_hash: null,
            detail: `Sender vault $${senderBalance.toFixed(2)} < $${transferAmount.toFixed(2)} needed`,
            error_message: 'Insufficient vault balance',
          })
          continue
        }

 // Sprint A hardening: chain lock on sender vault address.
 // Different senders transfer concurrently; same sender serializes.
        await acquireChainLock(8453, senderHd.address)
        let onChainTx: ethers.ContractTransaction | null = null
        let receipt: ethers.ContractReceipt | null = null
        try {
          const signer = createFreshWallet(senderHd.privateKey, 8453)
          const usdc = getBaseUsdcContract(signer)
          const amountWei = ethers.utils.parseUnits(transferAmount.toFixed(6), 6)
          const nonce = await getFreshNonce(8453, senderHd.address)
          const estGas = await usdc.estimateGas.transfer(recipientAddress, amountWei).catch(() => ethers.BigNumber.from(100000))
          const gasLimit = estGas.mul(130).div(100)
          onChainTx = await usdc.transfer(recipientAddress, amountWei, { gasLimit, nonce })
          receipt = await onChainTx!.wait()
          recordNonceUsed(8453, nonce, senderHd.address)
        } finally {
          releaseChainLock(8453, senderHd.address)
        }

        if (receipt && receipt.status === 1 && onChainTx) {
          await db.query(
            `UPDATE transfers SET status = 'completed', execution_tx_hash = $1, completed_at = now() WHERE id = $2`,
            [onChainTx.hash, tx.id]
          )
          await logExecution(db, {
            entity_type: 'transfer',
            entity_id: tx.id,
            action: 'p2p_retry',
            status: 'success',
            tx_hash: onChainTx.hash,
            detail: `$${transferAmount.toFixed(2)} transferred vault→vault on Base`,
            error_message: null,
          })
 // Session 27 - Sprint 2.6 finisher. Scheduled transfers already
 // get a "processing" notification at the promote step in
 // sweepScheduledIntents. Fire a second "confirmed" notification
 // when the on-chain transfer actually lands so users know the
 // money moved. Only for originally-scheduled transfers; immediate
 // transfers already notify via their own POST /transfers path.
          if (tx.scheduled_at) {
            await db.query(
              `INSERT INTO notifications (user_id, type, title, message)
               VALUES ($1, 'transaction', 'Scheduled Transfer Confirmed', $2)`,
              [tx.sender_user_id, `Your scheduled transfer of $${transferAmount.toFixed(2)} just confirmed on Base. Tx: ${onChainTx.hash.slice(0, 10)}…`]
            ).catch(() => {})
 // Also notify recipient if they're a Nuro user (recipient_user_id populated)
            if (tx.recipient_user_id) {
              await db.query(
                `INSERT INTO notifications (user_id, type, title, message)
                 VALUES ($1, 'transaction', 'Incoming Transfer', $2)`,
                [tx.recipient_user_id, `You received $${transferAmount.toFixed(2)} from a scheduled transfer. Tx: ${onChainTx.hash.slice(0, 10)}…`]
              ).catch(() => {})
            }
          }
          processed++
        } else if (onChainTx) {
          await db.query(
            `UPDATE transfers SET status = 'failed', execution_tx_hash = $1 WHERE id = $2`,
            [onChainTx.hash, tx.id]
          )
          await logExecution(db, {
            entity_type: 'transfer',
            entity_id: tx.id,
            action: 'p2p_retry',
            status: 'failed',
            tx_hash: onChainTx.hash,
            detail: 'Transfer reverted on Base',
            error_message: 'Transaction reverted',
          })
        }
      } catch (err: any) {
        await logExecution(db, {
          entity_type: 'transfer',
          entity_id: tx.id,
          action: 'p2p_retry',
          status: 'failed',
          tx_hash: null,
          detail: `Transfer retry failed`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_transfers',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Transfer sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP 6: SCHEDULED TRANSFERS ────────────────────────────────────────────
//
// Scheduled transfers + withdrawals fire when scheduled_at <= now().
// Promotes status='scheduled' → 'pending', then sweepPendingTransfers handles execution.
// For withdrawals: directly executes the on-chain transfer from deployer wallet.

async function sweepScheduledIntents(db: Pool): Promise<number> {
  let processed = 0
  try {
 // ── Scheduled transfers: promote to 'pending' so sweepPendingTransfers picks them up
    const dueTransfers = await db.query(
      `SELECT id, sender_user_id, amount, scheduled_at FROM transfers
       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
       ORDER BY scheduled_at ASC LIMIT 25`
    )

    for (const t of dueTransfers.rows) {
      await db.query(`UPDATE transfers SET status = 'pending' WHERE id = $1`, [t.id])
      await logExecution(db, {
        entity_type: 'transfer',
        entity_id: t.id,
        action: 'scheduled_promote',
        status: 'success',
        tx_hash: null,
        detail: `Scheduled transfer $${parseFloat(t.amount).toFixed(2)} promoted to pending (was scheduled for ${t.scheduled_at})`,
        error_message: null,
      })
 // Notification to user
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'transaction', 'Scheduled Transfer Executing', $2)`,
        [t.sender_user_id, `Your scheduled transfer of $${parseFloat(t.amount).toFixed(2)} is being processed.`]
      ).catch(() => {})
      processed++
    }

 // ── Scheduled withdrawals: execute directly (deployer wallet → destination)
    const dueWithdrawals = await db.query(
      `SELECT id, user_id, destination_address, amount, token, scheduled_at FROM withdrawals
       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
       ORDER BY scheduled_at ASC LIMIT 25`
    )

    for (const w of dueWithdrawals.rows) {
      try {
        const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL)
        const deployer = new ethers.Wallet(CONFIG.PRIVATE_KEY, baseProvider)
        const usdc = getBaseUsdcContract(deployer)
        const amount = parseFloat(w.amount)
        const amountWei = ethers.utils.parseUnits(amount.toFixed(6), 6)
        const deployerBal = await usdc.balanceOf(deployer.address)

        if (deployerBal.lt(amountWei)) {
          await logExecution(db, {
            entity_type: 'withdrawal',
            entity_id: w.id,
            action: 'scheduled_exec',
            status: 'failed',
            tx_hash: null,
            detail: `Treasury insufficient for scheduled withdrawal $${amount.toFixed(2)}`,
            error_message: 'Insufficient treasury balance',
          })
          continue
        }

        const estGas = await usdc.estimateGas.transfer(w.destination_address, amountWei).catch(() => ethers.BigNumber.from(100000))
        const gasLimit = estGas.mul(130).div(100)
        const tx = await usdc.transfer(w.destination_address, amountWei, { gasLimit })
        const receipt = await tx.wait()

        if (receipt.status === 1) {
          await db.query(
            `UPDATE withdrawals SET status = 'confirmed', tx_hash = $1, completed_at = now() WHERE id = $2`,
            [receipt.transactionHash, w.id]
          )
          await logExecution(db, {
            entity_type: 'withdrawal',
            entity_id: w.id,
            action: 'scheduled_exec',
            status: 'success',
            tx_hash: receipt.transactionHash,
            detail: `Scheduled withdrawal $${amount.toFixed(2)} ${w.token} sent to ${w.destination_address.slice(0,8)}...`,
            error_message: null,
          })
          await db.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'transaction', 'Scheduled Withdrawal Complete', $2)`,
            [w.user_id, `$${amount.toFixed(2)} ${w.token} sent to ${w.destination_address.slice(0,6)}...${w.destination_address.slice(-4)}`]
          ).catch(() => {})
          processed++
        } else {
          await db.query(`UPDATE withdrawals SET status = 'failed' WHERE id = $1`, [w.id])
        }
      } catch (err: any) {
        await db.query(`UPDATE withdrawals SET status = 'failed' WHERE id = $1`, [w.id]).catch(() => {})
        await logExecution(db, {
          entity_type: 'withdrawal',
          entity_id: w.id,
          action: 'scheduled_exec',
          status: 'failed',
          tx_hash: null,
          detail: `Scheduled withdrawal failed`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    console.error('[execution-dispatch] sweepScheduledIntents error:', err.message?.slice(0, 80))
  }
  return processed
}

// ─── MAIN DISPATCH LOOP ──────────────────────────────────────────────────────

let sweepInterval: NodeJS.Timeout | null = null
const SWEEP_INTERVAL_MS = 60_000 // 60 seconds - configurable

export function startExecutionDispatch(db: Pool): void {
  console.log('[execution-dispatch] Starting execution dispatch engine (interval: 60s)')

 // Run immediately on start
  runSweepCycle(db)

 // Then run on interval
  sweepInterval = setInterval(() => runSweepCycle(db), SWEEP_INTERVAL_MS)
}

export function stopExecutionDispatch(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval)
    sweepInterval = null
    console.log('[execution-dispatch] Stopped')
  }
}

async function runSweepCycle(db: Pool): Promise<void> {
  const start = Date.now()
  try {
    const [
      cardTxs, cardSettlements, transfers,
      issuerSyncs, issuerTxSyncs, scheduled,
    ] = await Promise.allSettled([
      sweepPendingCardTransactions(db),
      sweepCardSettlements(db),
      sweepPendingTransfers(db),
      sweepIssuerBalanceSync(db),
      sweepIssuerTransactionSync(db),
      sweepScheduledIntents(db),
    ])

    const results = {
      cardTransactions: cardTxs.status === 'fulfilled' ? cardTxs.value : 0,
      cardSettlements: cardSettlements.status === 'fulfilled' ? cardSettlements.value : 0,
      transfers: transfers.status === 'fulfilled' ? transfers.value : 0,
      issuerSyncs: issuerSyncs.status === 'fulfilled' ? issuerSyncs.value : 0,
      issuerTxSyncs: issuerTxSyncs.status === 'fulfilled' ? issuerTxSyncs.value : 0,
      scheduledIntents: scheduled.status === 'fulfilled' ? scheduled.value : 0,
    }

    const totalProcessed = Object.values(results).reduce((a, b) => a + b, 0)
    const elapsed = Date.now() - start

 // Only log when something happened (keeps logs clean)
    if (totalProcessed > 0) {
      console.log(`[execution-dispatch] Sweep complete in ${elapsed}ms: ${JSON.stringify(results)}`)
    }
  } catch (err: any) {
    console.error('[execution-dispatch] Sweep cycle error:', err.message?.slice(0, 100))
  }
}

// ─── ADMIN API HELPERS ───────────────────────────────────────────────────────

export async function getExecutionLog(db: Pool, options: {
  limit?: number
  offset?: number
  entity_type?: string
  status?: string
}): Promise<any[]> {
  const conditions: string[] = []
  const params: any[] = []
  let paramIdx = 1

  if (options.entity_type) {
    conditions.push(`entity_type = $${paramIdx++}`)
    params.push(options.entity_type)
  }
  if (options.status) {
    conditions.push(`status = $${paramIdx++}`)
    params.push(options.status)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options.limit || 50
  const offset = options.offset || 0

  const result = await db.query(
    `SELECT * FROM execution_log ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  )
  return result.rows
}

export async function getExecutionSummary(db: Pool): Promise<any> {
  const result = await db.query(`
    SELECT
      entity_type,
      status,
      COUNT(*) as count,
      MAX(created_at) as last_at
    FROM execution_log
    WHERE created_at > now() - interval '24 hours'
    GROUP BY entity_type, status
    ORDER BY entity_type, status
  `)

  const pendingTxs = await db.query(`SELECT COUNT(*) FROM card_transactions WHERE status = 'pending'`)
  const pendingBets = await db.query(`SELECT COUNT(*) FROM market_positions WHERE status = 'pending'`)
  const wonUnpaid = await db.query(`SELECT COUNT(*) FROM market_positions WHERE status = 'won' AND payout_tx_hash IS NULL AND payout > 0`)

  return {
    log_summary_24h: result.rows,
    pending_card_transactions: parseInt(pendingTxs.rows[0].count),
    pending_market_bets: parseInt(pendingBets.rows[0].count),
    won_unpaid_positions: parseInt(wonUnpaid.rows[0].count),
  }
}

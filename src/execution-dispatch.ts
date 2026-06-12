/**
 * ─── EXECUTION DISPATCH ENGINE ────────────────────────────────────────────────
 *
 * The bridge between Intent Layer (DB) and Execution Layer (On-Chain).
 *
 * This module runs periodic sweeps to find pending intents and route them
 * to on-chain execution. It never creates fake data — it either executes
 * for real or leaves the intent in pending state with a clear reason.
 *
 * Architecture:
 *   Intent recorded (DB) → Execution Dispatch picks up → On-chain tx → Status updated
 *
 * Three sweep types:
 *   1. Card Transactions:  pending deposits → verify Issuer received bridged USDC → mark completed
 *   2. Market Positions:   pending bets → vault→escrow USDC transfer on Base → mark executed
 *   3. Market Payouts:     won positions → escrow→vault USDC transfer on Base → mark paid
 *
 * All errors are logged to execution_log table for the admin console.
 *
 * Golden Rule: Card balance comes from Issuer ONLY. We never write to cards.balance.
 */

import axios from 'axios'
import { Pool } from 'pg'
import { ethers } from 'ethers'
import { enforceTxCap } from './helm'
import { CONFIG } from './config'
import { syncIssuerBalance, getIssuerTransactions, getUserBaseDepositAddress } from './issuers'
import { syncIssuerTransactions } from './issuer-sync'
import { acquireChainLock, releaseChainLock, getFreshNonce, recordNonceUsed, createFreshWallet } from './nonce-manager'
import { syncCardBalanceFromIssuer } from './card-balance-sync'
import { getAgentPrivateKey, getAgentWalletAddress, getAgentBalance } from './polymarket'
import { runAlphaBotCycle } from './alpha-bot'
import { cctpBurnAndMint } from './bridge'
import {
  calculatePnL,
  calculateReservedForOpenBets,
  calculateFreeBalance,
  computeExpectedAgentBalance,
  shouldAlertDrift,
  shouldSweepProfits,
  shouldEnqueueCardSettlement,
} from './agent-helpers'

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

function deriveEscrowWallet(marketId: string): ethers.utils.HDNode {
  return deriveWallet('market_' + marketId)
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
 * repeated SD3 API calls on every settlement sweep.
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
    console.error('[card-settlement] SD3 address fetch failed for user', userId, ':', err.message?.slice(0, 80))
  }
  return null
}

/**
 * Enqueue a card_settlements row if the user's payout_destination starts with 'card'.
 * Called from sweepMarketPayouts success branch. Uniqueness is enforced by
 * card_settlements.position_id UNIQUE — safe to call multiple times for the same position.
 */
async function enqueueCardSettlement(
  db: Pool,
  userId: string,
  positionId: string | null,
  payoutAmount: number
): Promise<void> {
  if (payoutAmount < MIN_CARD_SETTLEMENT_USD) return

  const userRow = await db.query(
    `SELECT payout_destination, sd3_user_id, issuer_user_id FROM users WHERE id = $1`,
    [userId]
  )
  const dest = userRow.rows[0]?.payout_destination || 'vault'
  if (!dest.startsWith('card')) return  // only 'card' destination enqueues settlements

  const issuerUserId = userRow.rows[0]?.sd3_user_id || userRow.rows[0]?.issuer_user_id
  if (!issuerUserId) {
    console.warn('[card-settlement] user', userId, 'has no Issuer ID — skipping enqueue')
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
// We NEVER write to cards.balance — Issuer is the source of truth.

async function sweepPendingCardTransactions(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT ct.id, ct.user_id, ct.amount, ct.type, ct.name, ct.created_at,
              u.sd3_user_id, u.issuer_user_id
       FROM card_transactions ct
       JOIN users u ON u.id = ct.user_id
       WHERE ct.status = 'pending' AND ct.type = 'deposit'
       ORDER BY ct.created_at ASC
       LIMIT 20`
    )

    for (const tx of pending.rows) {
      const issuerUserId = tx.sd3_user_id || tx.issuer_user_id
      if (!issuerUserId) {
        await logExecution(db, {
          entity_type: 'card_transaction',
          entity_id: tx.id,
          action: 'verify_deposit',
          status: 'skipped',
          tx_hash: null,
          detail: `User ${tx.user_id} has no Issuer ID — cannot verify deposit`,
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
          // Issuer confirmed the deposit — mark as completed
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
          // Check age — if pending > 2 hours, flag as potentially failed
          const ageMs = Date.now() - txCreatedAt
          if (ageMs > 2 * 60 * 60 * 1000) {
            await logExecution(db, {
              entity_type: 'card_transaction',
              entity_id: tx.id,
              action: 'verify_deposit',
              status: 'failed',
              tx_hash: null,
              detail: `Deposit of $${depositAmount.toFixed(2)} pending > 2 hours — may need manual review`,
              error_message: 'Timeout: Issuer has not confirmed deposit after 2 hours',
            })
          }
          // Don't mark as failed yet — Issuer may still be processing
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

// ─── SWEEP 2: PENDING MARKET POSITIONS (bets awaiting execution) ─────────────
//
// When a bet is placed and vault→escrow on-chain transfer fails (no funds, gas, etc.),
// the position is recorded with status='pending'. This sweep retries execution.

async function sweepPendingMarketPositions(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT mp.id, mp.market_id, mp.user_id, mp.side, mp.shares, mp.cost_basis,
              mp.source_chain, mp.created_at
       FROM market_positions mp
       JOIN markets m ON m.id = mp.market_id
       WHERE mp.status = 'pending' AND m.status = 'open'
       ORDER BY mp.created_at ASC
       LIMIT 10`
    )

    for (const pos of pending.rows) {
      try {
        const betAmount = parseFloat(pos.cost_basis)

        // Derive vault and escrow wallets on Base
        const vaultHd = deriveVaultWallet(pos.user_id)
        const escrowHd = deriveEscrowWallet(pos.market_id)

        // Check vault balance on Base
        const vaultBalance = await getBaseUsdcBalance(vaultHd.address)

        if (vaultBalance < betAmount) {
          // Still no funds — leave as pending, log it
          await logExecution(db, {
            entity_type: 'market_position',
            entity_id: pos.id,
            action: 'execute_bet',
            status: 'skipped',
            tx_hash: null,
            detail: `Vault ${vaultHd.address} has $${vaultBalance.toFixed(2)}, needs $${betAmount.toFixed(2)}`,
            error_message: 'Insufficient vault balance',
          })
          continue
        }

        // Helm HELM-105 — value cap on the bet move (vault→escrow).
        // USDC == USD 1:1. Observe-only by default.
        await enforceTxCap({
          source: 'execution-bet',
          txKind: 'transfer',
          valueUsd: betAmount,
          chainId: 8453,
          fromAddress: vaultHd.address,
          toAddress: escrowHd.address,
          agentId: pos.user_id,
        })

        // Sprint A hardening: per-address chain lock + fresh nonce.
        // Different users' vaults execute concurrently; same vault serializes.
        await acquireChainLock(8453, vaultHd.address)
        let tx: ethers.ContractTransaction | null = null
        let receipt: ethers.ContractReceipt | null = null
        try {
          const vaultSigner = createFreshWallet(vaultHd.privateKey, 8453)
          const usdc = getBaseUsdcContract(vaultSigner)
          const amountWei = ethers.utils.parseUnits(betAmount.toFixed(6), 6)
          const nonce = await getFreshNonce(8453, vaultHd.address)
          const estGas = await usdc.estimateGas.transfer(escrowHd.address, amountWei).catch(() => ethers.BigNumber.from(100000))
          const gasLimit = estGas.mul(130).div(100)
          tx = await usdc.transfer(escrowHd.address, amountWei, { gasLimit, nonce })
          receipt = await tx!.wait()
          recordNonceUsed(8453, nonce, vaultHd.address)
        } finally {
          releaseChainLock(8453, vaultHd.address)
        }

        if (receipt && receipt.status === 1 && tx) {
          // Execution succeeded — update position and AMM pools
          await db.query(
            `UPDATE market_positions SET status = 'executed', execution_tx_hash = $1, executed_at = now() WHERE id = $2`,
            [tx.hash, pos.id]
          )

          // Update AMM pools now that real money moved
          const poolCol = pos.side === 'yes' ? 'yes_pool' : 'no_pool'
          await db.query(
            `UPDATE markets SET ${poolCol} = ${poolCol} + $1, total_volume = total_volume + $1 WHERE id = $2`,
            [betAmount, pos.market_id]
          )

          await logExecution(db, {
            entity_type: 'market_position',
            entity_id: pos.id,
            action: 'execute_bet',
            status: 'success',
            tx_hash: tx.hash,
            detail: `$${betAmount.toFixed(2)} transferred vault→escrow on Base. Market ${pos.market_id}, side=${pos.side}`,
            error_message: null,
          })
          processed++
        } else if (tx) {
          // Transaction reverted
          await db.query(
            `UPDATE market_positions SET status = 'failed', execution_tx_hash = $1 WHERE id = $2`,
            [tx.hash, pos.id]
          )
          await logExecution(db, {
            entity_type: 'market_position',
            entity_id: pos.id,
            action: 'execute_bet',
            status: 'failed',
            tx_hash: tx.hash,
            detail: `On-chain transfer reverted`,
            error_message: 'Transaction reverted on Base',
          })
        }
      } catch (err: any) {
        await logExecution(db, {
          entity_type: 'market_position',
          entity_id: pos.id,
          action: 'execute_bet',
          status: 'failed',
          tx_hash: null,
          detail: `Execution attempt failed for position ${pos.id}`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_market_positions',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Market position sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP 3: MARKET PAYOUTS (won positions awaiting payout) ─────────────────
//
// When a market resolves, winning positions are marked 'won' with a payout amount.
// This sweep executes the on-chain transfer: escrow → winner's vault on Base.

async function sweepMarketPayouts(db: Pool): Promise<number> {
  let processed = 0
  try {
    const wonPositions = await db.query(
      `SELECT mp.id, mp.market_id, mp.user_id, mp.payout, mp.payout_tx_hash
       FROM market_positions mp
       WHERE mp.status = 'won' AND mp.payout > 0 AND mp.payout_tx_hash IS NULL
       ORDER BY mp.created_at ASC
       LIMIT 10`
    )

    for (const pos of wonPositions.rows) {
      try {
        const payoutAmount = parseFloat(pos.payout)
        const escrowHd = deriveEscrowWallet(pos.market_id)
        const vaultHd = deriveVaultWallet(pos.user_id)

        // Check escrow balance
        const escrowBalance = await getBaseUsdcBalance(escrowHd.address)

        if (escrowBalance < payoutAmount) {
          await logExecution(db, {
            entity_type: 'market_payout',
            entity_id: pos.id,
            action: 'execute_payout',
            status: 'skipped',
            tx_hash: null,
            detail: `Escrow ${escrowHd.address} has $${escrowBalance.toFixed(2)}, needs $${payoutAmount.toFixed(2)} for payout`,
            error_message: 'Insufficient escrow balance',
          })
          continue
        }

        // Helm HELM-105 — value cap on payout (escrow→vault).
        await enforceTxCap({
          source: 'execution-payout',
          txKind: 'transfer',
          valueUsd: payoutAmount,
          chainId: 8453,
          fromAddress: escrowHd.address,
          toAddress: vaultHd.address,
          agentId: pos.user_id,
        })

        // Sprint A hardening: chain lock on escrow address (signer).
        // Different markets' escrows pay out concurrently; same escrow serializes.
        await acquireChainLock(8453, escrowHd.address)
        let tx: ethers.ContractTransaction | null = null
        let receipt: ethers.ContractReceipt | null = null
        try {
          const escrowSigner = createFreshWallet(escrowHd.privateKey, 8453)
          const usdc = getBaseUsdcContract(escrowSigner)
          const amountWei = ethers.utils.parseUnits(payoutAmount.toFixed(6), 6)
          const nonce = await getFreshNonce(8453, escrowHd.address)
          const estGas = await usdc.estimateGas.transfer(vaultHd.address, amountWei).catch(() => ethers.BigNumber.from(100000))
          const gasLimit = estGas.mul(130).div(100)
          tx = await usdc.transfer(vaultHd.address, amountWei, { gasLimit, nonce })
          receipt = await tx!.wait()
          recordNonceUsed(8453, nonce, escrowHd.address)
        } finally {
          releaseChainLock(8453, escrowHd.address)
        }

        if (receipt && receipt.status === 1 && tx) {
          await db.query(
            `UPDATE market_positions SET payout_tx_hash = $1, paid_at = now() WHERE id = $2`,
            [tx.hash, pos.id]
          )
          await logExecution(db, {
            entity_type: 'market_payout',
            entity_id: pos.id,
            action: 'execute_payout',
            status: 'success',
            tx_hash: tx.hash,
            detail: `$${payoutAmount.toFixed(2)} paid out escrow→vault on Base for user ${pos.user_id}`,
            error_message: null,
          })

          // Sprint B: enqueue card settlement if user opted in
          await enqueueCardSettlement(db, pos.user_id, pos.id, payoutAmount).catch(async (e: any) => {
            console.error('[card-settlement] enqueue error:', e.message?.slice(0, 80))
            await logExecution(db, {
              entity_type: 'card_settlement',
              entity_id: pos.id,
              action: 'enqueue',
              status: 'failed',
              tx_hash: null,
              detail: `Failed to enqueue card settlement for position ${pos.id} (user ${pos.user_id}, $${payoutAmount.toFixed(2)})`,
              error_message: e.message?.slice(0, 200) || 'enqueue failed',
            }).catch(() => {})
          })

          processed++
        } else if (tx) {
          await logExecution(db, {
            entity_type: 'market_payout',
            entity_id: pos.id,
            action: 'execute_payout',
            status: 'failed',
            tx_hash: tx.hash,
            detail: `Payout transfer reverted on Base`,
            error_message: 'Transaction reverted',
          })
        }
      } catch (err: any) {
        await logExecution(db, {
          entity_type: 'market_payout',
          entity_id: pos.id,
          action: 'execute_payout',
          status: 'failed',
          tx_hash: null,
          detail: `Payout execution failed for position ${pos.id}`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_market_payouts',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Market payout sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP 3.4: CREATOR PAYOUTS (Sprint C — stake refund + reward) ───────────
//
// Resolved markets pay the creator: (a) refund the $5 stake from escrow → vault,
// (b) pay 0.5% of total_volume as creator reward from escrow → vault.
// Both txs in a single chain-lock on the escrow address (sequential nonces).
// If creator opted into 'card' payout_destination, reuse Sprint B's enqueue to
// auto-settle the reward to their Visa.

async function sweepCreatorPayouts(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT m.id, m.creator_id, m.total_volume, m.creator_stake, m.creator_reward_amount,
              m.creator_stake_refund_tx_hash, m.creator_reward_tx_hash, m.escrow_address,
              u.payout_destination
       FROM markets m
       JOIN users u ON u.id = m.creator_id
       WHERE m.status = 'resolved'
         AND m.creator_paid_at IS NULL
         AND (m.creator_stake > 0 OR m.creator_reward_amount > 0)
       ORDER BY m.resolved_at ASC
       LIMIT 10`
    )

    for (const row of pending.rows) {
      try {
        const escrowHd = deriveEscrowWallet(row.id)
        const creatorVault = deriveVaultWallet(row.creator_id)
        const stake = parseFloat(row.creator_stake || '0')
        const reward = parseFloat(row.creator_reward_amount || '0')
        const needRefund = stake > 0 && !row.creator_stake_refund_tx_hash
        const needReward = reward > 0 && !row.creator_reward_tx_hash
        const totalNeeded = (needRefund ? stake : 0) + (needReward ? reward : 0)

        if (totalNeeded <= 0) {
          // Already paid out on a prior attempt — just stamp completion
          await db.query(
            `UPDATE markets SET creator_paid_at = now() WHERE id = $1`, [row.id]
          )
          continue
        }

        const escrowBalance = await getBaseUsdcBalance(escrowHd.address)
        if (escrowBalance < totalNeeded) {
          await logExecution(db, {
            entity_type: 'creator_payout',
            entity_id: row.id,
            action: 'execute_creator_payout',
            status: 'skipped',
            tx_hash: null,
            detail: `Escrow has $${escrowBalance.toFixed(2)}, needs $${totalNeeded.toFixed(2)} (stake=${stake}, reward=${reward})`,
            error_message: 'Insufficient escrow balance',
          })
          continue
        }

        let refundTxHash: string | null = row.creator_stake_refund_tx_hash || null
        let rewardTxHash: string | null = row.creator_reward_tx_hash || null

        await acquireChainLock(8453, escrowHd.address)
        try {
          const escrowSigner = createFreshWallet(escrowHd.privateKey, 8453)
          const usdc = getBaseUsdcContract(escrowSigner)
          let nonce = await getFreshNonce(8453, escrowHd.address)

          if (needRefund) {
            // Helm HELM-105 — creator stake refund cap.
            await enforceTxCap({
              source: 'execution-creator-refund',
              txKind: 'transfer',
              valueUsd: stake,
              chainId: 8453,
              fromAddress: escrowHd.address,
              toAddress: creatorVault.address,
              agentId: row.creator_id,
            })
            const wei = ethers.utils.parseUnits(stake.toFixed(6), 6)
            const gas = await usdc.estimateGas.transfer(creatorVault.address, wei).catch(() => ethers.BigNumber.from(100000))
            const gasLimit = gas.mul(130).div(100)
            const tx = await usdc.transfer(creatorVault.address, wei, { gasLimit, nonce })
            await tx.wait()
            recordNonceUsed(8453, nonce, escrowHd.address)
            refundTxHash = tx.hash
            nonce++
            await db.query(`UPDATE markets SET creator_stake_refund_tx_hash = $1 WHERE id = $2`, [refundTxHash, row.id])
          }

          if (needReward) {
            // Helm HELM-105 — creator reward cap.
            await enforceTxCap({
              source: 'execution-creator-reward',
              txKind: 'transfer',
              valueUsd: reward,
              chainId: 8453,
              fromAddress: escrowHd.address,
              toAddress: creatorVault.address,
              agentId: row.creator_id,
            })
            const wei = ethers.utils.parseUnits(reward.toFixed(6), 6)
            const gas = await usdc.estimateGas.transfer(creatorVault.address, wei).catch(() => ethers.BigNumber.from(100000))
            const gasLimit = gas.mul(130).div(100)
            const tx = await usdc.transfer(creatorVault.address, wei, { gasLimit, nonce })
            await tx.wait()
            recordNonceUsed(8453, nonce, escrowHd.address)
            rewardTxHash = tx.hash
            await db.query(`UPDATE markets SET creator_reward_tx_hash = $1 WHERE id = $2`, [rewardTxHash, row.id])
          }
        } finally {
          releaseChainLock(8453, escrowHd.address)
        }

        await db.query(`UPDATE markets SET creator_paid_at = now() WHERE id = $1`, [row.id])

        // Sprint B re-use: if creator chose 'card' payout, auto-settle the reward
        if (needReward && reward > 0 && row.payout_destination && row.payout_destination.startsWith('card')) {
          await enqueueCardSettlement(db, row.creator_id, null, reward).catch(async (e: any) => {
            await logExecution(db, {
              entity_type: 'creator_payout',
              entity_id: row.id,
              action: 'enqueue_card_settlement',
              status: 'failed',
              tx_hash: null,
              detail: `Failed to enqueue creator reward card settlement`,
              error_message: e.message?.slice(0, 200) || 'enqueue failed',
            }).catch(() => {})
          })
        }

        await logExecution(db, {
          entity_type: 'creator_payout',
          entity_id: row.id,
          action: 'execute_creator_payout',
          status: 'success',
          tx_hash: rewardTxHash || refundTxHash,
          detail: `Stake refund $${stake.toFixed(2)} + reward $${reward.toFixed(2)} → creator ${row.creator_id}`,
          error_message: null,
        })
        processed++
      } catch (err: any) {
        await logExecution(db, {
          entity_type: 'creator_payout',
          entity_id: row.id,
          action: 'execute_creator_payout',
          status: 'failed',
          tx_hash: null,
          detail: `Creator payout attempt failed for market ${row.id}`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_creator_payouts',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Creator payout sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP 3.5: CARD SETTLEMENTS (Sprint B — vault → Issuer) ─────────────────
//
// When a market payout lands in the user's vault and their payout_destination='card',
// sweepMarketPayouts enqueues a card_settlements row. This sweep executes those:
// vault → FEE_VAULT (5%), vault → Issuer Base deposit (95%). The Issuer SD3
// infrastructure detects the Base deposit and credits the Visa card automatically.

async function sweepCardSettlements(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT cs.id, cs.user_id, cs.position_id, cs.amount, cs.fee_amount, cs.forward_amount,
              cs.destination, cs.issuer_address, cs.fee_tx_hash, cs.forward_tx_hash,
              cs.attempt_count, cs.created_at, cs.metadata,
              u.sd3_user_id, u.issuer_user_id
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

        // Max attempts exhausted — fail + surface to admin
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
          const issuerUserId = row.sd3_user_id || row.issuer_user_id
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

        // Execute two sequential txs inside a single chain lock — mirrors bridge.ts:447-469
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
          // money moved" event — same semantic as crediting card
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
// This is a READ — Issuer is the source of truth. We store the cached value
// so the frontend can display it without calling Issuer every render.

async function sweepIssuerBalanceSync(db: Pool): Promise<number> {
  let synced = 0
  try {
    // Day-4 fix: only sweep cards linked to an actual SD3 issuer card. Phantom
    // deck-stack rows (issuer_card_id IS NULL) used to get the user-level
    // Issuer balance stamped on top of their seeded values, breaking the
    // demo accounts. Skip them at the query level.
    const users = await db.query(
      `SELECT DISTINCT u.id, u.sd3_user_id, u.issuer_user_id, c.id as card_id, c.balance as db_balance
       FROM users u
       JOIN cards c ON c.user_id = u.id AND c.is_active = true AND c.issuer_card_id IS NOT NULL
       WHERE (u.sd3_user_id IS NOT NULL OR u.issuer_user_id IS NOT NULL)
       ORDER BY u.id
       LIMIT 50`
    )

    for (const user of users.rows) {
      const issuerUserId = user.sd3_user_id || user.issuer_user_id
      try {
        // Sprint D: shared helper handles Issuer fetch, drift gate, alert, log
        const oldBalance = parseFloat(user.db_balance || '0')
        const outcome = await syncCardBalanceFromIssuer(db, user.card_id, issuerUserId, oldBalance, 'sweep')
        if (outcome.updated) synced++
      } catch (err: any) {
        // Don't log every sync failure as an error — Issuer may rate limit us
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
// Pulls Visa spend data from SD3's /transactions endpoint and upserts into
// card_transactions. Throttled per-user via users.last_tx_synced_at so we only
// hit SD3 every ~15 minutes per user. Complements the webhook push path.

const ISSUER_TX_SYNC_INTERVAL_MINUTES = 15
const ISSUER_TX_SYNC_USERS_PER_CYCLE = 50

async function sweepIssuerTransactionSync(db: Pool): Promise<number> {
  let synced = 0
  try {
    const users = await db.query(
      `SELECT id
       FROM users
       WHERE (sd3_user_id IS NOT NULL OR issuer_user_id IS NOT NULL)
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
          // Session 27 — Sprint 2.6 finisher. Scheduled transfers already
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

// ─── SPRINT 2.3: AGENT EXECUTION SWEEPS ──────────────────────────────────────
//
// Five sweeps that move the bot lifecycle:
//   (1) sweepAgentFundings       — user vault (Base) → agent wallet (Polygon) via CCTP
//   (2) sweepAlphaBotCycle       — scans markets, places real CLOB trades via alpha-bot
//   (3) sweepAgentBetSettlements — Gamma API poll, transitions agent_bets.status
//   (4) sweepAgentProfits        — threshold-triggered Polygon → Base CCTP sweep
//   (5) reconcileAgentPnL        — drift alert (Sprint D pattern) on every cycle
//
// Locking model (matches Sprint 2.1 Slice-1a + system-design doc):
//   • Advisory lock keyed `hashtext('agent_' || agentId)` around every agent-scoped op
//   • Chain lock on agent wallet address (137 for Polygon) for actual USDC moves
//   • Reconcile is read-only — no lock

const GAMMA_API = 'https://gamma-api.polymarket.com/markets'
const AGENT_BET_SETTLEMENT_BATCH = 25

/**
 * Acquire a PostgreSQL advisory lock keyed off an agent_id. Matches the pattern
 * used in nuro-routes.ts:2760 for user-scoped serialization. Returns the client
 * holding the lock — caller MUST release it by calling .release() on the client
 * after the transaction completes.
 *
 * Uses session lock (not xact_lock) so it can wrap multiple queries.
 * Caller must ALWAYS release — wrap in try/finally.
 */
async function acquireAgentLock(db: Pool, agentId: string): Promise<{ client: any; release: () => Promise<void> }> {
  const client = await db.connect()
  try {
    const res = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1)::bigint) as acquired`,
      ['agent_' + agentId]
    )
    const acquired = res.rows[0]?.acquired
    if (!acquired) {
      client.release()
      throw new Error(`Agent ${agentId} is locked by another sweep cycle`)
    }
    return {
      client,
      release: async () => {
        try {
          await client.query(`SELECT pg_advisory_unlock(hashtext($1)::bigint)`, ['agent_' + agentId])
        } finally {
          client.release()
        }
      },
    }
  } catch (err) {
    client.release()
    throw err
  }
}

// ─── SWEEP: AGENT FUNDINGS (Base → Polygon CCTP) ─────────────────────────────
//
// Reads pending agent_fundings rows (created by POST /agents/:id/fund) and moves
// USDC from the user's Base vault into the agent's Polygon wallet via CCTP.
//
// **Observe-only mode** (CONFIG.AGENT_FUNDING_OBSERVE_ONLY = true until Monday):
// The sweep records the intent in execution_log and marks the row
// 'skipped_observe_only' — NO on-chain tx. Flip the flag to activate live.
//
// Base → Polygon reverse CCTP requires a companion function (mirror of
// cctpBurnAndMint with parameterized destination domain). Tracked in tech-debt;
// ships as a slice-2 follow-up when live funding begins.

async function sweepAgentFundings(db: Pool): Promise<number> {
  let processed = 0
  try {
    const pending = await db.query(
      `SELECT af.id, af.agent_id, af.user_id, af.amount, af.attempt_count,
              a.wallet_address as agent_wallet
       FROM agent_fundings af
       JOIN agents a ON a.id = af.agent_id
       WHERE af.status = 'pending'
       ORDER BY af.created_at ASC
       LIMIT 10`
    )

    for (const row of pending.rows) {
      const amount = parseFloat(row.amount)
      const agentId: string = row.agent_id

      if (CONFIG.AGENT_FUNDING_OBSERVE_ONLY) {
        await db.query(
          `UPDATE agent_fundings SET status = 'skipped_observe_only',
             error_message = 'Observe-only mode; flip AGENT_FUNDING_OBSERVE_ONLY=false to activate',
             completed_at = now() WHERE id = $1`,
          [row.id]
        )
        await logExecution(db, {
          entity_type: 'agent_funding',
          entity_id: row.id,
          action: 'observe_only',
          status: 'skipped',
          tx_hash: null,
          detail: `Would fund agent ${agentId} with $${amount.toFixed(2)} Base→Polygon (observe-only)`,
          error_message: null,
        })
        processed++
        continue
      }

      // Live mode — not shipped in slice-1. Reverse CCTP Base→Polygon goes here.
      await db.query(
        `UPDATE agent_fundings SET status = 'failed',
           error_message = 'Live Base→Polygon CCTP not yet implemented (slice-2)',
           attempt_count = attempt_count + 1, last_attempted_at = now() WHERE id = $1`,
        [row.id]
      )
      await logExecution(db, {
        entity_type: 'agent_funding',
        entity_id: row.id,
        action: 'execute_funding',
        status: 'failed',
        tx_hash: null,
        detail: `Base→Polygon CCTP pending slice-2`,
        error_message: 'not_implemented',
      })
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_agent_fundings',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Agent funding sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP: ALPHA BOT CYCLE (wraps alpha-bot.runAlphaBotCycle) ──────────────
//
// Existing alpha-bot.ts implements the strategy logic (opportunity scan, CLOB
// post, DB record). This wrapper adds the CONFIG.AGENT_CLOB_TRADES_ENABLED
// feature flag for live-vs-observe, and handles cycle-level error logging so
// a single bad opportunity doesn't kill the whole cycle.
//
// Advisory lock is NOT held here — runAlphaBotCycle already dedupes at the
// per-market level (alpha-bot.ts:161 `betMarkets.has(opp.marketId)`).

async function sweepAlphaBotCycle(db: Pool): Promise<number> {
  if (!CONFIG.AGENT_CLOB_TRADES_ENABLED) {
    // Observe-only until live trading is authorized. Bets still queue via the
    // POST /agents/:id/bets endpoint's queued-fallback path.
    return 0
  }

  try {
    await runAlphaBotCycle(db)
    return 1
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'agent_cycle',
      entity_id: 'alpha_bot',
      action: 'run_cycle',
      status: 'failed',
      tx_hash: null,
      detail: 'Alpha bot cycle threw',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
    return 0
  }
}

// ─── SWEEP: AGENT BET SETTLEMENTS (Gamma API poll) ──────────────────────────
//
// Transitions agent_bets.status=open → won/lost using Polymarket Gamma API
// market resolution. PnL computed via pure helper calculatePnL (tested A1).
// Updates rolling agents.win_count/loss_count/total_profit.
//
// No on-chain calls here — this is DB-only intent-layer reconciliation. The
// actual USDC lands in the agent wallet via Polymarket's own redemption path;
// sweepAgentProfits picks it up once balance crosses threshold.

async function sweepAgentBetSettlements(db: Pool): Promise<number> {
  let processed = 0
  try {
    const openBets = await db.query(
      `SELECT ab.id, ab.agent_id, ab.user_id, ab.market_id, ab.market_question,
              ab.outcome, ab.amount, ab.entry_price
       FROM agent_bets ab
       WHERE ab.status = 'open'
       ORDER BY ab.created_at ASC
       LIMIT $1`,
      [AGENT_BET_SETTLEMENT_BATCH]
    )

    if (!openBets.rows.length) return 0

    // Collect unique market_ids and batch-fetch Gamma status (one API call per market).
    const marketIds = [...new Set(openBets.rows.map((b: any) => b.market_id))]
    const marketData: Record<string, any> = {}

    for (const marketId of marketIds) {
      try {
        const resp = await axios.get(`${GAMMA_API}/${marketId}`, { timeout: 10000 })
        marketData[marketId as string] = resp.data
      } catch (err: any) {
        // Skip this market this cycle; try again next cycle
        if (err.response?.status !== 404) {
          console.error('[agent-bet-settlement] Gamma fetch failed for', marketId, ':', err.message?.slice(0, 80))
        }
      }
    }

    for (const bet of openBets.rows) {
      const market = marketData[bet.market_id]
      if (!market || !market.closed) continue // still open; skip

      const betOutcome = String(bet.outcome).toLowerCase()
      const winningOutcome = market.outcome ? String(market.outcome).toLowerCase() : null

      if (!winningOutcome) {
        // Market is closed but outcome not published yet — skip for now, retry next cycle
        continue
      }

      const amount = parseFloat(bet.amount)
      const entryPrice = parseFloat(bet.entry_price)
      const won = betOutcome === winningOutcome

      let pnl: number
      try {
        pnl = calculatePnL(amount, entryPrice, won)
      } catch (e: any) {
        await logExecution(db, {
          entity_type: 'agent_bet_settlement',
          entity_id: bet.id,
          action: 'calculate_pnl',
          status: 'failed',
          tx_hash: null,
          detail: `PnL calc threw for bet ${bet.id}`,
          error_message: e.message?.slice(0, 200) || 'Unknown error',
        })
        continue
      }

      const { client, release } = await acquireAgentLock(db, bet.agent_id).catch(() => ({ client: null, release: async () => {} } as any))
      if (!client) continue  // another cycle has the lock; skip

      try {
        await client.query(
          `UPDATE agent_bets SET status = $1, exit_price = $2, pnl = $3, settled_at = now()
           WHERE id = $4 AND status = 'open'`,
          [won ? 'won' : 'lost', winningOutcome === betOutcome ? 1.0 : 0.0, pnl, bet.id]
        )

        await client.query(
          `UPDATE agents SET
             win_count  = win_count + ${won ? 1 : 0},
             loss_count = loss_count + ${won ? 0 : 1},
             total_profit = total_profit + $1,
             updated_at = now()
           WHERE id = $2`,
          [pnl, bet.agent_id]
        )

        await logExecution(db, {
          entity_type: 'agent_bet_settlement',
          entity_id: bet.id,
          action: 'settle',
          status: 'success',
          tx_hash: null,
          detail: `Agent ${bet.agent_id} bet ${won ? 'WON' : 'lost'} $${amount.toFixed(2)} @ ${entryPrice} on "${bet.market_question?.slice(0, 60)}" → pnl=$${pnl.toFixed(2)}`,
          error_message: null,
        })
        processed++
      } finally {
        await release()
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_agent_bet_settlements',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Agent bet settlement sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP: AGENT PROFITS (Polygon → Base via CCTP, then card-settle if opted) ─
//
// Per active agent:
//   1. Read on-chain USDC balance on Polygon (agent wallet)
//   2. Subtract reserved_for_open_bets (open + queued bets)
//   3. If free >= AGENT_MIN_SWEEP_USD: insert agent_profit_sweeps row, then
//      cctpBurnAndMint from Polygon → user's Base vault
//   4. On completion: increment agents.total_swept, log execution
//   5. If user's payout_destination starts with 'card': enqueueCardSettlement
//      on the user's vault so Sprint B's sweepCardSettlements forwards to Issuer
//
// Chain lock: chain 137 on agent wallet address. Advisory lock on agent_id.

async function sweepAgentProfits(db: Pool): Promise<number> {
  // Gate: profit sweeps move real USDC cross-chain. Off by default; explicit
  // enablement after the agent-profit-sweep-live gate-check passes.
  if (!CONFIG.AGENT_PROFIT_SWEEP_ENABLED) return 0

  let processed = 0
  try {
    const activeAgents = await db.query(
      `SELECT a.id, a.user_id, a.wallet_address, u.payout_destination
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'active'
         AND a.wallet_address IS NOT NULL
       ORDER BY a.updated_at DESC
       LIMIT 20`
    )

    for (const agent of activeAgents.rows) {
      let lockHandle: { client: any; release: () => Promise<void> } | null = null
      try {
        lockHandle = await acquireAgentLock(db, agent.id).catch(() => null)
        if (!lockHandle) continue

        // Read current balance on Polygon (uses polymarket.ts helper — USDC_POLYGON cached there)
        const onChainBalance = await getAgentBalance(agent.id).catch(() => 0)

        // Reserved capital = sum of open/queued bet amounts
        const openBetsRes = await db.query(
          `SELECT amount, status FROM agent_bets WHERE agent_id = $1 AND status IN ('open', 'queued')`,
          [agent.id]
        )
        const reserved = calculateReservedForOpenBets(
          openBetsRes.rows.map((r: any) => ({ amount: r.amount, status: r.status }))
        )
        const free = calculateFreeBalance(onChainBalance, reserved)

        if (!shouldSweepProfits(free, CONFIG.AGENT_MIN_SWEEP_USD)) continue

        // Enqueue + execute. Insert intent row first for audit trail.
        const sweepRow = await db.query(
          `INSERT INTO agent_profit_sweeps (id, agent_id, user_id, amount, destination, status, attempt_count, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'burning', 1, now())
           RETURNING id`,
          [agent.id, agent.user_id, free, agent.payout_destination || 'vault']
        )
        const sweepId = sweepRow.rows[0].id

        // Execute CCTP Polygon → Base. Destination: user's Base vault wallet.
        const vaultHd = deriveVaultWallet(agent.user_id)
        const amountWei = ethers.utils.parseUnits(free.toFixed(6), 6)

        await acquireChainLock(137, getAgentWalletAddress(agent.id))
        let burnTxHash: string | null = null
        try {
          burnTxHash = await cctpBurnAndMint(
            getAgentPrivateKey(agent.id),
            CONFIG.RPC_URL_POLYGON,
            137,
            CONFIG.USDC_POLYGON,
            amountWei,
            vaultHd.address,
            6
          )
        } finally {
          releaseChainLock(137, getAgentWalletAddress(agent.id))
        }

        await db.query(
          `UPDATE agent_profit_sweeps SET status = 'completed', burn_tx_hash = $1, completed_at = now()
           WHERE id = $2`,
          [burnTxHash, sweepId]
        )

        await db.query(
          `UPDATE agents SET total_swept = total_swept + $1, updated_at = now() WHERE id = $2`,
          [free, agent.id]
        )

        await logExecution(db, {
          entity_type: 'agent_profit_sweep',
          entity_id: sweepId,
          action: 'execute_sweep',
          status: 'success',
          tx_hash: burnTxHash,
          detail: `Swept $${free.toFixed(2)} from agent ${agent.id} Polygon wallet → user vault on Base`,
          error_message: null,
        })

        // If user chose card payout: reuse Sprint B card-settle path.
        // sweepCardSettlements (already in this file) will fee + forward to Issuer.
        if (shouldEnqueueCardSettlement(agent.payout_destination)) {
          await enqueueCardSettlement(db, agent.user_id, null, free).catch((e: any) => {
            console.error('[agent-profit-sweep] enqueueCardSettlement failed:', e.message?.slice(0, 80))
          })
        }

        processed++
      } catch (err: any) {
        await logExecution(db, {
          entity_type: 'agent_profit_sweep',
          entity_id: agent.id,
          action: 'execute_sweep',
          status: 'failed',
          tx_hash: null,
          detail: `Profit sweep failed for agent ${agent.id}`,
          error_message: err.message?.slice(0, 200) || 'Unknown error',
        })
      } finally {
        if (lockHandle) await lockHandle.release()
      }
    }
  } catch (err: any) {
    await logExecution(db, {
      entity_type: 'error',
      entity_id: 'sweep_agent_profits',
      action: 'sweep',
      status: 'failed',
      tx_hash: null,
      detail: 'Agent profit sweep failed',
      error_message: err.message?.slice(0, 200) || 'Unknown error',
    })
  }
  return processed
}

// ─── SWEEP: RECONCILE AGENT P&L (Sprint D drift-alert pattern) ──────────────
//
// For every active agent, compare:
//   expected = total_funded - total_invested + sum(won payouts) - total_swept
//   actual   = balanceOf(agent_wallet_polygon)
//
// Drift > AGENT_PNL_DRIFT_ALERT_USD surfaces an alert to execution_log.
// This catches silent divergence: failed CCTP that didn't update totals,
// partial Polymarket redeems, or unexpected wallet withdrawals.
//
// Read-only (no locks, no tx). Writes agents.last_reconciled_at + drift value.

async function reconcileAgentPnL(db: Pool): Promise<number> {
  let reconciled = 0
  try {
    const agents = await db.query(
      `SELECT a.id, a.total_funded, a.total_invested, a.total_swept, a.wallet_address
       FROM agents a
       WHERE a.status = 'active' AND a.wallet_address IS NOT NULL
       ORDER BY a.last_reconciled_at NULLS FIRST
       LIMIT 20`
    )

    for (const agent of agents.rows) {
      try {
        // Sum payouts from won bets (shares ≠ amount, so can't reuse total_invested)
        const payoutsRes = await db.query(
          `SELECT COALESCE(SUM(amount + pnl), 0) as won_payouts
           FROM agent_bets WHERE agent_id = $1 AND status = 'won' AND pnl IS NOT NULL`,
          [agent.id]
        )
        const wonPayouts = parseFloat(payoutsRes.rows[0].won_payouts || '0')

        const expected = computeExpectedAgentBalance({
          totalFunded: agent.total_funded || 0,
          totalInvested: agent.total_invested || 0,
          wonPayouts,
          totalSwept: agent.total_swept || 0,
        })
        const actual = await getAgentBalance(agent.id).catch(() => 0)
        const drift = +(actual - expected).toFixed(6)

        await db.query(
          `UPDATE agents SET last_reconciled_at = now(), last_pnl_drift_usd = $1 WHERE id = $2`,
          [drift, agent.id]
        )

        if (shouldAlertDrift(expected, actual, CONFIG.AGENT_PNL_DRIFT_ALERT_USD)) {
          await logExecution(db, {
            entity_type: 'agent_reconcile',
            entity_id: agent.id,
            action: 'drift_alert',
            status: 'failed',
            tx_hash: null,
            detail: `Agent ${agent.id} drift: expected=$${expected.toFixed(2)}, actual=$${actual.toFixed(2)}, delta=${drift >= 0 ? '+' : ''}$${drift.toFixed(2)} (>|$${CONFIG.AGENT_PNL_DRIFT_ALERT_USD}|)`,
            error_message: 'pnl_drift_detected',
          })
        }
        reconciled++
      } catch (err: any) {
        // Reconcile errors are non-fatal — log once, try next agent
        if (!err.message?.includes('404') && !err.message?.includes('rate')) {
          await logExecution(db, {
            entity_type: 'agent_reconcile',
            entity_id: agent.id,
            action: 'reconcile',
            status: 'failed',
            tx_hash: null,
            detail: `Reconcile threw for agent ${agent.id}`,
            error_message: err.message?.slice(0, 200) || 'Unknown error',
          })
        }
      }
    }
  } catch (err: any) {
    console.error('[reconcile-agent-pnl] Sweep error:', err.message?.slice(0, 80))
  }
  return reconciled
}

// ─── MAIN DISPATCH LOOP ──────────────────────────────────────────────────────

let sweepInterval: NodeJS.Timeout | null = null
const SWEEP_INTERVAL_MS = 60_000 // 60 seconds — configurable

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
      cardTxs, marketBets, payouts, creatorPayouts, cardSettlements, transfers,
      issuerSyncs, issuerTxSyncs, scheduled,
      agentFundings, agentCycles, agentBetSettles, agentProfits, agentReconciles,
    ] = await Promise.allSettled([
      sweepPendingCardTransactions(db),
      sweepPendingMarketPositions(db),
      sweepMarketPayouts(db),
      sweepCreatorPayouts(db),
      sweepCardSettlements(db),
      sweepPendingTransfers(db),
      sweepIssuerBalanceSync(db),
      sweepIssuerTransactionSync(db),
      sweepScheduledIntents(db),
      // Sprint 2.3
      sweepAgentFundings(db),
      sweepAlphaBotCycle(db),
      sweepAgentBetSettlements(db),
      sweepAgentProfits(db),
      reconcileAgentPnL(db),
    ])

    const results = {
      cardTransactions: cardTxs.status === 'fulfilled' ? cardTxs.value : 0,
      marketBets: marketBets.status === 'fulfilled' ? marketBets.value : 0,
      payouts: payouts.status === 'fulfilled' ? payouts.value : 0,
      creatorPayouts: creatorPayouts.status === 'fulfilled' ? creatorPayouts.value : 0,
      cardSettlements: cardSettlements.status === 'fulfilled' ? cardSettlements.value : 0,
      transfers: transfers.status === 'fulfilled' ? transfers.value : 0,
      issuerSyncs: issuerSyncs.status === 'fulfilled' ? issuerSyncs.value : 0,
      issuerTxSyncs: issuerTxSyncs.status === 'fulfilled' ? issuerTxSyncs.value : 0,
      scheduledIntents: scheduled.status === 'fulfilled' ? scheduled.value : 0,
      agentFundings: agentFundings.status === 'fulfilled' ? agentFundings.value : 0,
      agentCycles: agentCycles.status === 'fulfilled' ? agentCycles.value : 0,
      agentBetSettles: agentBetSettles.status === 'fulfilled' ? agentBetSettles.value : 0,
      agentProfits: agentProfits.status === 'fulfilled' ? agentProfits.value : 0,
      agentReconciles: agentReconciles.status === 'fulfilled' ? agentReconciles.value : 0,
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

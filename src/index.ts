import { initHelm } from './helm'
initHelm()

import express from 'express'
import { pinoHttp } from 'pino-http'
import { ethers } from 'ethers'
import { CONFIG } from './config'
import { getUserBaseDepositAddress, onboardUser } from './issuers'
import { bridgeAndForward } from './bridge'
import { hypeBridgeAndForward } from './hype-bridge'
import { WebhookPayload, DepositRecord, TransactionRecord } from './types'
import { fundDepositAddress } from './gas'
import { randomUUID } from 'crypto'
import { Pool } from 'pg'
import { generateSolanaDepositAddress, solanaBridgeAndForward } from './solana-bridge'
import { getDepositAddress, saveDepositAddress } from './db'
import { startDepositMonitor } from './monitor'
import { createNuroRouter } from './nuro-routes'
import { startExecutionDispatch } from './execution-dispatch'
import { initErrorReporter, expressErrorHandler, reportError, reportWarning } from './error-reporter'
import { createIssuerWebhookVerifier } from './webhook-verify'
import { extractEventData, mapIssuerSpendToCardTx } from './issuer-mapping'
import { upsertCardTransaction } from './issuer-sync'
import { createWalletPortfolioRouter } from './wallet-portfolio-routes'
import { startOpsAlerts } from './ops-alerts'

const app = express()
import Stripe from 'stripe';

const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil' as any,
});

// Stripe webhook — MUST be before express.json() for raw body access
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err: any) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;
        if (!userId || !planId) break;

 // Upsert stripe_customer_id on user
        await db.query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [session.customer as string, userId]
        );

 // Get plan details
        const planRes = await db.query('SELECT * FROM plans WHERE id = $1', [parseInt(planId)]);
        const plan = planRes.rows[0];
        if (!plan) break;

 // Upsert subscription
        await db.query(`
          INSERT INTO subscriptions (user_id, plan_id, status, stripe_subscription_id, started_at)
          VALUES ($1, $2, 'active', $3, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            plan_id = $2,
            status = 'active',
            stripe_subscription_id = $3,
            started_at = NOW()
        `, [userId, parseInt(planId), session.subscription as string]);

 // Add billing history entry
        await db.query(`
          INSERT INTO billing_history (user_id, plan_name, amount, status, created_at)
          VALUES ($1, $2, $3, 'paid', NOW())
        `, [userId, plan.name, plan.price]);

 // Notification
        await db.query(`
          INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
          VALUES ($1, 'billing', 'Plan Upgraded', $2, false, NOW())
        `, [userId, 'You have been upgraded to the ' + plan.name + ' plan.']);

        console.log('Stripe: checkout completed for user', userId, '→', plan.name);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        await db.query(
          'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
          [sub.status === 'active' ? 'active' : sub.status, sub.id]
        );
        console.log('Stripe: subscription updated', sub.id, '→', sub.status);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
 // Downgrade to Free plan (id=1)
        await db.query(
          `UPDATE subscriptions SET plan_id = 1, status = 'cancelled', stripe_subscription_id = NULL WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        console.log('Stripe: subscription cancelled', sub.id);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const userRes = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
        if (userRes.rows[0]) {
          await db.query(`
            INSERT INTO billing_history (user_id, plan_name, amount, status, created_at)
            VALUES ($1, $2, $3, 'paid', NOW())
          `, [userRes.rows[0].id, invoice.lines?.data?.[0]?.description || 'Subscription', (invoice.amount_paid || 0) / 100]);
        }
        console.log('Stripe: invoice paid for customer', customerId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const userRes = await db.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
        if (userRes.rows[0]) {
          await db.query(`
            INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
            VALUES ($1, 'billing', 'Payment Failed', 'Your subscription payment failed. Please update your payment method.', false, NOW())
          `, [userRes.rows[0].id]);
          await db.query(`
            INSERT INTO billing_history (user_id, plan_name, amount, status, created_at)
            VALUES ($1, $2, $3, 'failed', NOW())
          `, [userRes.rows[0].id, 'Subscription', (invoice.amount_due || 0) / 100]);
        }
        console.log('Stripe: invoice payment failed for customer', customerId);
        break;
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('Stripe webhook processing error:', err.message);
    res.json({ received: true }); // Still return 200 so Stripe doesn't retry
  }
});

// ─── ISSUER WEBHOOK — MUST be before express.json() for HMAC raw-body ──
// Handles: transaction.completed (spend/fee/payment/collateral), application.updated, card.created
// Verifier middleware handles HMAC-SHA256 against X-Issuer-Signature header, logs
// every attempt to webhook_verifications, and re-attaches parsed JSON to req.body.

app.post(
  '/issuer-webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
 // NOTE: verifier is created lazily inside the handler so `db` is available.
 // This middleware is replaced with a real verifier on first request.
  (req, res, next) => {
    if (!issuerVerifier) {
      issuerVerifier = createIssuerWebhookVerifier(db, {
        secret: CONFIG.ISSUER_WEBHOOK_SECRET,
        endpoint: '/issuer-webhook',
      })
    }
    return issuerVerifier(req, res, next)
  },
  async (req, res) => {
    const payload = req.body
    const headers = req.headers
    const issuerDeliveryId = String(
      headers['x-issuer-webhook-id'] || headers['X-Issuer-Webhook-Id'] || ''
    )
    const extracted = extractEventData(payload)

    if (!extracted) {
      await reportWarning(
        'issuer', 'webhook_bad_envelope', issuerDeliveryId || 'unknown',
        'Could not extract resource/action from payload'
      )
      return res.status(200).json({ received: true, processed: false })
    }

    const { resource, action, data, eventId } = extracted
    const eventType = `${resource}.${action}`
    const issuerUserId =
      data?.userId || data?.spend?.userId || data?.fee?.userId ||
      data?.payment?.userId || data?.collateral?.userId || payload.userId || null
    const dedupKey = issuerDeliveryId || eventId || null

    let isDuplicate = false
    try {
      const insertRes = await db.query(
        `INSERT INTO issuer_webhook_events
           (id, event_type, resource, action, issuer_user_id, payload, processed, issuer_delivery_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, $6, now())
         ON CONFLICT (issuer_delivery_id) WHERE issuer_delivery_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [eventType, resource, action, issuerUserId, JSON.stringify(payload), dedupKey]
      )
      if (insertRes.rows.length === 0 && dedupKey) {
        isDuplicate = true
      }
    } catch (err: any) {
      await reportError('issuer', 'webhook_event_store', issuerUserId || 'unknown',
        'Failed to store webhook event', err)
      return res.status(500).json({ error: 'storage_failed' })
    }

 // Fast ack to Issuer — processing continues below
    res.status(200).json({ received: true, duplicate: isDuplicate })

    if (isDuplicate) {
      await reportWarning('issuer', 'webhook_duplicate', dedupKey || '',
        `Duplicate webhook delivery: ${eventType}`)
      return
    }

    const observeOnly = CONFIG.ISSUER_WEBHOOK_OBSERVE_ONLY

    try {
      if (resource === 'transaction' && action === 'completed') {
        const issuerTxType = String(data?.type || '').toLowerCase()

        if (issuerTxType === 'collateral') {
 // Deposit monitor owns the vault → Issuer collateral path. Here we
 // just flip any matching pending deposits to completed.
          if (issuerUserId) {
            const userRes = await db.query(
              `SELECT id FROM users WHERE issuer_user_id = $1`,
              [issuerUserId]
            )
            if (userRes.rows[0] && !observeOnly) {
              await db.query(
                `UPDATE card_transactions SET status = 'completed', updated_at = now()
                 WHERE user_id = $1 AND status = 'pending' AND type = 'deposit'
                 AND created_at > now() - interval '24 hours'`,
                [userRes.rows[0].id]
              )
            }
          }
          await markEventProcessed(dedupKey, 'collateral_deposit_settled')
        } else if (issuerTxType === 'spend' || issuerTxType === 'fee' || issuerTxType === 'payment') {
          const issuerCardId: string | undefined =
            data?.spend?.cardId || data?.fee?.cardId || data?.payment?.cardId || data?.cardId
          const issuerUserIdInner: string =
            data?.spend?.userId || data?.fee?.userId || data?.payment?.userId ||
            data?.userId || issuerUserId

          if (!issuerCardId || !issuerUserIdInner) {
            await reportWarning('issuer', 'webhook_missing_ids', dedupKey || '',
              `Event missing cardId or userId: ${eventType}`)
            await markEventProcessed(dedupKey, 'skipped_missing_ids')
            return
          }

          const cardRes = await db.query(
            `SELECT c.id, c.user_id
             FROM cards c
             JOIN users u ON u.id = c.user_id
             WHERE c.issuer_card_id = $1 AND (u.issuer_user_id = $2)
             LIMIT 1`,
            [issuerCardId, issuerUserIdInner]
          )
          if (!cardRes.rows[0]) {
            await reportWarning('issuer', 'webhook_unknown_card', issuerCardId,
              `Webhook references unknown card (Issuer card=${issuerCardId}, user=${issuerUserIdInner})`)
            await markEventProcessed(dedupKey, 'skipped_unknown_card')
            return
          }

          const { id: dbCardId, user_id: dbUserId } = cardRes.rows[0]
          const row = mapIssuerSpendToCardTx(data, dbCardId, dbUserId)
          if (!row.issuerTransactionId) {
            await reportWarning('issuer', 'webhook_missing_tx_id', dedupKey || '',
              'Event missing transaction id — cannot dedup')
            await markEventProcessed(dedupKey, 'skipped_no_tx_id')
            return
          }

          if (observeOnly) {
            console.log('[issuer-webhook][observe] Would upsert:', {
              issuerTransactionId: row.issuerTransactionId,
              amount: row.amount,
              type: row.type,
              transactionType: row.transactionType,
            })
            await markEventProcessed(dedupKey, 'observed_only')
            return
          }

          const outcome = await upsertCardTransaction(db, row, /* viaSync */ false)
          await markEventProcessed(dedupKey, `tx_${outcome}`)
        } else {
          await reportWarning('issuer', 'webhook_unknown_tx_type', dedupKey || '',
            `Unknown transaction.type: ${issuerTxType}`)
          await markEventProcessed(dedupKey, `unknown_type:${issuerTxType}`)
        }
      } else if (resource === 'application' && action === 'updated') {
 // ─── KYC status sync (2026-05-25 upgrade) ────────────────────────────
 // Issuer emits `application.updated` events carrying BOTH `applicationStatus`
 // (lifecycle: pending|approved|rejected|submitted) AND `kycStatus`
 // (verification: incomplete|verified|kyc_complete|passed|complete|pending).
 // The two can disagree — applicationStatus may stay 'pending' (waiting on
 // card issuance, etc) even after kycStatus flips to 'verified'.
 //
 // The frontend KycBanner hides only on 'approved' or 'active'. Without
 // normalization, Issuer sends 'verified' or 'kyc_complete', we save the raw
 // string, the banner never hides, and the user gets a forever-visible
 // "Verify your identity" prompt despite Issuer clearing them.
 //
 // Fix:
 // 1. Read both fields. Prefer kycStatus when present (it's the actual
 // verification source-of-truth; applicationStatus is lifecycle state).
 // 2. Normalize all "passed-equivalent" labels to canonical 'approved'.
 // 3. Log raw Issuer values in the dedup result for ops tools visibility.
 //
 // Reference incident: Chris's Amazon Orders account — Issuer verified,
 // banner still showed. Manually patched + this fix prevents recurrence.

        const rawAppStatus = data?.applicationStatus ?? data?.status ?? null
        const rawKycStatus = data?.kycStatus ?? null

        const VERIFIED_LABELS = new Set([
          'approved', 'active', 'verified',
          'kyc_complete', 'kyc-complete', 'kyccomplete',
          'complete', 'completed', 'passed',
        ])
        const normalizeStatus = (s?: string | null): string | null => {
          if (!s) return null
          const lower = String(s).toLowerCase().trim()
          return VERIFIED_LABELS.has(lower) ? 'approved' : lower
        }

        const normalizedKyc = normalizeStatus(rawKycStatus)
        const normalizedApp = normalizeStatus(rawAppStatus)
 // kycStatus wins when present; fall back to applicationStatus.
        const newStatus = normalizedKyc ?? normalizedApp

        if (issuerUserId && newStatus && !observeOnly) {
          await db.query(
            `UPDATE users SET kyc_status = $1 WHERE issuer_user_id = $2`,
            [newStatus, issuerUserId]
          )
        }
        await markEventProcessed(
          dedupKey,
          `kyc_status → ${newStatus} (app=${rawAppStatus ?? '-'} kyc=${rawKycStatus ?? '-'})`
        )
      } else if (resource === 'card' && action === 'created') {
        const cardId = data?.cardId || data?.id
        if (issuerUserId && cardId && !observeOnly) {
          await db.query(
            `UPDATE cards SET issuer_card_id = $1
             WHERE user_id = (SELECT id FROM users WHERE issuer_user_id = $2 LIMIT 1)
             AND issuer_card_id IS NULL`,
            [cardId, issuerUserId]
          )
        }
        await markEventProcessed(dedupKey, `card_id → ${cardId}`)
      } else if (resource === 'card' && action === 'updated') {
 // Session 26 — keep local is_locked in sync with Issuer freeze state.
 // Admin can also trigger this via `freezeCard()` in issuers.ts, but
 // webhooks catch out-of-band freeze (e.g. Issuer fraud detection).
        const cardId = data?.cardId || data?.id
        const isLocked = data?.isLocked ?? data?.locked ?? (data?.status === 'frozen' ? true : null)
        const isActive = data?.isActive ?? (data?.status === 'active')
        if (cardId && !observeOnly) {
          const updates: string[] = []
          const params: any[] = []
          let p = 1
          if (isLocked !== null) { updates.push(`is_locked = $${p++}`); params.push(Boolean(isLocked)) }
          if (isActive !== undefined && isActive !== null) { updates.push(`is_active = $${p++}`); params.push(Boolean(isActive)) }
          if (updates.length > 0) {
            params.push(cardId)
            await db.query(
              `UPDATE cards SET ${updates.join(', ')} WHERE issuer_card_id = $${p}`,
              params
            )
          }
        }
        await markEventProcessed(dedupKey, `card_updated locked=${isLocked} active=${isActive}`)
      } else if (resource === 'card' && action === 'deleted') {
 // Rare but happens — card cancellation on Issuer side. Mark inactive
 // locally; don't hard-delete the row (preserve audit trail).
        const cardId = data?.cardId || data?.id
        if (cardId && !observeOnly) {
          await db.query(
            `UPDATE cards SET is_active = false, is_locked = true WHERE issuer_card_id = $1`,
            [cardId]
          )
        }
        await markEventProcessed(dedupKey, `card_deleted id=${cardId}`)
      } else {
        await reportWarning('issuer', 'webhook_unknown_event', dedupKey || '',
          `Unknown event: ${eventType}`)
        await markEventProcessed(dedupKey, `unknown_event:${eventType}`)
      }

      console.log(`[issuer-webhook] Processed ${eventType}${observeOnly ? ' (observe-only)' : ''} user=${issuerUserId || 'unknown'}`)
    } catch (err: any) {
      console.error('[issuer-webhook] Processing error:', err.message?.slice(0, 100))
      await reportError('issuer', 'webhook_process', issuerUserId || 'unknown',
        `Issuer webhook processing failed: ${eventType}`, err)
    }
  }
)

let issuerVerifier: express.RequestHandler | null = null

async function markEventProcessed(issuerDeliveryId: string | null, result: string): Promise<void> {
  if (!issuerDeliveryId) return
  try {
    await db.query(
      `UPDATE issuer_webhook_events SET processed = true, process_result = $1
       WHERE issuer_delivery_id = $2`,
      [result.slice(0, 200), issuerDeliveryId]
    )
  } catch (err: any) {
    console.error('[issuer-webhook] markEventProcessed failed:', err.message?.slice(0, 100))
  }
}

app.use(express.json())

// Structured HTTP request logging (Session 22 scouting tier-1 pick).
// pino-http auto-logs every req/res with method, url, status, latency. Output
// goes to stdout — PM2 picks it up into /home/nuro/.pm2/logs/nuro-api-*
// for free. Silences health-check noise to avoid log flooding.
app.use(pinoHttp({
    autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/',
    },
    serializers: {
        req: (req) => ({ method: req.method, url: req.url, id: req.id }),
        res: (res) => ({ statusCode: res.statusCode }),
    },
}))

// CORS — restrict to app origin(s); no admin-key header in public build.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:2800')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && CORS_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin)
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(200)
    next()
})

// PostgreSQL connection pool
const dbUrl = process.env.DATABASE_URL || 'postgresql://nuro:nuro@localhost:5432/nuro'
// Supabase + any managed-Postgres provider requires SSL. Auto-detect from the
// connection string so the same code works against local pg (no SSL) and
// Supabase (SSL required) without env-var gymnastics. rejectUnauthorized:false
// because Supabase pooler uses a self-signed cert chain Node's default CA
// bundle doesn't trust — TLS is real, only the chain validation is relaxed.
const dbNeedsSSL = /supabase\.(com|co)|sslmode=require/i.test(dbUrl);
const db = new Pool({
    connectionString: dbUrl.includes('statement_timeout') ? dbUrl : dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'statement_timeout=30000',
    max: 20,                    // Max 20 connections (was default 10 — caused pool exhaustion)
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Fail fast if can't connect in 10s
    ssl: dbNeedsSSL ? { rejectUnauthorized: false } : undefined,
})

// Log pool errors instead of crashing
db.on('error', (err) => {
    console.error('[db-pool] Unexpected error on idle client:', err.message?.slice(0, 100))
})

// Test DB connection on startup
db.connect().then((client: any) => {
    console.log('PostgreSQL connected successfully')
    client.release()
 // Init error reporter once DB is confirmed
    initErrorReporter(db)
}).catch((err: any) => {
    console.error('PostgreSQL connection error:', err)
})

// In-memory stores for deposit addresses
const depositAddresses = new Map<string, DepositRecord>()
const hypeDepositAddresses = new Map<string, DepositRecord>()

function generateDepositAddress(userId: string): string {
    const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + userId)
    const hdNode = ethers.utils.HDNode.fromSeed(seed)
    return hdNode.address
}

function generateHypeDepositAddress(userId: string): string {
    const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + 'HYPE' + userId)
    const hdNode = ethers.utils.HDNode.fromSeed(seed)
    return hdNode.address
}

async function saveTransaction(record: TransactionRecord) {
    await db.query(
        `INSERT INTO transactions (
            id, user_id, user_wallet, base_deposit_address,
            source_chain, dest_chain, token, amount, fee, forwarded,
            route, tx_hash, status, timestamp
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
            tx_hash = EXCLUDED.tx_hash,
            status = EXCLUDED.status`,
        [
            record.id,
            record.userId,
            record.userWallet,
            record.baseDepositAddress,
            record.sourceChain,
            record.destChain,
            record.token,
            record.amount,
            record.fee,
            record.forwarded,
            record.route,
            record.txHash,
            record.status,
            record.timestamp,
        ]
    )
}

// -- DEPOSIT ADDRESS ENDPOINTS -------------------------------------------------

app.use(createNuroRouter(db))

// Session 25 Phase 3 — /wallet-portfolio + /wallet-activity proxy Alchemy
// (see src/wallet-portfolio-routes.ts for the contract).
app.use(createWalletPortfolioRouter())

// Venture Portal — removed from hackathon submission

app.get('/deposit-address/:userId/:chainId', async (req, res) => {
    const { userId, chainId } = req.params
    const chainIdNum = parseInt(chainId)
    let record = await getDepositAddress(userId, 'evm')
    if (!record) {
        const depositAddress = generateDepositAddress(userId)
        await saveDepositAddress(userId, 'evm', depositAddress)
        try {
            await fundDepositAddress(depositAddress, chainIdNum)
        } catch (err) {
            console.error(`Failed to fund deposit address: ${err}`)
        }
        record = { address: depositAddress }
    }
    res.json({ userId, depositAddress: record.address, chainId: chainIdNum })
})

app.get('/hype-deposit-address/:userId', async (req, res) => {
    const { userId } = req.params
    let record = await getDepositAddress(userId, 'hype')
    if (!record) {
        const depositAddress = generateHypeDepositAddress(userId)
        await saveDepositAddress(userId, 'hype', depositAddress)
        record = { address: depositAddress }
    }
    res.json({ userId, depositAddress: record.address, chain: 'hyperevm', token: 'HYPE' })
})

app.get('/solana-deposit-address/:userId', async (req, res) => {
    const { userId } = req.params
    let record = await getDepositAddress(userId, 'solana')
    if (!record) {
 // S30 fix: MUST pass userId so the derivation returns a per-user
 // keypair (SHA-512(PRIVATE_KEY + userId) → 32-byte seed). Calling
 // without userId falls back to the master wallet, causing every
 // user to share the same deposit address — double-credit risk
 // when the monitor attributes incoming USDC to every matching row.
        const depositAddress = generateSolanaDepositAddress(userId)
        await saveDepositAddress(userId, 'solana', depositAddress)
        record = { address: depositAddress }
    }
    res.json({ userId, depositAddress: record.address, chain: 'solana', token: 'USDC' })
})

app.post('/solana-webhook', async (req, res) => {
    const payload: WebhookPayload = req.body
    console.log('Solana Webhook received:', JSON.stringify(payload, null, 2))

    const { userId, amount } = payload
    if (!userId || !amount) return res.status(400).json({ error: 'Missing userId or amount' })

    res.status(200).json({ received: true })

    const record: TransactionRecord = {
        id: randomUUID(),
        userId,
 // Pass userId so the derived address matches the one the user
 // actually holds — avoids "userWallet" showing the master wallet
 // in transaction records (which would obscure per-user audit).
        userWallet: generateSolanaDepositAddress(userId),
        baseDepositAddress: '',
        sourceChain: 1399811149,
        destChain: 8453,
        token: 'USDC',
        amount: parseFloat(amount),
        fee: parseFloat(amount) * (CONFIG.FEE_PERCENT / 100),
        forwarded: parseFloat(amount) * (1 - CONFIG.FEE_PERCENT / 100),
        route: 'circle-cctp',
        txHash: '',
        status: 'failed',
        timestamp: Date.now(),
    }

    try {
        const recipientBaseAddress = await getUserBaseDepositAddress(userId)
        if (!recipientBaseAddress) throw new Error(`No Issuer Base address for user ${userId} (Issuer 403/404 — user stranded)`)
        record.baseDepositAddress = recipientBaseAddress
        const txHash = await solanaBridgeAndForward(recipientBaseAddress, amount)
        record.txHash = txHash || ''
        record.status = 'confirmed'
        console.log(`Done. Tx: ${txHash}`)
    } catch (err) {
        console.error('Error processing Solana webhook:', err)
    } finally {
        await saveTransaction(record)
    }
})

// -- WEBHOOK ENDPOINTS ---------------------------------------------------------

app.post('/webhook', async (req, res) => {
    const raw = req.body
    console.log('Webhook received:', JSON.stringify(raw, null, 2))

 // Support both Issuer's Issuer format and direct format
 // Issuer format: { resource, action, body: { type, collateral: { amount, currency, chainId, walletAddress, transactionHash, userId } } }
 // Direct format: { userId, amount, chainId }
    let userId: string
    let amount: string
    let chainId: number
    let sourceTxHash: string | undefined

    if (raw.resource === 'transaction' && raw.body?.collateral) {
 // Issuer Issuer webhook format
        const col = raw.body.collateral
        userId = col.userId
        chainId = col.chainId || 8453
        sourceTxHash = col.transactionHash

 // Issuer sends amount as integer. Determine unit:
 // If chainId is 8453 (Base), funds already landed at Issuer's contract.
 // amount appears to be in USDC micro-units (6 decimals), so divide by 1e6
 // e.g. 9500 -> 0.0095 USDC seems too small. More likely raw units * 100 = cents
 // Log raw and converted so we can verify
        const rawAmount = col.amount
 // Treat as USDC with 2 implied decimals (cents): 9500 = $95.00
 // We'll log both interpretations and use the one that matches Issuer's balance
        const amountAs2Dec = (rawAmount / 100).toFixed(6)
        const amountAs6Dec = (rawAmount / 1e6).toFixed(6)
        console.log('[webhook] Raw amount from Issuer:', rawAmount)
        console.log('[webhook] Interpreted as cents ($):', amountAs2Dec)
        console.log('[webhook] Interpreted as micro-USDC ($):', amountAs6Dec)
 // Use 2-decimal (cents) interpretation as default - Issuer likely uses cents
        amount = amountAs2Dec
    } else {
 // Direct format
        userId = raw.userId
        amount = raw.amount
        chainId = raw.chainId
    }

    if (!userId || !amount) return res.status(400).json({ error: 'Missing userId or amount' })

    res.status(200).json({ received: true })

    const record: TransactionRecord = {
        id: randomUUID(),
        userId,
        userWallet: depositAddresses.get(userId)?.depositAddress || '',
        baseDepositAddress: '',
        sourceChain: chainId || 0,
        destChain: 8453,
        token: 'USDC',
        amount: parseFloat(amount),
        fee: parseFloat(amount) * (CONFIG.FEE_PERCENT / 100),
        forwarded: parseFloat(amount) * (1 - CONFIG.FEE_PERCENT / 100),
        route: 'circle-cctp',
        txHash: sourceTxHash || '',
        status: 'failed',
        timestamp: Date.now(),
    }

    try {
        const recipientBaseAddress = await getUserBaseDepositAddress(userId)
        if (!recipientBaseAddress) throw new Error(`No Issuer Base address for user ${userId} (Issuer 403/404 — user stranded)`)
        record.baseDepositAddress = recipientBaseAddress

        const dbRecord = await getDepositAddress(userId, 'evm')
        const depositAddr = dbRecord?.address || generateDepositAddress(userId)
        const txHash = await bridgeAndForward(
            userId,
            depositAddr,
            recipientBaseAddress,
            amount,
            chainId || 1
        )

        record.txHash = txHash || ''
        record.status = 'confirmed'
        console.log(`Done. Tx: ${txHash}`)
    } catch (err) {
        console.error('Error processing webhook:', err)
    } finally {
        await saveTransaction(record)
    }
})

app.post('/hype-webhook', async (req, res) => {
    const payload: WebhookPayload = req.body
    console.log('HYPE Webhook received:', JSON.stringify(payload, null, 2))

    const { userId, amount } = payload
    if (!userId || !amount) return res.status(400).json({ error: 'Missing userId or amount' })

    res.status(200).json({ received: true })

    const record: TransactionRecord = {
        id: randomUUID(),
        userId,
        userWallet: (await getDepositAddress(userId, 'hype'))?.address || '',
        baseDepositAddress: '',
        sourceChain: 999,
        destChain: 8453,
        token: 'HYPE',
        amount: parseFloat(amount),
        fee: parseFloat(amount) * (CONFIG.FEE_PERCENT / 100),
        forwarded: parseFloat(amount) * (1 - CONFIG.FEE_PERCENT / 100),
        route: 'across',
        txHash: '',
        status: 'failed',
        timestamp: Date.now(),
    }

    try {
        const recipientBaseAddress = await getUserBaseDepositAddress(userId)
        if (!recipientBaseAddress) throw new Error(`No Issuer Base address for user ${userId} (Issuer 403/404 — user stranded)`)
        record.baseDepositAddress = recipientBaseAddress

        const txHash = await hypeBridgeAndForward(recipientBaseAddress, amount)
        record.txHash = txHash || ''
        record.status = 'confirmed'
        console.log(`Done. Tx: ${txHash}`)
    } catch (err) {
        console.error('Error processing HYPE webhook:', err)
    } finally {
        await saveTransaction(record)
    }
})

// Health check
app.post('/create-user', async (req, res) => {
    const { firstName, lastName, email } = req.body
    if (!firstName || !lastName || !email) {
        res.status(400).json({ error: 'firstName, lastName, and email are required' })
        return
    }
    try {
        const issuerResponse = await onboardUser(firstName, lastName, email)
        const { userId, kycCompletionLink, applicationStatus } = issuerResponse

        let evmRecord = await getDepositAddress(userId, 'evm')
        if (!evmRecord) {
            const depositAddress = generateDepositAddress(userId)
            await saveDepositAddress(userId, 'evm', depositAddress)
            evmRecord = { address: depositAddress }
        }

        let solRecord = await getDepositAddress(userId, 'solana')
        if (!solRecord) {
 // Pass userId — see /solana-deposit-address/:userId comment.
            const depositAddress = generateSolanaDepositAddress(userId)
            await saveDepositAddress(userId, 'solana', depositAddress)
            solRecord = { address: depositAddress }
        }

        const hypeDepositAddress = generateHypeDepositAddress(userId)

        console.log(`[create-user] userId=${userId} evm=${evmRecord.address} solana=${solRecord.address}`)

        res.status(201).json({
            userId,
            applicationStatus,
            kycCompletionLink,
            depositAddresses: {
                evm: evmRecord.address,
                hype: hypeDepositAddress,
                solana: solRecord.address,
            }
        })
    } catch (err) {
        console.error(`[create-user] Error: ${err}`)
        res.status(500).json({ error: 'Failed to create user' })
    }
})

app.get('/health', (_, res) => res.json({ status: 'ok' }))

// S35 Marathon 11 / Day-2: tier-1 cache diagnostic. Useful for the admin
// console to confirm Upstash is wired (vs in-memory fallback) and for
// dashboards that want to surface "cache hit %" telemetry.
app.get('/health/cache', async (_, res) => {
    try {
        const { cache } = await import('./cache')
        return res.json({
            backend: cache.backend(),
            memSize: cache.memSize(),
 // Roundtrip test on the configured backend — write + read + del.
 // 1.5s cumulative budget; if upstash is slow we'd rather report
 // it than hide it.
            ok: await (async () => {
                try {
                    const k = `nuro:health:probe:${Date.now()}`
                    await cache.set(k, { ts: Date.now() }, 5)
                    const v = await cache.get(k)
                    await cache.del(k)
                    return v != null
                } catch { return false }
            })(),
        })
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || String(e) })
    }
})

// ─── CLIENT ERROR REPORTING ──────────────────────────────────────────────────
// Frontend React crashes, unhandled promises, console errors → execution_log
app.post('/client-error', express.json(), async (req, res) => {
    try {
        const { message, stack, component, url, userAgent, userId, timestamp } = req.body || {}
        await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, error_message, created_at)
             VALUES (gen_random_uuid(), 'client_error', $1, $2, 'failed', $3, $4, $5)`,
            [
                component || 'unknown',
                url || 'unknown_page',
                `Client crash: ${message?.slice(0, 100)} | User: ${userId || 'anonymous'} | UA: ${userAgent?.slice(0, 60)}`,
                `${message}\n\nStack:\n${stack?.slice(0, 500)}`,
                timestamp ? new Date(timestamp) : new Date(),
            ]
        )
        res.json({ received: true })
    } catch {
        res.json({ received: true })  // Always 200 — don't fail the error report
    }
})

// Centralized Express error handler — catches all unhandled route errors → execution_log
app.use(expressErrorHandler)

const server = app.listen(CONFIG.PORT, () => {
    console.log(`Nuro API middleware running on port ${CONFIG.PORT}`)
})

startDepositMonitor().catch(err => {
    console.error('[monitor] Failed to start:', err)
    reportError('monitor', 'startup', 'deposit_monitor', 'Monitor failed to start', err as Error)
})

// Start execution dispatch engine — routes pending intents to on-chain execution
// Sweep interval: 60s. Disabled by default in dev — enable with ENABLE_EXECUTION_DISPATCH=true
if (process.env.ENABLE_EXECUTION_DISPATCH === 'true') {
    startExecutionDispatch(db)
} else {
    console.log('[execution-dispatch] Disabled. Set ENABLE_EXECUTION_DISPATCH=true to enable.')
}

startOpsAlerts(db)

// ─── BUDGET ROLLOVER CRON ───────────────────────────────────────────────────
if (process.env.BUDGET_ROLLOVER_OFF !== 'true') {
    const BUDGET_ROLLOVER_INTERVAL_MS = 6 * 60 * 60 * 1000
    const runBudgetRollover = async () => {
        try {
            const { runBudgetRolloverCycle } = await import('./budgets')
            const result = await runBudgetRolloverCycle(db)
            if (result.ledgerRowsInserted > 0) {
                console.log(`[budget-rollover] rolled over ${result.budgetsScanned} budget(s); ${result.ledgerRowsInserted} refill ledger row(s)`)
            }
        } catch (err: any) {
            console.error('[budget-rollover] cycle error:', err?.message?.slice(0, 120))
        }
    }
    setTimeout(() => { void runBudgetRollover() }, 4 * 60 * 1000)
    setInterval(() => { void runBudgetRollover() }, BUDGET_ROLLOVER_INTERVAL_MS)
    console.log('[budget-rollover] cron armed (6h cadence; first run in 4min)')
} else {
    console.log('[budget-rollover] disabled (BUDGET_ROLLOVER_OFF=true)')
}

// ─── AGENT GAS BALANCE SYNC CRON — S32 ──────────────────────────────────────
// Hourly per-chain provider.getBalance() refresh for agent_gas_balances.
// Read-only on-chain. Powers the Nuro POV "gas across chains" view +
// the future low-threshold alert. Disable with AGENT_GAS_SYNC_OFF=true.
if (process.env.AGENT_GAS_SYNC_OFF !== 'true') {
    const GAS_SYNC_INTERVAL_MS = 60 * 60 * 1000  // hourly
    const runGasSync = async () => {
        try {
            const { runGasBalanceSyncCycle } = await import('./agent-gas-sync')
            const result = await runGasBalanceSyncCycle(db)
            if (result.scanned > 0) {
                console.log(`[gas-sync] scanned=${result.scanned} refreshed=${result.refreshed} failed=${result.failed} lowAlerts=${result.lowAlertCount}`)
            }
        } catch (err: any) {
            console.error('[gas-sync] cycle error:', err?.message?.slice(0, 120))
        }
    }
 // Boot delay 8 min — staggered after hl-sync to avoid all crons hitting
 // RPCs simultaneously on a fresh boot.
    setTimeout(() => { void runGasSync() }, 8 * 60 * 1000)
    setInterval(() => { void runGasSync() }, GAS_SYNC_INTERVAL_MS)
    console.log('[gas-sync] cron armed (1h cadence; first run in 8min)')
} else {
    console.log('[gas-sync] disabled (AGENT_GAS_SYNC_OFF=true)')
}

server.on('error', (err) => {
    console.error('Server error:', err)
    reportError('admin', 'server_error', 'express', 'Express server error', err)
})

// Sprint 6.4 — graceful-shutdown handler. When pm2 restart 4 sends SIGTERM,
// mark any in-flight 'pending' transactions as 'failed_restart' so boot-time
// recovery knows what died mid-bridge. Without this, a mid-restart bridge
// leaves a phantom pending row that dedup blocks new deposits against,
// causing the dust-re-detection cascade we hit Session 22.
let shuttingDown = false
async function gracefulShutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[shutdown] Received ${signal} — marking in-flight bridges as failed_restart…`)
    try {
 // Only rows older than 30s (avoid killing bridges that just started)
        const result = await db.query(
            `UPDATE transactions
             SET status = 'failed_restart'
             WHERE status = 'pending' AND timestamp < $1
             RETURNING id, source_chain, amount`,
            [Date.now() - 30 * 1000]
        )
        console.log(`[shutdown] Marked ${result.rowCount} pending row(s) as failed_restart`)
        if (result.rowCount && result.rowCount > 0) {
            for (const row of result.rows) {
                console.log(`[shutdown]   tx=${row.id} chain=${row.source_chain} amount=$${row.amount}`)
            }
        }
    } catch (err: any) {
        console.error('[shutdown] Failed to mark in-flight rows:', err.message)
    }
    process.exit(0)
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err)
    reportError('admin', 'uncaught_exception', 'process', 'Uncaught exception in Node process', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
    reportError('admin', 'unhandled_rejection', 'process', 'Unhandled promise rejection', err as Error)
})

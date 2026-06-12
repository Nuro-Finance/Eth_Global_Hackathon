// Session 30 H1 — Helm must initialize BEFORE anything else imports axios
// clients, so its log-scanner wraps console.* before any other module logs
// and its egress observer is ready to instrument each axios instance.
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
import { startExecutionDispatch, getExecutionLog, getExecutionSummary } from './execution-dispatch'
import { initErrorReporter, expressErrorHandler, reportError, reportWarning } from './error-reporter'
import { createIssuerWebhookVerifier } from './webhook-verify'
import { extractEventData, mapSd3SpendToCardTx } from './issuer-mapping'
import { upsertCardTransaction, syncIssuerTransactions } from './issuer-sync'
import { createAdminConsoleRouter } from './admin-console'
import { createWalletPortfolioRouter } from './wallet-portfolio-routes'
// import { createVenturePortalRouter } from './venture-portal' // Disabled — investors prefer PDF
import { startMarketFeeds, fetchCryptoPrices, fetchUpcomingSports, fetchPolymarketTrending, fetchCoinPrice } from './market-feeds'
import { runDailyGrowthCycle, runHourlyCheck, processApprovalCallback, notifyAdmin, sendTestMessage, pollTelegramApprovals, processApprovedPosts } from './growth-agent/skills/daily-log'
import { pollPostEngagement } from './growth-agent/skills/engagement-fetcher'
import { startOpsAlerts } from './ops-alerts'
import { startMarketWatcher } from './growth-agent/skills/market-watcher'
import { startTwitterWatcher } from './growth-agent/skills/twitter-watcher'

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

// ─── ISSUER (SD3) WEBHOOK — MUST be before express.json() for HMAC raw-body ──
// Handles: transaction.completed (spend/fee/payment/collateral), application.updated, card.created
// Verifier middleware handles HMAC-SHA256 against SD3-Signature header, logs
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
    const sd3WebhookId = String(
      headers['sd3-webhook-id'] || headers['SD3-Webhook-Id'] || ''
    )
    const extracted = extractEventData(payload)

    if (!extracted) {
      await reportWarning(
        'issuer', 'webhook_bad_envelope', sd3WebhookId || 'unknown',
        'Could not extract resource/action from payload'
      )
      return res.status(200).json({ received: true, processed: false })
    }

    const { resource, action, data, eventId } = extracted
    const eventType = `${resource}.${action}`
    const issuerUserId =
      data?.userId || data?.spend?.userId || data?.fee?.userId ||
      data?.payment?.userId || data?.collateral?.userId || payload.userId || null
    const dedupKey = sd3WebhookId || eventId || null

    let isDuplicate = false
    try {
      const insertRes = await db.query(
        `INSERT INTO issuer_webhook_events
           (id, event_type, resource, action, issuer_user_id, payload, processed, sd3_webhook_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, $6, now())
         ON CONFLICT (sd3_webhook_id) WHERE sd3_webhook_id IS NOT NULL DO NOTHING
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

    // Fast ack to SD3 — processing continues below
    res.status(200).json({ received: true, duplicate: isDuplicate })

    if (isDuplicate) {
      await reportWarning('issuer', 'webhook_duplicate', dedupKey || '',
        `Duplicate webhook delivery: ${eventType}`)
      return
    }

    const observeOnly = CONFIG.ISSUER_WEBHOOK_OBSERVE_ONLY

    try {
      if (resource === 'transaction' && action === 'completed') {
        const sd3Type = String(data?.type || '').toLowerCase()

        if (sd3Type === 'collateral') {
          // Deposit monitor owns the vault → Issuer collateral path. Here we
          // just flip any matching pending deposits to completed.
          if (issuerUserId) {
            const userRes = await db.query(
              `SELECT id FROM users WHERE sd3_user_id = $1 OR issuer_user_id = $1`,
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
        } else if (sd3Type === 'spend' || sd3Type === 'fee' || sd3Type === 'payment') {
          const sd3CardId: string | undefined =
            data?.spend?.cardId || data?.fee?.cardId || data?.payment?.cardId || data?.cardId
          const sd3UserIdInner: string =
            data?.spend?.userId || data?.fee?.userId || data?.payment?.userId ||
            data?.userId || issuerUserId

          if (!sd3CardId || !sd3UserIdInner) {
            await reportWarning('issuer', 'webhook_missing_ids', dedupKey || '',
              `Event missing cardId or userId: ${eventType}`)
            await markEventProcessed(dedupKey, 'skipped_missing_ids')
            return
          }

          const cardRes = await db.query(
            `SELECT c.id, c.user_id
             FROM cards c
             JOIN users u ON u.id = c.user_id
             WHERE c.issuer_card_id = $1 AND (u.sd3_user_id = $2 OR u.issuer_user_id = $2)
             LIMIT 1`,
            [sd3CardId, sd3UserIdInner]
          )
          if (!cardRes.rows[0]) {
            await reportWarning('issuer', 'webhook_unknown_card', sd3CardId,
              `Webhook references unknown card (SD3 card=${sd3CardId}, user=${sd3UserIdInner})`)
            await markEventProcessed(dedupKey, 'skipped_unknown_card')
            return
          }

          const { id: dbCardId, user_id: dbUserId } = cardRes.rows[0]
          const row = mapSd3SpendToCardTx(data, dbCardId, dbUserId)
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
            `Unknown transaction.type: ${sd3Type}`)
          await markEventProcessed(dedupKey, `unknown_type:${sd3Type}`)
        }
      } else if (resource === 'application' && action === 'updated') {
        // ─── KYC status sync (2026-05-25 upgrade) ────────────────────────────
        // SD3 emits `application.updated` events carrying BOTH `applicationStatus`
        // (lifecycle: pending|approved|rejected|submitted) AND `kycStatus`
        // (verification: incomplete|verified|kyc_complete|passed|complete|pending).
        // The two can disagree — applicationStatus may stay 'pending' (waiting on
        // card issuance, etc) even after kycStatus flips to 'verified'.
        //
        // The frontend KycBanner hides only on 'approved' or 'active'. Without
        // normalization, SD3 sends 'verified' or 'kyc_complete', we save the raw
        // string, the banner never hides, and the user gets a forever-visible
        // "Verify your identity" prompt despite SD3 clearing them.
        //
        // Fix:
        //   1. Read both fields. Prefer kycStatus when present (it's the actual
        //      verification source-of-truth; applicationStatus is lifecycle state).
        //   2. Normalize all "passed-equivalent" labels to canonical 'approved'.
        //   3. Log raw SD3 values in the dedup result for admin-console visibility.
        //
        // Reference incident: Chris's Amazon Orders account — SD3 verified,
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
            `UPDATE users SET kyc_status = $1 WHERE sd3_user_id = $2 OR issuer_user_id = $2`,
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
             WHERE user_id = (SELECT id FROM users WHERE sd3_user_id = $2 OR issuer_user_id = $2 LIMIT 1)
             AND issuer_card_id IS NULL`,
            [cardId, issuerUserId]
          )
        }
        await markEventProcessed(dedupKey, `card_id → ${cardId}`)
      } else if (resource === 'card' && action === 'updated') {
        // Session 26 — keep local is_locked in sync with SD3 freeze state.
        // Admin can also trigger this via `freezeCard()` in issuers.ts, but
        // webhooks catch out-of-band freeze (e.g. SD3 fraud detection).
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
        // Rare but happens — card cancellation on SD3 side. Mark inactive
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

async function markEventProcessed(sd3WebhookId: string | null, result: string): Promise<void> {
  if (!sd3WebhookId) return
  try {
    await db.query(
      `UPDATE issuer_webhook_events SET processed = true, process_result = $1
       WHERE sd3_webhook_id = $2`,
      [result.slice(0, 200), sd3WebhookId]
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

// CORS for admin dashboard
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(200)
    next()
})

// Admin auth middleware
const ADMIN_KEY = process.env.ADMIN_KEY || 'nuro-admin-dev'
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.headers['x-admin-key'] !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
}

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

// Admin Console — serves dashboard at GET /admin?key=<ADMIN_KEY>
app.use(createAdminConsoleRouter(db, ADMIN_KEY))

// Session 25 Phase 3 — /wallet-portfolio + /wallet-activity proxy Alchemy
// (see src/wallet-portfolio-routes.ts for the contract).
app.use(createWalletPortfolioRouter())

// Venture Portal — DISABLED (Chris: investors prefer PDF in a locker)
// app.use(createVenturePortalRouter())

// ── Telegram Webhook — Growth Agent approval callbacks ──────────────
app.post('/telegram/webhook', async (req: any, res: any) => {
  try {
    const update = req.body
    // Handle callback queries (approval button presses)
    if (update?.callback_query) {
      const callbackData = update.callback_query.data || ''
      const callbackQueryId = update.callback_query.id
      const [action, postId] = callbackData.split(':')

      if (action && postId && ['approve', 'reject', 'skip', 'edit'].includes(action)) {
        const result = await processApprovalCallback(db, action, postId, callbackQueryId)
        console.log(`[telegram-webhook] ${action} → ${result.approved ? 'APPROVED' : 'NOT APPROVED'}`)
      }
    }
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[telegram-webhook] Error:', err.message)
    res.json({ ok: true })  // Always return 200 to Telegram
  }
})

// ── Growth Agent Test Endpoint ──────────────────────────────────────
app.get('/agent/test', async (req: any, res: any) => {
  const key = req.query.key
  if (key !== ADMIN_KEY) return res.status(403).json({ error: 'unauthorized' })
  const sent = await sendTestMessage(db)
  res.json({ ok: sent, message: sent ? 'Test message sent to Telegram' : 'Failed — check bot token + chat ID' })
})

app.get('/agent/trigger-cycle', async (req: any, res: any) => {
  const key = req.query.key
  if (key !== ADMIN_KEY) return res.status(403).json({ error: 'unauthorized' })
  console.log('[agent] Manual trigger: daily growth cycle')
  const result = await runDailyGrowthCycle(db)
  res.json({ ok: true, result })
})

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

    // Support both Issuer's SD3 format and direct format
    // Issuer format: { resource, action, body: { type, collateral: { amount, currency, chainId, walletAddress, transactionHash, userId } } }
    // Direct format: { userId, amount, chainId }
    let userId: string
    let amount: string
    let chainId: number
    let sourceTxHash: string | undefined

    if (raw.resource === 'transaction' && raw.body?.collateral) {
        // Issuer SD3 webhook format
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

// -- ADMIN ENDPOINTS -----------------------------------------------------------

app.get('/admin/transactions', requireAdmin, async (req, res) => {
    const result = await db.query(
        'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 1000'
    )
    const rows = result.rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        userWallet: r.user_wallet,
        baseDepositAddress: r.base_deposit_address,
        sourceChain: r.source_chain,
        destChain: r.dest_chain,
        token: r.token,
        amount: parseFloat(r.amount),
        fee: parseFloat(r.fee),
        forwarded: parseFloat(r.forwarded),
        route: r.route,
        txHash: r.tx_hash,
        status: r.status,
        timestamp: parseInt(r.timestamp),
    }))
    res.json(rows)
})

app.get('/admin/users', requireAdmin, async (req, res) => {
    const result = await db.query(`
        SELECT
            user_id,
            MAX(user_wallet) as user_wallet,
            MAX(base_deposit_address) as base_deposit_address,
            COUNT(*) as tx_count,
            SUM(amount) as total_volume,
            SUM(fee) as total_fees,
            array_agg(DISTINCT source_chain) as chains,
            MAX(timestamp) as last_seen
        FROM transactions
        GROUP BY user_id
        ORDER BY total_volume DESC
    `)
    const rows = result.rows.map((r: any) => ({
        userId: r.user_id,
        wallet: r.user_wallet,
        baseDepositAddress: r.base_deposit_address,
        txCount: parseInt(r.tx_count),
        totalVolume: parseFloat(r.total_volume),
        totalFees: parseFloat(r.total_fees),
        chains: r.chains,
        lastSeen: parseInt(r.last_seen),
    }))
    res.json(rows)
})

app.get('/admin/stats', requireAdmin, async (req, res) => {
    const result = await db.query(`
        SELECT
            SUM(amount) as total_volume,
            SUM(fee) as total_fees,
            COUNT(*) as total_tx,
            COUNT(DISTINCT user_id) as active_users,
            COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
            SUM(amount) FILTER (WHERE token = 'HYPE') as hype_volume
        FROM transactions
    `)
    const chainResult = await db.query(`
        SELECT source_chain, SUM(amount) as volume
        FROM transactions
        GROUP BY source_chain
    `)
    const r = result.rows[0]
    const chainVolumes: Record<number, number> = {}
    chainResult.rows.forEach((row: any) => {
        chainVolumes[row.source_chain] = parseFloat(row.volume)
    })
    res.json({
        totalVolume: parseFloat(r.total_volume) || 0,
        totalFees: parseFloat(r.total_fees) || 0,
        totalTx: parseInt(r.total_tx) || 0,
        activeUsers: parseInt(r.active_users) || 0,
        confirmed: parseInt(r.confirmed) || 0,
        hypeVolume: parseFloat(r.hype_volume) || 0,
        chainVolumes,
    })
})

// ─── EXECUTION DISPATCH ADMIN ENDPOINTS ──────────────────────────────────────

// GET /admin/execution-log — paginated execution log for admin console
app.get('/admin/execution-log', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50
        const offset = parseInt(req.query.offset as string) || 0
        const entity_type = req.query.entity_type as string | undefined
        const status = req.query.status as string | undefined
        const rows = await getExecutionLog(db, { limit, offset, entity_type, status })
        res.json(rows)
    } catch (err: any) {
        console.error('[admin/execution-log]', err.message)
        res.status(500).json({ error: 'Failed to fetch execution log' })
    }
})

// GET /admin/execution-summary — dashboard overview of execution state
app.get('/admin/execution-summary', requireAdmin, async (req, res) => {
    try {
        const summary = await getExecutionSummary(db)
        res.json(summary)
    } catch (err: any) {
        console.error('[admin/execution-summary]', err.message)
        res.status(500).json({ error: 'Failed to fetch execution summary' })
    }
})

// GET /admin/pending-intents — all pending intents across system
app.get('/admin/pending-intents', requireAdmin, async (req, res) => {
    try {
        const [cardTxs, marketPos, transfers] = await Promise.all([
            db.query(`SELECT id, user_id, name, type, amount, status, created_at FROM card_transactions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50`),
            db.query(`SELECT mp.id, mp.user_id, mp.market_id, mp.side, mp.shares, mp.cost_basis, mp.status, mp.execution_tx_hash, mp.created_at, m.question FROM market_positions mp LEFT JOIN markets m ON m.id = mp.market_id WHERE mp.status IN ('pending', 'executed') ORDER BY mp.created_at DESC LIMIT 50`),
            db.query(`SELECT id, sender_user_id, recipient_name, amount, status, execution_tx_hash, created_at FROM transfers WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50`),
        ])
        res.json({
            pending_card_transactions: cardTxs.rows,
            market_positions: marketPos.rows,
            pending_transfers: transfers.rows,
        })
    } catch (err: any) {
        console.error('[admin/pending-intents]', err.message)
        res.status(500).json({ error: 'Failed to fetch pending intents' })
    }
})

// ─── ADMIN: ISSUER SYNC & WEBHOOK OBSERVABILITY ──────────────────────────────

app.post('/admin/users/:userId/sync-transactions', requireAdmin, async (req, res) => {
    const { userId } = req.params
    try {
        const result = await syncIssuerTransactions(db, String(userId))
        res.json(result)
    } catch (err: any) {
        console.error('[admin/sync-transactions]', err.message?.slice(0, 120))
        res.status(500).json({ error: 'Sync failed', detail: err.message?.slice(0, 200) })
    }
})

app.get('/admin/issuer-reconcile/:userId', requireAdmin, async (req, res) => {
    const { userId } = req.params
    const days = Math.min(Number(req.query.days) || 30, 90)
    try {
        const userRes = await db.query(
            `SELECT id, sd3_user_id, issuer_user_id FROM users WHERE id = $1`,
            [userId]
        )
        if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found' })

        const dbRows = await db.query(
            `SELECT issuer_transaction_id, amount, status, merchant_name, source_verified, created_at
             FROM card_transactions
             WHERE user_id = $1
               AND issuer_transaction_id IS NOT NULL
               AND created_at > now() - ($2 || ' days')::interval
             ORDER BY created_at DESC LIMIT 500`,
            [userId, String(days)]
        )

        res.json({
            userId,
            dbRowCount: dbRows.rows.length,
            dbRows: dbRows.rows,
            note: 'Compare dbRows against SD3 GET /transactions for same window to identify gaps',
        })
    } catch (err: any) {
        console.error('[admin/issuer-reconcile]', err.message?.slice(0, 120))
        res.status(500).json({ error: 'Reconcile failed', detail: err.message?.slice(0, 200) })
    }
})

app.get('/admin/webhook-verifications', requireAdmin, async (req, res) => {
    const endpoint = (req.query.endpoint as string) || '/issuer-webhook'
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    try {
        const rows = await db.query(
            `SELECT id, webhook_source, endpoint, signature_verified, source_ip, received_at
             FROM webhook_verifications
             WHERE endpoint = $1
             ORDER BY received_at DESC
             LIMIT $2`,
            [endpoint, limit]
        )
        res.json({ count: rows.rows.length, verifications: rows.rows })
    } catch (err: any) {
        console.error('[admin/webhook-verifications]', err.message?.slice(0, 120))
        res.status(500).json({ error: 'Query failed' })
    }
})

app.get('/admin/webhook-conflicts', requireAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    try {
        const rows = await db.query(
            `SELECT id, entity_id, detail, created_at
             FROM execution_log
             WHERE action = 'webhook_conflict_resolved'
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        )
        // Parse detail JSON for display; tolerate malformed
        const conflicts = rows.rows.map((r: any) => {
            let parsed: any = null
            try { parsed = JSON.parse(r.detail) } catch { /* leave null */ }
            return { ...r, parsed }
        })
        res.json({ count: conflicts.length, conflicts })
    } catch (err: any) {
        console.error('[admin/webhook-conflicts]', err.message?.slice(0, 120))
        res.status(500).json({ error: 'Query failed' })
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

// ─── MARKET FEED API ENDPOINTS ───────────────────────────────────────────────

// GET /feeds/crypto — real-time crypto prices from CoinGecko
app.get('/feeds/crypto', async (req, res) => {
    try {
        // Try cache first
        const cached = await db.query(
            `SELECT external_id as id, symbol, name, price_usd as current_price,
                    price_change_24h as price_change_percentage_24h, volume_24h as total_volume,
                    metadata, last_synced_at
             FROM market_feed_cache WHERE feed_source = 'coingecko'
             ORDER BY volume_24h DESC NULLS LAST`
        )
        if (cached.rows.length > 0) {
            return res.json(cached.rows)
        }
        // Fallback: fetch live
        const prices = await fetchCryptoPrices()
        res.json(prices)
    } catch (err: any) {
        console.error('[feeds/crypto]', err.message)
        res.status(502).json({ error: 'Crypto feed unavailable' })
    }
})

// GET /feeds/crypto/:coinId — single coin price
app.get('/feeds/crypto/:coinId', async (req, res) => {
    try {
        const price = await fetchCoinPrice(req.params.coinId)
        if (price === null) return res.status(404).json({ error: 'Coin not found' })
        res.json({ coinId: req.params.coinId, price_usd: price })
    } catch (err: any) {
        res.status(502).json({ error: 'Price feed unavailable' })
    }
})

// GET /feeds/sports — upcoming sports events
app.get('/feeds/sports', async (req, res) => {
    try {
        const sport = (req.query.sport as string) || 'Soccer'
        const events = await fetchUpcomingSports(sport)
        res.json(events)
    } catch (err: any) {
        res.status(502).json({ error: 'Sports feed unavailable' })
    }
})

// GET /feeds/trending — trending Polymarket markets
app.get('/feeds/trending', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20
        const trending = await fetchPolymarketTrending(limit)
        res.json(trending)
    } catch (err: any) {
        res.status(502).json({ error: 'Trending feed unavailable' })
    }
})

// GET /feeds/price-history/:marketId — price history for a market (for charts)
app.get('/feeds/price-history/:marketId', async (req, res) => {
    try {
        const { marketId } = req.params
        const period = (req.query.period as string) || '24h'
        const intervalMap: Record<string, string> = {
            '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '7d': '7 days', '30d': '30 days',
        }
        const interval = intervalMap[period] || '24 hours'
        const result = await db.query(
            `SELECT yes_price, no_price, volume, recorded_at
             FROM market_price_history
             WHERE market_id = $1 AND recorded_at > now() - interval '${interval}'
             ORDER BY recorded_at ASC`,
            [marketId]
        )
        res.json(result.rows)
    } catch (err: any) {
        res.status(500).json({ error: 'Price history unavailable' })
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

// Start market feed engine — fetches crypto prices, sports, trending markets
// Creates markets automatically from external feeds
// Admin user ID used as creator_id for auto-created markets
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'db01a59c-a418-4da0-a4aa-fb032d500b04' // Richard's user ID
if (process.env.ENABLE_MARKET_FEEDS !== 'false') {
    startMarketFeeds(db, ADMIN_USER_ID)
} else {
    console.log('[market-feeds] Disabled. Set ENABLE_MARKET_FEEDS=true to enable.')
}

// Sprint 6.5 — Ops alerts cron. Pings admin Telegram when a transaction
// has been stuck in 'pending' for >30 min. De-duped per tx id via
// execution_log so the channel never gets spammed. Runs independently
// of the growth agent (ops-critical, not growth-critical).
startOpsAlerts(db)

// Session 30 — LayerZero bridge reserve reconciliation monitor.
// Compares adapter USDC balance on Arbitrum (hub) against sum of MyOFT
// totalSupply across 5 spoke chains every 5 min. Drift < -$100 triggers
// reportError('bridge', 'lz_reserve_drift_critical', ...) so operator
// catches the Kelp attack signature (spoke mint without hub escrow)
// within one cycle. Safe to run while LZ_BRIDGE_ENABLED=false — the
// monitor just observes, never acts. Disabled only if LZ_MONITOR=off
// (escape hatch for noisy RPCs).
if (process.env.LZ_MONITOR !== 'off') {
    const { pollLzReserveReconciliation } = require('./lz-reserve-monitor')
    const LZ_MONITOR_INTERVAL_MS = 5 * 60 * 1000
    // Kick off once at boot so admins see the first snapshot without waiting 5min
    setTimeout(() => {
        pollLzReserveReconciliation(db).catch((err: any) =>
            console.error('[lz-monitor] boot poll error:', err.message?.slice(0, 120))
        )
    }, 30_000) // 30s delay so DB + other schedulers settle first
    setInterval(() => {
        pollLzReserveReconciliation(db).catch((err: any) =>
            console.error('[lz-monitor] poll error:', err.message?.slice(0, 120))
        )
    }, LZ_MONITOR_INTERVAL_MS)
    console.log('[lz-monitor] Enabled — reserve reconciliation every 5 min (Kelp hardening)')
} else {
    console.log('[lz-monitor] Disabled (LZ_MONITOR=off)')
}

// ─── HELM HARDENING CRONS — S31 H2 ──────────────────────────────────────
// Two crons watch the Helm posture:
//   - Compound-signal detector (HELM-501 + Gjallarhorn state machine):
//     evaluates per-agent rolling windows of heimdall_events, transitions
//     active → watch → paused → quarantined per the rule catalog, writes
//     transitions to heimdall_state_history. Cron cadence: 5 minutes.
//   - Watchdog: alerts via Telegram if Helm has been silent for >2 hrs
//     OR any of the live defenders are unarmed. Cron cadence: 15 minutes.
// Disable individually with HELM_COMPOUND_OFF / HELM_WATCHDOG_OFF
// env vars. They're independent — the compound detector can be off while
// the watchdog still runs (or vice versa) for bring-up flexibility.

if (process.env.HELM_COMPOUND_OFF !== 'true') {
    const COMPOUND_INTERVAL_MS = 5 * 60 * 1000
    const runCompound = async () => {
        try {
            const { runCompoundCycle } = await import('./helm/compound-detector')
            await runCompoundCycle(db)
        } catch (err: any) {
            console.error('[helm:compound] cycle error:', err?.message?.slice(0, 120))
        }
    }
    // 90s boot delay so initHelm + DB pool settle
    setTimeout(() => { void runCompound() }, 90_000)
    setInterval(() => { void runCompound() }, COMPOUND_INTERVAL_MS)
    console.log('[helm:compound] HELM-501 compound-signal detector + Gjallarhorn state machine armed (5min cadence)')
} else {
    console.log('[helm:compound] disabled (HELM_COMPOUND_OFF=true)')
}

if (process.env.HELM_WATCHDOG_OFF !== 'true') {
    const WATCHDOG_INTERVAL_MS = 15 * 60 * 1000
    const runWatchdog = async () => {
        try {
            const { runWatchdogCycle } = await import('./helm/watchdog')
            await runWatchdogCycle(db)
        } catch (err: any) {
            console.error('[helm:watchdog] cycle error:', err?.message?.slice(0, 120))
        }
    }
    // First check 5min after boot — long enough for events to start flowing.
    setTimeout(() => { void runWatchdog() }, 5 * 60 * 1000)
    setInterval(() => { void runWatchdog() }, WATCHDOG_INTERVAL_MS)
    console.log('[helm:watchdog] self-watchdog armed (15min cadence; first check in 5min)')
} else {
    console.log('[helm:watchdog] disabled (HELM_WATCHDOG_OFF=true)')
}

// ─── HUGINN — wise-advisor sub-agent (S31 H2) ─────────────────────────────
// Boot: subscribe to relevant bus topics + drain any queued messages.
// Cron: every 2min, poll for new bus messages addressed to Huginn / on
// subscribed topics, react with counsel via publish back. Disable with
// HUGINN_OFF=true.
if (process.env.HUGINN_OFF !== 'true') {
    const HUGINN_INTERVAL_MS = 2 * 60 * 1000
    setTimeout(() => {
        void (async () => {
            try {
                const { bootstrapHuginnSubscriptions } = await import('./huginn')
                await bootstrapHuginnSubscriptions(db)
                console.log('[huginn] subscriptions bootstrapped')
            } catch (err: any) {
                console.error('[huginn] bootstrap failed:', err?.message?.slice(0, 120))
            }
        })()
    }, 100_000) // 100s after boot — settle behind heimdall + bus init
    setInterval(() => {
        void (async () => {
            try {
                const { runHuginnPollCycle } = await import('./huginn')
                await runHuginnPollCycle(db)
            } catch (err: any) {
                console.error('[huginn] poll cycle error:', err?.message?.slice(0, 120))
            }
        })()
    }, HUGINN_INTERVAL_MS)
    console.log('[huginn] wise-advisor armed (2min poll cadence; bootstrap in 100s)')
} else {
    console.log('[huginn] disabled (HUGINN_OFF=true)')
}

// ─── REPUTATION CRON — S31 H2 ───────────────────────────────────────────────
// Daily pass: scores any prediction whose horizon has expired, recomputes
// reputation rollups + risk_limit multipliers per affected agent, snapshots
// to history table for trend analysis. Disable with REPUTATION_CRON_OFF=true.
if (process.env.REPUTATION_CRON_OFF !== 'true') {
    const REPUTATION_INTERVAL_MS = 6 * 60 * 60 * 1000  // every 6h; daily would skip same-day vault-survival flips
    const runReputation = async () => {
        try {
            const { runReputationCycle } = await import('./reputation')
            await runReputationCycle(db)
        } catch (err: any) {
            console.error('[reputation] cycle error:', err?.message?.slice(0, 120))
        }
        // Piggyback budget period-rollover (S32) — same 6h cadence is fine
        // since 7d-period boundaries don't need sub-hourly precision.
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
    // Boot delay 4 min so heimdall + bus settle first.
    setTimeout(() => { void runReputation() }, 4 * 60 * 1000)
    setInterval(() => { void runReputation() }, REPUTATION_INTERVAL_MS)
    console.log('[reputation] cron armed (6h cadence; first run in 4min) + budget-rollover piggyback')
} else {
    console.log('[reputation] disabled (REPUTATION_CRON_OFF=true)')
}

// ─── HL POSITION SYNC CRON — S32 (Phase 1.2) ────────────────────────────────
// Hourly sweep that refreshes last_known_value_usd for active/withdrawing
// HL vault positions. Read-only on-chain (no writes), safe to run today.
// Disable with HL_POSITION_SYNC_OFF=true.
if (process.env.HL_POSITION_SYNC_OFF !== 'true') {
    const HL_SYNC_INTERVAL_MS = 60 * 60 * 1000  // hourly
    const runHlSync = async () => {
        try {
            const { runHlPositionSyncCycle } = await import('./hl-routes')
            const result = await runHlPositionSyncCycle(db)
            if (result.scanned > 0) {
                console.log(`[hl-sync] scanned=${result.scanned} refreshed=${result.refreshed} failed=${result.failed}`)
            }
        } catch (err: any) {
            console.error('[hl-sync] cycle error:', err?.message?.slice(0, 120))
        }
    }
    // Boot delay 6 min so reputation + huginn finish their first cycles first.
    setTimeout(() => { void runHlSync() }, 6 * 60 * 1000)
    setInterval(() => { void runHlSync() }, HL_SYNC_INTERVAL_MS)
    console.log('[hl-sync] cron armed (1h cadence; first run in 6min)')
} else {
    console.log('[hl-sync] disabled (HL_POSITION_SYNC_OFF=true)')
}

// ─── SANDBOX RECONCILIATION + CLEANUP — S32 ─────────────────────────────────
// On boot: reconcile orphaned sandbox sessions (Anvil PIDs that died with
// the previous middleware process). Then run a 15-minute cleanup cron
// that tears down expired + idle sessions. Disable with SANDBOX_OFF=true.
if (process.env.SANDBOX_OFF !== 'true') {
    // Boot reconciliation — run once, ~10s after boot so DB pool is settled.
    setTimeout(async () => {
        try {
            const { reconcileOrphanedSessions } = await import('./sandbox/orchestrator')
            const result = await reconcileOrphanedSessions(db)
            if (result.reapedReady > 0 || result.reapedSpawning > 0) {
                console.log(`[sandbox:reconcile] reaped ${result.reapedReady} ready + ${result.reapedSpawning} stuck-spawning sessions`)
            } else {
                console.log('[sandbox:reconcile] no orphans found')
            }
        } catch (err: any) {
            console.error('[sandbox:reconcile] boot reconciliation failed:', err?.message?.slice(0, 200))
        }
    }, 10 * 1000)

    // Cleanup cron — every 15 min, tear down expired + idle sessions.
    const SANDBOX_CLEANUP_INTERVAL_MS = 15 * 60 * 1000
    const runSandboxCleanup = async () => {
        try {
            const { teardownSandbox } = await import('./sandbox/orchestrator')
            // Find sessions ready for teardown: past expires_at OR idle past
            // last_active_at + ttl_idle_seconds. Cap each pass at 20 to bound
            // the cron's runtime.
            const expired = await db.query<{ id: string; reason: string }>(
                `SELECT id,
                        CASE
                          WHEN expires_at <= now() THEN 'expired'
                          ELSE 'idle'
                        END AS reason
                 FROM sandbox_sessions
                 WHERE status = 'ready'
                   AND (
                     expires_at <= now()
                     OR last_active_at + (ttl_idle_seconds || ' seconds')::interval <= now()
                   )
                 ORDER BY expires_at ASC
                 LIMIT 20`,
            )
            for (const row of expired.rows) {
                try {
                    await teardownSandbox(db, row.id)
                    console.log(`[sandbox:cleanup] torn down ${row.id} (${row.reason})`)
                } catch (err: any) {
                    console.warn(`[sandbox:cleanup] teardown failed for ${row.id}: ${err?.message?.slice(0, 120)}`)
                }
            }
        } catch (err: any) {
            console.error('[sandbox:cleanup] cycle error:', err?.message?.slice(0, 120))
        }
    }
    // Boot delay 12 min — runs after reconciliation has settled. After
    // that, every 15 min.
    setTimeout(() => { void runSandboxCleanup() }, 12 * 60 * 1000)
    setInterval(() => { void runSandboxCleanup() }, SANDBOX_CLEANUP_INTERVAL_MS)
    console.log('[sandbox] boot reconciliation scheduled in 10s; cleanup cron armed (15min cadence; first run in 12min)')
} else {
    console.log('[sandbox] disabled (SANDBOX_OFF=true)')
}

// ─── AGENT GAS BALANCE SYNC CRON — S32 ──────────────────────────────────────
// Hourly per-chain provider.getBalance() refresh for agent_gas_balances.
// Read-only on-chain. Powers the Mythos POV "gas across chains" view +
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

// ─── EXTERNAL DOC MONITOR — S31 H2 ──────────────────────────────────────────
// Daily scan of LZ + CCTP documentation. Drift in upstream docs is a leading
// indicator of "the protocol changed and we missed it" — Kelp's exploit was
// foreshadowed by quiet hardening guidance we didn't read in time. Cron runs
// once at boot (after a 60s delay so DB + heimdall settle), then every 24h.
// Disable with DOC_MONITOR=off. Each scanner persists snapshots to
// external_doc_snapshots and pings TELEGRAM_ADMIN_CHAT_ID on breaking|notable.
if (process.env.DOC_MONITOR !== 'off') {
    const DOC_MONITOR_INTERVAL_MS = 24 * 60 * 60 * 1000
    const runDocMonitorCycle = async () => {
        try {
            const { runDocScan } = await import('./scanners/external-doc-monitor')
            const { lzDocSource } = await import('./scanners/lz-doc-scanner')
            const { cctpDocSource } = await import('./scanners/cctp-doc-scanner')
            // Run sequentially so we don't overwhelm either docs host.
            await runDocScan(db, lzDocSource).catch((err: any) =>
                console.error('[doc-monitor] LZ scan error:', err?.message?.slice(0, 120))
            )
            await runDocScan(db, cctpDocSource).catch((err: any) =>
                console.error('[doc-monitor] CCTP scan error:', err?.message?.slice(0, 120))
            )
        } catch (err: any) {
            console.error('[doc-monitor] cycle error:', err?.message?.slice(0, 120))
        }
    }
    // Boot kick — 60s delay so the egress allowlist + heimdall finish init
    // before we shoot at docs.layerzero.network / developers.circle.com.
    setTimeout(() => { void runDocMonitorCycle() }, 60_000)
    setInterval(() => { void runDocMonitorCycle() }, DOC_MONITOR_INTERVAL_MS)
    console.log('[doc-monitor] Enabled — LZ + CCTP doc drift scan every 24h (first run in 60s)')
} else {
    console.log('[doc-monitor] Disabled (DOC_MONITOR=off)')
}

// ─── MYTHOS AGENT SCHEDULER ─────────────────────────────────────────────────
// Autonomous AI agent — posts content, learns, thinks, evolves
// Gated by ENABLE_GROWTH_AGENT=true (disabled by default until API keys configured)
if (process.env.ENABLE_GROWTH_AGENT === 'true') {
    console.log('[mythos] Starting Mythos — The Neural Net That Never Sleeps')

    // Hourly: check for big crypto movers, resolved markets → real-time alerts
    setInterval(() => {
        runHourlyCheck(db).catch(err =>
            console.error('[mythos] Hourly check error:', err.message?.slice(0, 80))
        )
    }, 60 * 60 * 1000) // every hour

    // Session 24 — engagement fetcher cron. Samples real likes/retweets/replies
    // per post from Moltbook + Twitter APIs, writes a fresh snapshot row to
    // post_engagement. The learning-loop consumer (future session) reads
    // these snapshots to weight format/tone/topic selection by what actually
    // performs. Runs hourly, one cycle after startup grace period.
    // Gated by ENGAGEMENT_FETCHER_ENABLED env flag — default on when any
    // platform token is set (MOLTBOOK_AGENT_TOKEN or TWITTER_BEARER_TOKEN).
    const engagementEnabled = process.env.ENGAGEMENT_FETCHER_ENABLED !== 'false'
        && !!(process.env.MOLTBOOK_AGENT_TOKEN || process.env.MOLTBOOK_API_KEY || process.env.TWITTER_BEARER_TOKEN)
    if (engagementEnabled) {
        setTimeout(() => {
            pollPostEngagement(db).catch(err =>
                console.error('[mythos] Engagement poll error:', err.message?.slice(0, 80))
            )
        }, 5 * 60 * 1000)  // 5 min after boot
        setInterval(() => {
            pollPostEngagement(db).catch(err =>
                console.error('[mythos] Engagement poll error:', err.message?.slice(0, 80))
            )
        }, 60 * 60 * 1000)  // every hour
        console.log('[mythos] Engagement fetcher: enabled, first poll in 5 min')
    } else {
        console.log('[mythos] Engagement fetcher: disabled (no platform token)')
    }

    // Fast telegram poll — Session 23 fix. Previously pollTelegramApprovals
    // only ran inside runHourlyCheck (every 60 min), which meant Richard's
    // Approve/Reject taps could sit 60+ min before being processed. Pulling
    // it out into a 10-second loop makes the buttons feel instant (typical
    // 10-20s latency from tap to Mythos posting the approved content).
    // NOTE: proper fix is wiring up /telegram/webhook via nginx reverse
    // proxy so Telegram pushes us directly (zero polling). That's a
    // Session 24 nginx config task — this interim poll is lighter weight
    // than a 60-min delay and still cheap (one getUpdates call per 10s).
    setInterval(() => {
        pollTelegramApprovals(db)
            .then(() => processApprovedPosts(db))
            .catch(err => console.error('[mythos] Telegram poll error:', err.message?.slice(0, 80)))
    }, 10 * 1000) // every 10 seconds

    // Daily: full content generation + posting cycle
    // Runs at startup then every 24 hours
    const runDaily = () => {
        runDailyGrowthCycle(db).catch(err =>
            console.error('[mythos] Daily cycle error:', err.message?.slice(0, 80))
        )
    }

    // Check if it's within the posting window (8 AM - 10 PM)
    const hour = new Date().getHours()
    if (hour >= 8 && hour <= 22) {
        // Run immediately if within window
        setTimeout(runDaily, 10_000) // 10s delay after startup
    }

    // Then schedule daily at roughly 9 AM (check every hour, run if 9 AM)
    setInterval(() => {
        const h = new Date().getHours()
        if (h === 9) runDaily()
    }, 60 * 60 * 1000)

    // Weekly: Monday at 9 AM — video script generation (handled within daily cycle via day check)
    // Monthly: 1st of month — performance review (handled within daily cycle via date check)

    // Session 26 — market watcher cron. Every 15 min scans for new prediction
    // markets + big positions and routes them through the approval pipeline
    // so Richard gets a Telegram Approve/Reject button → auto-posts to Moltbook.
    // Gated inside ENABLE_GROWTH_AGENT because it uses the same Telegram pipeline.
    startMarketWatcher(db)

    // Session 27 Sprint 5.2 — X/Twitter watcher cron. Mirror of market watcher
    // but for Twitter-optimized 280-char variants. Detects top movers (24h)
    // + hot markets (>$50 vol) and routes short-form proposals through the
    // same approval pipeline. Gated on TWITTER_API_KEY — skips cycle if unset.
    startTwitterWatcher(db)

    console.log('[mythos] Scheduled: hourly alerts, daily posts, weekly/monthly reviews, market watcher')
} else {
    console.log('[mythos] Disabled. Set ENABLE_GROWTH_AGENT=true to enable.')
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

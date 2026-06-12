/**
 * ─── ADMIN CONSOLE ───────────────────────────────────────────────────────────
 *
 * Self-contained admin dashboard served at GET /admin
 * Shows execution log, pending intents, Issuer sync status, error feed.
 *
 * Access: requires x-admin-key header OR ?key= query param for browser access.
 * URL: https://app.nuro.finance/admin?key=<KEY>
 *      or http://74.50.109.203:3000/admin?key=<KEY>
 */

import { Router, Request, Response } from 'express'
import { Pool } from 'pg'
import { forceRefreshAllowlist } from './swap'
import { forceRefreshSolanaAllowlist } from './jupiter-client'
import {
  HELM_RULES,
  helmEventSummary,
  getEgressAllowlist,
  setEgressEnforceMode,
  getEgressMode,
  setTxCapEnforceMode,
  setTxCapOverride,
  getTxCapMode,
  setFsGuardEnforceMode,
  getFsGuardMode,
} from './helm'
import { CONFIG } from './config'
import { fetchTokenAudit } from './lib/token-audit'
import { getPerformanceSummary } from './growth-agent/skills/learning-loop'
import { getBackoffState } from './card-balance-sync'
// Fee summary.inline query (fees.ts is in Expansion_Testing only)
async function getFeeSummary(db: Pool) {
  try {
    const result = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_volume, COALESCE(SUM(fee), 0) as total_fees
      FROM transactions WHERE status = 'confirmed'
    `)
    return { totalVolume: parseFloat(result.rows[0].total_volume), totalFees: parseFloat(result.rows[0].total_fees) }
  } catch { return { totalVolume: 0, totalFees: 0 } }
}

export function createAdminConsoleRouter(db: Pool, adminKey: string): Router {
  const router = Router()

  // Auth check.header or query param
  function checkAdminAuth(req: Request, res: Response): boolean {
    const headerKey = req.headers['x-admin-key']
    const queryKey = req.query.key
    if (headerKey !== adminKey && queryKey !== adminKey) {
      res.status(401).send('Unauthorized')
      return false
    }
    return true
  }

  // GET /admin.serves the full dashboard HTML
  // Session 28: added no-cache headers after a live incident where a browser
  // served stale HTML long after the backend was updated, making the dashboard
  // look broken when it was actually just a caching artifact.
  router.get('/admin', (req, res) => {
    if (!checkAdminAuth(req, res)) return
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.send(dashboardHTML(adminKey))
  })

  // API: execution log
  router.get('/admin/api/execution-log', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const entityType = req.query.entity_type as string
      const status = req.query.status as string

      let where = 'WHERE 1=1'
      const params: any[] = []
      let idx = 1
      if (entityType) { where += ` AND entity_type = $${idx++}`; params.push(entityType) }
      if (status) { where += ` AND status = $${idx++}`; params.push(status) }

      const result = await db.query(
        `SELECT * FROM execution_log ${where} ORDER BY created_at DESC LIMIT $${idx}`,
        [...params, limit]
      )
      res.json(result.rows)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: summary stats
  router.get('/admin/api/summary', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [
        pendingCardTxs,
        pendingBets,
        wonUnpaid,
        recentErrors,
        totalCards,
        frozenCards,
        issuerLinkedCards,
        recentLog,
      ] = await Promise.all([
        db.query(`SELECT COUNT(*) as c FROM card_transactions WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) as c FROM market_positions WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) as c FROM market_positions WHERE status = 'won' AND payout_tx_hash IS NULL AND payout > 0`),
        db.query(`SELECT COUNT(*) as c FROM execution_log WHERE status = 'failed' AND created_at > now() - interval '24 hours'`),
        db.query(`SELECT COUNT(*) as c FROM cards`),
        db.query(`SELECT COUNT(*) as c FROM cards WHERE is_locked = true`),
        db.query(`SELECT COUNT(*) as c FROM cards WHERE issuer_card_id IS NOT NULL`),
        db.query(`SELECT entity_type, status, COUNT(*) as c FROM execution_log WHERE created_at > now() - interval '24 hours' GROUP BY entity_type, status ORDER BY entity_type`),
      ])

      res.json({
        pending_card_transactions: parseInt(pendingCardTxs.rows[0].c),
        pending_market_bets: parseInt(pendingBets.rows[0].c),
        won_unpaid: parseInt(wonUnpaid.rows[0].c),
        errors_24h: parseInt(recentErrors.rows[0].c),
        total_cards: parseInt(totalCards.rows[0].c),
        frozen_cards: parseInt(frozenCards.rows[0].c),
        issuer_linked_cards: parseInt(issuerLinkedCards.rows[0].c),
        log_breakdown_24h: recentLog.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: pending intents detail
  router.get('/admin/api/pending', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [cardTxs, positions, transfers, cards] = await Promise.all([
        db.query(`SELECT ct.id, ct.user_id, ct.name, ct.type, ct.amount, ct.status, ct.created_at,
                         u.email, u.name as user_name
                  FROM card_transactions ct LEFT JOIN users u ON u.id = ct.user_id
                  WHERE ct.status = 'pending' ORDER BY ct.created_at DESC LIMIT 50`),
        db.query(`SELECT mp.id, mp.user_id, mp.market_id, mp.side, mp.shares, mp.cost_basis,
                         mp.status, mp.execution_tx_hash, mp.payout, mp.payout_tx_hash, mp.created_at,
                         m.question, u.email
                  FROM market_positions mp
                  LEFT JOIN markets m ON m.id = mp.market_id
                  LEFT JOIN users u ON u.id = mp.user_id
                  WHERE mp.status IN ('pending', 'won')
                  ORDER BY mp.created_at DESC LIMIT 50`),
        db.query(`SELECT t.id, t.sender_user_id, t.recipient_name, t.amount, t.status, t.created_at,
                         u.email
                  FROM transfers t LEFT JOIN users u ON u.id = t.sender_user_id
                  WHERE t.status = 'pending' ORDER BY t.created_at DESC LIMIT 50`),
        // S33 Tier 0 #1+#2: never read the raw PAN. Project from card_last_4
        // (populated by migration 041 + parallel writes in /cards POST and
        // /cards/:id/secrets). The HTML at line ~3807 just renders this
        // field; same shape, same name, masked content.
        db.query(`SELECT c.id, c.user_id,
                         COALESCE('•••• ' || c.card_last_4, '—') AS card_number,
                         c.card_holder, c.balance, c.is_locked,
                         c.issuer_card_id, c.balance_synced_at, c.is_active,
                         u.email, u.sd3_user_id, u.kyc_status
                  FROM cards c LEFT JOIN users u ON u.id = c.user_id
                  ORDER BY c.created_at DESC LIMIT 20`),
      ])
      res.json({
        card_transactions: cardTxs.rows,
        market_positions: positions.rows,
        transfers: transfers.rows,
        cards: cards.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ─── MYTHOS API ENDPOINTS ────────────────────────────────────────────────

  // API: Mythos posts feed.where posts went, what was posted
  router.get('/admin/api/mythos/posts', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 50
      const result = await db.query(
        `SELECT id, platform, post_id, post_url, content, content_type, hashtags, engagement, posted_at
         FROM growth_agent_posts ORDER BY posted_at DESC LIMIT $1`,
        [limit]
      )
      res.json(result.rows)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: Mythos approval queue.pending, approved, rejected
  router.get('/admin/api/mythos/approvals', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const result = await db.query(
        `SELECT key, value, updated_at FROM growth_agent_memory
         WHERE key LIKE 'pending_post_%' AND category = 'approval'
         ORDER BY updated_at DESC LIMIT 50`
      )
      const posts = result.rows.map(r => ({
        ...(typeof r.value === 'string' ? JSON.parse(r.value) : r.value),
        _key: r.key,
        _updated: r.updated_at,
      }))
      res.json(posts)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: Mythos approve/reject from admin console
  router.post('/admin/api/mythos/approvals/:postId', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { postId } = req.params
      const { action } = req.body  // 'approve' | 'reject'
      const key = `pending_post_${postId}`
      const result = await db.query(
        `SELECT value FROM growth_agent_memory WHERE key = $1`, [key]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' })
      }
      const post = typeof result.rows[0].value === 'string' ? JSON.parse(result.rows[0].value) : result.rows[0].value
      post.status = action === 'approve' ? 'approved' : 'rejected'
      post.reviewedAt = new Date().toISOString()
      post.reviewNote = 'Approved via admin console'
      await db.query(
        `UPDATE growth_agent_memory SET value = $1, updated_at = now() WHERE key = $2`,
        [JSON.stringify(post), key]
      )
      res.json({ ok: true, post })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: Mythos knowledge base
  router.get('/admin/api/mythos/knowledge', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const result = await db.query(
        `SELECT key, value, category, updated_at FROM growth_agent_memory
         WHERE category LIKE 'knowledge_%'
         ORDER BY updated_at DESC LIMIT 100`
      )
      const entries = result.rows.map(r => ({
        key: r.key,
        category: r.category,
        ...(typeof r.value === 'string' ? JSON.parse(r.value) : r.value),
        _updated: r.updated_at,
      }))
      res.json(entries)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: Mythos identity + stats
  router.get('/admin/api/mythos/identity', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [identity, memory, cycles, thoughts] = await Promise.all([
        db.query(`SELECT value FROM growth_agent_memory WHERE key = 'agent_identity'`),
        db.query(`SELECT category, COUNT(*) as c FROM growth_agent_memory GROUP BY category ORDER BY c DESC`),
        db.query(`SELECT COUNT(*) as c FROM execution_log WHERE entity_type = 'growth_agent' AND action = 'daily_cycle' AND created_at > now() - interval '30 days'`),
        db.query(`SELECT detail, created_at FROM execution_log WHERE entity_type = 'growth_agent' AND action = 'inner_monologue' ORDER BY created_at DESC LIMIT 5`),
      ])

      const id = identity.rows[0]?.value || {}
      res.json({
        identity: typeof id === 'string' ? JSON.parse(id) : id,
        memory_breakdown: memory.rows,
        cycles_30d: parseInt(cycles.rows[0]?.c || '0'),
        recent_thoughts: thoughts.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ─── EXECUTION LAYER API ──────────────────────────────────────────────────

  // API: Card balance drift (Sprint D).telemetry on Issuer-sync cache freshness
  router.get('/admin/api/card-balance-drift', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [topDrift, neverSynced, trend24h] = await Promise.all([
        db.query(
          `SELECT c.id, c.user_id, c.balance, c.balance_last_drift, c.balance_source,
                  c.balance_synced_at, u.email
           FROM cards c
           LEFT JOIN users u ON u.id = c.user_id
           WHERE c.is_active = true
           ORDER BY c.balance_last_drift DESC NULLS LAST
           LIMIT 20`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT COUNT(*)::int AS count FROM cards
           WHERE is_active = true AND (balance_source = 'never_synced' OR balance_source IS NULL)`
        ).catch(() => ({ rows: [{ count: 0 }] })),
        db.query(
          `SELECT action, status, COUNT(*)::int AS n
           FROM execution_log
           WHERE entity_type = 'issuer_sync'
             AND created_at > now() - interval '24 hours'
           GROUP BY action, status
           ORDER BY n DESC`
        ).catch(() => ({ rows: [] })),
      ])
      res.json({
        top_drift: topDrift.rows,
        never_synced_count: neverSynced.rows[0]?.count || 0,
        trend_24h: trend24h.rows,
      })
    } catch (err: any) {
      console.error('[admin/card-balance-drift]', err.message?.slice(0, 120))
      res.status(500).json({ error: 'Query failed' })
    }
  })

  // API: Card settlements (Sprint B).vault → Issuer routing status
  router.get('/admin/api/card-settlements', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 50
      const [summary, recent, stuck] = await Promise.all([
        db.query(
          `SELECT status, COUNT(*)::int AS count,
                  COALESCE(SUM(amount), 0)::numeric AS total_amount,
                  COALESCE(SUM(fee_amount), 0)::numeric AS total_fees
           FROM card_settlements
           WHERE created_at > now() - interval '30 days'
           GROUP BY status
           ORDER BY count DESC`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT cs.id, cs.user_id, cs.position_id, cs.amount, cs.fee_amount, cs.forward_amount,
                  cs.destination, cs.status, cs.attempt_count, cs.last_attempted_at,
                  cs.fee_tx_hash, cs.forward_tx_hash, cs.refund_tx_hash, cs.error_message,
                  cs.created_at, cs.completed_at, u.email
           FROM card_settlements cs
           LEFT JOIN users u ON u.id = cs.user_id
           ORDER BY cs.created_at DESC LIMIT $1`,
          [limit]
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT cs.id, cs.user_id, cs.amount, cs.status, cs.attempt_count, cs.error_message,
                  cs.fee_tx_hash, cs.forward_tx_hash, u.email
           FROM card_settlements cs
           LEFT JOIN users u ON u.id = cs.user_id
           WHERE cs.status LIKE 'failed%' OR cs.attempt_count >= 5
           ORDER BY cs.created_at DESC LIMIT 20`
        ).catch(() => ({ rows: [] })),
      ])
      res.json({
        summary_30d: summary.rows,
        recent: recent.rows,
        needs_attention: stuck.rows,
      })
    } catch (err: any) {
      console.error('[admin/card-settlements]', err.message?.slice(0, 120))
      res.status(500).json({ error: 'Query failed' })
    }
  })

  // API: On-chain transactions (deposits, bridges, withdrawals)
  router.get('/admin/api/execution-layer', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const [transactions, withdrawals, deposits, chainVolume, recentExec, feeSummary] = await Promise.all([
        db.query(
          `SELECT t.id, t.user_id, t.user_wallet, t.base_deposit_address, t.source_chain, t.dest_chain,
                  t.token, t.amount, t.fee, t.forwarded, t.route, t.tx_hash, t.status, t.timestamp,
                  u.email,
                  el.error_message as error_reason,
                  el.detail as error_detail
           FROM transactions t
           LEFT JOIN users u ON u.id = t.user_id
           LEFT JOIN LATERAL (
             SELECT error_message, detail FROM execution_log
             WHERE entity_id = t.id::text AND status = 'failed'
             ORDER BY created_at DESC LIMIT 1
           ) el ON true
           ORDER BY t.timestamp DESC LIMIT $1`,
          [limit]
        ),
        db.query(
          `SELECT el.*, u.email FROM execution_log el LEFT JOIN users u ON u.id = el.user_id
           WHERE el.entity_type IN ('withdrawal', 'card_withdrawal', 'issuer_withdrawal')
           ORDER BY el.created_at DESC LIMIT 50`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT el.*, u.email FROM execution_log el LEFT JOIN users u ON u.id = el.user_id
           WHERE el.entity_type IN ('deposit', 'issuer_webhook', 'issuer_sync') AND el.action LIKE '%deposit%'
           ORDER BY el.created_at DESC LIMIT 50`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT source_chain, COUNT(*) as tx_count, SUM(amount) as total_volume, SUM(fee) as total_fees
           FROM transactions GROUP BY source_chain ORDER BY total_volume DESC`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT entity_type, action, status, detail, tx_hash, created_at
           FROM execution_log
           WHERE tx_hash IS NOT NULL AND tx_hash != ''
           ORDER BY created_at DESC LIMIT 50`
        ).catch(() => ({ rows: [] })),
        getFeeSummary(db),
      ])

      res.json({
        transactions: transactions.rows,
        withdrawals: withdrawals.rows,
        deposits: deposits.rows,
        chain_volume: chainVolume.rows,
        recent_onchain: recentExec.rows,
        fee_summary: feeSummary,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: monitor skip telemetry.surfaces Sprint 6.1 logMonitorSkip() output
  // so Richard can see WHY deposits are being skipped without running psql.
  // Returns: aggregated count by reason (last 24h) + most recent 20 rows.
  // Sprint 6.5.Deposit Funnel: detect → bridge → Issuer → card credit.
  // Returns aggregate counts per chain over last 24h + overall medians.
  router.get('/admin/api/deposit-funnel', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    // Sprint 6.5 polish.24h default, 7d optional. Clamp to known values.
    const rangeParam = String(req.query.range || '24h')
    const range = rangeParam === '7d' ? '7 days' : '24 hours'
    // Sparkline bucket count.24 for 24h (hourly), 7 for 7d (daily)
    const bucketCount = range === '7 days' ? 7 : 24
    const bucketUnit = range === '7 days' ? 'day' : 'hour'   // singular for interval math
    try {
      const [perChain, overall, buckets] = await Promise.all([
        db.query(
          `SELECT source_chain AS chain_id,
                  COUNT(*) FILTER (WHERE status IN ('pending','confirmed','failed','failed_restart')) AS detected,
                  COUNT(*) FILTER (WHERE status = 'confirmed') AS bridged,
                  COUNT(*) FILTER (WHERE status IN ('failed','failed_restart')) AS failed,
                  COUNT(*) FILTER (WHERE status = 'pending') AS pending
           FROM transactions
           WHERE created_at > now() - interval '${range}'
           GROUP BY source_chain
           ORDER BY detected DESC`
        ),
        // Migration 026 added confirmed_at. Real avg confirm latency
        // now flows. Historic rows backfilled to confirmed_at = created_at
        // show 0s; rolling window ages out to real values within a day of deploy.
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE status IN ('pending','confirmed','failed','failed_restart')) AS total_detected,
             COUNT(*) FILTER (WHERE status = 'confirmed') AS total_bridged,
             COUNT(*) FILTER (WHERE status IN ('failed','failed_restart')) AS total_failed,
             COUNT(*) FILTER (WHERE status = 'pending') AS total_pending,
             ROUND(EXTRACT(EPOCH FROM AVG(confirmed_at - created_at) FILTER (WHERE status = 'confirmed' AND confirmed_at IS NOT NULL)))::int AS avg_confirm_seconds
           FROM transactions
           WHERE created_at > now() - interval '${range}'`
        ),
        // Sparkline buckets.generate_series ensures empty buckets emit
        // zero rather than being missing. Left-join on the truncated
        // bucket edge. Counts detected + bridged + failed per bucket for
        // stacked rendering on the client.
        db.query(
          `WITH buckets AS (
             SELECT generate_series(
               date_trunc('${bucketUnit}', now()) - interval '${bucketCount - 1} ${bucketUnit}',
               date_trunc('${bucketUnit}', now()),
               interval '1 ${bucketUnit}'
             ) AS bucket_start
           )
           SELECT b.bucket_start,
                  COUNT(t.id) FILTER (WHERE t.status IN ('pending','confirmed','failed','failed_restart')) AS detected,
                  COUNT(t.id) FILTER (WHERE t.status = 'confirmed') AS bridged,
                  COUNT(t.id) FILTER (WHERE t.status IN ('failed','failed_restart')) AS failed
           FROM buckets b
           LEFT JOIN transactions t
             ON t.created_at >= b.bucket_start
            AND t.created_at < b.bucket_start + interval '1 ${bucketUnit}'
           GROUP BY b.bucket_start
           ORDER BY b.bucket_start ASC`
        ),
      ])
      const r = overall.rows[0] || {}
      res.json({
        range: range === '7 days' ? '7d' : '24h',
        per_chain: perChain.rows.map(row => ({
          chain_id: row.chain_id,
          detected: parseInt(row.detected) || 0,
          bridged: parseInt(row.bridged) || 0,
          failed: parseInt(row.failed) || 0,
          pending: parseInt(row.pending) || 0,
          success_rate: row.detected > 0 ? (row.bridged / row.detected) : null,
        })),
        overall: {
          detected: parseInt(r.total_detected) || 0,
          bridged: parseInt(r.total_bridged) || 0,
          failed: parseInt(r.total_failed) || 0,
          pending: parseInt(r.total_pending) || 0,
          success_rate: r.total_detected > 0 ? (r.total_bridged / r.total_detected) : null,
          avg_confirm_seconds: r.avg_confirm_seconds != null ? parseInt(r.avg_confirm_seconds) : null,
        },
        sparkline: buckets.rows.map(row => ({
          t: row.bucket_start,
          detected: parseInt(row.detected) || 0,
          bridged: parseInt(row.bridged) || 0,
          failed: parseInt(row.failed) || 0,
        })),
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Sprint 6.5.Chain Health: green/yellow/red per chain based on last
  // successful bridge timestamp. Lets operators see at a glance which
  // chains are healthy and which may be stuck.
  //
  // Session 26 polish (DJ flag): when POLL_INTERVAL_MS > 1h, the monitor
  // is intentionally paused and "last confirmed > 1h" doesn't mean
  // anything broke.it means we haven't polled. Emit a separate
  // `monitor_paused` flag and bump the red threshold to 48h in that
  // case so the operator doesn't stare at a sea of red for normal
  // paused-monitor operation.
  router.get('/admin/api/chain-health', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      // Treat POLL_INTERVAL > 1h as "paused" for threshold purposes.
      // Default prod POLL is either 60s (active) or 86400000ms (paused).
      const monitorPaused = CONFIG.POLL_INTERVAL_MS > 60 * 60 * 1000
      const pollIntervalSec = Math.round(CONFIG.POLL_INTERVAL_MS / 1000)

      // Thresholds adapt to paused state:
      //   active monitor:  green <1h, yellow <6h, red >6h
      //   paused monitor:  green <48h, yellow <7d, red >7d (or if stuck_pending > 0)
      const greenThresholdSec = monitorPaused ? 48 * 3600 : 3600
      const yellowThresholdSec = monitorPaused ? 7 * 24 * 3600 : 21600

      const result = await db.query(
        `SELECT source_chain AS chain_id,
                MAX(created_at) FILTER (WHERE status = 'confirmed') AS last_confirmed,
                COUNT(*) FILTER (WHERE status = 'pending' AND created_at < now() - interval '30 minutes') AS stuck_pending,
                COUNT(*) FILTER (WHERE status IN ('failed','failed_restart') AND created_at > now() - interval '1 hour') AS recent_failures
         FROM transactions
         WHERE created_at > now() - interval '7 days' AND source_chain IS NOT NULL
         GROUP BY source_chain`
      )
      const now = Date.now()
      const rows = result.rows.map(r => {
        const lastConfirmed = r.last_confirmed ? new Date(r.last_confirmed).getTime() : null
        const ageSec = lastConfirmed ? Math.round((now - lastConfirmed) / 1000) : null
        let status: 'green' | 'yellow' | 'red' | 'unknown' = 'unknown'
        // Stuck pending or recent failures are always red.these are
        // real problems regardless of monitor state (they're about
        // write-side failures, not poll-side freshness).
        if (parseInt(r.stuck_pending) > 0 || parseInt(r.recent_failures) >= 3) {
          status = 'red'
        } else if (ageSec != null && ageSec < greenThresholdSec) {
          status = 'green'
        } else if (ageSec != null && ageSec < yellowThresholdSec) {
          status = 'yellow'
        } else if (ageSec != null) {
          status = 'red'
        }
        return {
          chain_id: r.chain_id,
          status,
          last_confirmed_age_sec: ageSec,
          stuck_pending: parseInt(r.stuck_pending) || 0,
          recent_failures: parseInt(r.recent_failures) || 0,
        }
      })
      res.json({
        chains: rows,
        fetched_at: new Date().toISOString(),
        monitor_paused: monitorPaused,
        poll_interval_sec: pollIntervalSec,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 27.SD3 API health. Surfaces 429/503 rates, current backoff
  // state, and the avg latency of recent balance-sync attempts so admin can
  // see if SD3 is throttling us before users complain of stale balances.
  router.get('/admin/api/sd3-health', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [rates, recent] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'success') AS success,
             COUNT(*) FILTER (WHERE status = 'failed') AS failed,
             COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
             COUNT(*) FILTER (WHERE status = 'failed' AND error_message LIKE '%429%') AS rate_limited,
             COUNT(*) FILTER (WHERE status = 'failed' AND error_message LIKE '%503%') AS service_unavailable,
             COUNT(*) FILTER (WHERE status = 'skipped' AND detail LIKE 'in_backoff%') AS backoff_skipped,
             COUNT(*) AS total
           FROM execution_log
           WHERE entity_type = 'issuer_sync'
             AND created_at > now() - interval '24 hours'`
        ),
        db.query(
          `SELECT created_at, action, status, detail, error_message
           FROM execution_log
           WHERE entity_type = 'issuer_sync'
           ORDER BY created_at DESC LIMIT 20`
        ),
      ])
      const r = rates.rows[0] || {}
      const total = parseInt(r.total) || 0
      const backoff = getBackoffState()
      res.json({
        window_hours: 24,
        current_backoff: backoff,
        totals_24h: {
          total,
          success: parseInt(r.success) || 0,
          failed: parseInt(r.failed) || 0,
          skipped: parseInt(r.skipped) || 0,
          rate_limited: parseInt(r.rate_limited) || 0,
          service_unavailable: parseInt(r.service_unavailable) || 0,
          backoff_skipped: parseInt(r.backoff_skipped) || 0,
          success_rate: total > 0 ? (parseInt(r.success) / total) : null,
          throttle_rate: total > 0 ? ((parseInt(r.rate_limited) + parseInt(r.service_unavailable)) / total) : null,
        },
        recent: recent.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 26.Learning Loop v1. Admin visibility into per-(tone, format,
  // category) post engagement so we can tell when enough data exists to
  // flip from template selection to weighted selection.
  router.get('/admin/api/learning-loop', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const summary = await getPerformanceSummary(db)
      res.json({
        ...summary,
        exploration_rate: 0.2,
        wired_into_content: false,  // Flip true in Session 27+ when enough data flows
        note: 'Weighted tone/format selection is implemented in learning-loop.ts but not yet imported by thought-engine. Awaits ~1 week of live engagement data (needs TWITTER_BEARER_TOKEN + MOLTBOOK_AGENT_TOKEN set).',
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Sprint 2.6.scheduled intents countdown. Lists transfers + withdrawals
  // in status='scheduled' with scheduled_at in the future. Admin sees the
  // queue + countdown to execution, enabling manual cancel / intervention.
  //
  // Session 27 extension.also return history (completed / cancelled /
  // failed) so admin has full scheduled-intent lifecycle visibility, not
  // just the upcoming queue.
  router.get('/admin/api/scheduled-intents', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [transfers, withdrawals, historyTransfers, historyWithdrawals] = await Promise.all([
        // Upcoming: still scheduled, future-dated or recently due
        db.query(
          `SELECT id, sender_user_id AS user_id, amount, currency, description,
                  destination, recipient_email, scheduled_at,
                  EXTRACT(EPOCH FROM (scheduled_at - now()))::int AS seconds_until
           FROM transfers
           WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
           ORDER BY scheduled_at ASC LIMIT 50`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT id, user_id, amount, token, destination_address, scheduled_at,
                  EXTRACT(EPOCH FROM (scheduled_at - now()))::int AS seconds_until
           FROM withdrawals
           WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
           ORDER BY scheduled_at ASC LIMIT 50`
        ).catch(() => ({ rows: [] })),
        // History: once-scheduled intents that have now executed/cancelled/failed.
        // Filter: scheduled_at IS NOT NULL means "was scheduled at some point"
        // (vs immediate transfers which have NULL scheduled_at). Recent window
        // of 30 days keeps the list scannable.
        db.query(
          `SELECT id, sender_user_id AS user_id, amount, currency, description,
                  destination, recipient_email, scheduled_at, status,
                  execution_tx_hash, completed_at, created_at
           FROM transfers
           WHERE scheduled_at IS NOT NULL
             AND status != 'scheduled'
             AND (completed_at > now() - interval '30 days' OR created_at > now() - interval '30 days')
           ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 30`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT id, user_id, amount, token, destination_address, scheduled_at,
                  status, tx_hash, completed_at, created_at
           FROM withdrawals
           WHERE scheduled_at IS NOT NULL
             AND status != 'scheduled'
             AND (completed_at > now() - interval '30 days' OR created_at > now() - interval '30 days')
           ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 30`
        ).catch(() => ({ rows: [] })),
      ])
      res.json({
        transfers: transfers.rows,
        withdrawals: withdrawals.rows,
        total: transfers.rows.length + withdrawals.rows.length,
        history: {
          transfers: historyTransfers.rows,
          withdrawals: historyWithdrawals.rows,
          total: historyTransfers.rows.length + historyWithdrawals.rows.length,
        },
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 27 Sprint 2.3.Agent/bot admin observability. One-stop state
  // view: all agents + their status/type/funding/profit + bet counts +
  // recent bet outcomes. Admin can see live bot flow without SSH + psql.
  router.get('/admin/api/agents', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [summary, agents, recentBets] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*)                                   AS total,
             COUNT(*) FILTER (WHERE status = 'active')  AS active,
             COUNT(*) FILTER (WHERE status = 'paused')  AS paused,
             COALESCE(SUM(total_funded::numeric), 0)    AS total_funded,
             COALESCE(SUM(total_invested::numeric), 0)  AS total_invested,
             COALESCE(SUM(total_profit::numeric), 0)    AS total_profit
           FROM agents`
        ).catch(() => ({ rows: [{}] })),
        db.query(
          `SELECT a.id, a.user_id, a.name, a.type, a.status, a.wallet_address,
                  a.risk_limit, a.total_funded, a.total_invested, a.total_profit,
                  a.created_at, u.email,
                  (SELECT COUNT(*) FROM agent_bets ab WHERE ab.agent_id = a.id) AS bet_count,
                  (SELECT COUNT(*) FROM agent_bets ab WHERE ab.agent_id = a.id AND ab.status = 'won') AS wins
           FROM agents a LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.created_at DESC LIMIT 20`
        ).catch(() => ({ rows: [] })),
        db.query(
          `SELECT ab.id, ab.agent_id, a.name AS agent_name, ab.market_question,
                  ab.side, ab.amount, ab.status, ab.payout, ab.created_at,
                  ab.order_id
           FROM agent_bets ab JOIN agents a ON a.id = ab.agent_id
           ORDER BY ab.created_at DESC LIMIT 20`
        ).catch(() => ({ rows: [] })),
      ])
      const s = summary.rows[0] || {}
      res.json({
        summary: {
          total: parseInt(s.total) || 0,
          active: parseInt(s.active) || 0,
          paused: parseInt(s.paused) || 0,
          total_funded_usd: parseFloat(s.total_funded) || 0,
          total_invested_usd: parseFloat(s.total_invested) || 0,
          total_profit_usd: parseFloat(s.total_profit) || 0,
        },
        agents: agents.rows,
        recent_bets: recentBets.rows,
        clob_trades_enabled: process.env.AGENT_CLOB_TRADES_ENABLED === 'true',
        profit_sweep_enabled: process.env.AGENT_PROFIT_SWEEP_ENABLED === 'true',
        funding_observe_only: process.env.AGENT_FUNDING_OBSERVE_ONLY !== 'false',
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 27.Agent manual controls. Pause/resume/risk-limit buttons
  // on the agents panel make it actionable from admin without SSH + psql.
  // Each mutation writes to execution_log for audit.
  router.post('/admin/api/agents/:id/status', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { id } = req.params
      const { status, reason } = req.body || {}
      if (!['active', 'paused'].includes(status)) {
        return res.status(400).json({ error: 'status must be: active | paused' })
      }
      const result = await db.query(
        `UPDATE agents SET status = $1 WHERE id = $2 RETURNING id, name, status`,
        [status, id]
      ).catch(() => ({ rowCount: 0, rows: [] }))
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Agent not found' })
      }
      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'agent', $1, 'admin_status_change', 'success', $2, now())`,
        [id, `admin set status → ${status}${reason ? ' | reason: ' + String(reason).slice(0, 200) : ''}`]
      ).catch(() => {})
      res.json({ ok: true, agent: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 28 Task 6.email → userId lookup for admin UIs that accept
  // "user" as a convenience field. Returns { id, email } or 404. Admin-auth
  // only (exposes user ID + email to the admin, not the public).
  router.get('/admin/api/users/lookup', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const email = String(req.query.email || '').trim().toLowerCase()
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'email required' })
      }
      const r = await db.query(
        'SELECT id, email FROM users WHERE lower(email) = $1 LIMIT 1',
        [email]
      )
      if (r.rows.length === 0) return res.status(404).json({ error: 'not found' })
      res.json(r.rows[0])
    } catch (err: any) {
      res.status(500).json({ error: err.message?.slice(0, 200) })
    }
  })

  // Session 28 Task 6.Admin agent creation. Parity with user-facing
  // POST /nuro/agents, but admin-authed and supports targeting any user.
  // Use cases: seeding test agents for QA, recreating an agent for a
  // support issue, ops-triggered deploys before the public release.
  //
  // Payload: { userId, name, type?, riskLimit?, cardId?, strategy? }
  // userId is REQUIRED.we never default to "the admin's user" because
  // the admin is typically a different identity from the target user.
  router.post('/admin/api/agents/create', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const {
        userId,
        name,
        type = 'polymarket',
        riskLimit = 100,
        cardId,
        strategy = { mode: 'passive', categories: ['politics', 'crypto', 'sports'] },
      } = req.body || {}

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId required' })
      }
      if (!name || typeof name !== 'string' || name.length > 80) {
        return res.status(400).json({ error: 'name required (≤80 chars)' })
      }
      if (!['polymarket'].includes(type)) {
        return res.status(400).json({ error: 'type must be: polymarket (more soon)' })
      }
      const riskNum = Number(riskLimit)
      if (!Number.isFinite(riskNum) || riskNum < 0 || riskNum > 10000) {
        return res.status(400).json({ error: 'riskLimit must be 0–10000' })
      }

      // Verify user exists
      const userCheck = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId])
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Card validation.if cardId provided, must belong to target user.
      // Otherwise auto-link to primary card (same logic as user-facing route).
      let linkedCardId: string | null = cardId || null
      if (linkedCardId) {
        const cardCheck = await db.query(
          'SELECT id FROM cards WHERE id = $1 AND user_id = $2 LIMIT 1',
          [linkedCardId, userId]
        )
        if (cardCheck.rows.length === 0) {
          return res.status(400).json({ error: 'cardId does not belong to user' })
        }
      } else {
        const primaryCard = await db.query(
          `SELECT id FROM cards WHERE user_id = $1 AND is_active = true
           ORDER BY balance DESC LIMIT 1`,
          [userId]
        ).catch(() => ({ rows: [] as Array<{ id: string }> }))
        if (primaryCard.rows.length) linkedCardId = primaryCard.rows[0].id
      }

      // Deterministic wallet from PRIVATE_KEY + agentId.same pattern as
      // nuro-routes.ts generateAgentWallet, deduplicated here to avoid an
      // import cycle into nuro-routes.ts for an admin helper.
      const { randomUUID: _uuid } = await import('crypto')
      const ethers = await import('ethers')
      const agentId = _uuid()
      const seed = ethers.utils.id((process.env.PRIVATE_KEY || '') + 'agent_' + agentId)
      const hdNode = ethers.utils.HDNode.fromSeed(seed)
      const walletAddress = hdNode.address

      await db.query(
        `INSERT INTO agents (id, user_id, name, type, wallet_address, card_id, risk_limit, strategy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [agentId, userId, name, type, walletAddress, linkedCardId, riskNum, JSON.stringify(strategy)]
      )

      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'agent', $1, 'admin_agent_create', 'success', $2, now())`,
        [agentId, `admin created agent "${name}" for user=${userId} type=${type} risk=$${riskNum} card=${linkedCardId || 'none'}`]
      ).catch(() => {})

      const result = await db.query('SELECT * FROM agents WHERE id = $1', [agentId])
      res.status(201).json({
        ok: true,
        agent: result.rows[0],
        fundingInstructions: {
          address: walletAddress,
          chain: 'Polygon',
          token: 'USDC',
          recommendedUsd: riskNum <= 50 ? 50 : riskNum <= 100 ? 150 : 300,
        },
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message?.slice(0, 200) || 'Agent creation failed' })
    }
  })

  router.post('/admin/api/agents/:id/risk-limit', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { id } = req.params
      const { riskLimit, reason } = req.body || {}
      const limit = parseFloat(String(riskLimit))
      if (!Number.isFinite(limit) || limit < 0 || limit > 10000) {
        return res.status(400).json({ error: 'riskLimit must be 0–10000' })
      }
      const result = await db.query(
        `UPDATE agents SET risk_limit = $1 WHERE id = $2 RETURNING id, name, risk_limit`,
        [limit, id]
      ).catch(() => ({ rowCount: 0, rows: [] }))
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Agent not found' })
      }
      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'agent', $1, 'admin_risk_limit_change', 'success', $2, now())`,
        [id, `admin set risk_limit → $${limit}${reason ? ' | reason: ' + String(reason).slice(0, 200) : ''}`]
      ).catch(() => {})
      res.json({ ok: true, agent: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 27.Prediction market admin. Aggregate view of market state,
  // creator stakes, position flow, and operator hooks for manual resolution /
  // creator refund audit. Complements the /market skill docs with a live panel.
  router.get('/admin/api/markets', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [summary, active, stuckPositions, creatorAudit] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'active')           AS active_count,
             COUNT(*) FILTER (WHERE status = 'resolved')         AS resolved_count,
             COUNT(DISTINCT creator_id) FILTER (WHERE creator_stake > 0) AS creators_with_stake,
             COALESCE(SUM(total_volume::numeric) FILTER (WHERE status = 'active'), 0) AS active_volume,
             COALESCE(SUM(creator_stake::numeric) FILTER (WHERE creator_stake_refund_tx_hash IS NULL AND creator_stake > 0), 0) AS unrefunded_stake
           FROM markets`
        ),
        db.query(
          `SELECT m.id, m.question, m.category, m.status, m.total_volume,
                  m.yes_pool, m.no_pool, m.resolution_date, m.resolution_source,
                  m.escrow_address, m.creator_id, m.creator_stake,
                  m.creator_reward_amount, m.creator_reward_tx_hash, m.resolved_at,
                  (SELECT COUNT(*) FROM market_positions WHERE market_id = m.id) AS position_count
           FROM markets m
           WHERE m.status = 'active'
           ORDER BY m.total_volume DESC LIMIT 20`
        ),
        db.query(
          `SELECT mp.id, mp.market_id, mp.user_id, mp.side, mp.cost_basis,
                  mp.status, mp.created_at,
                  EXTRACT(EPOCH FROM (now() - mp.created_at))::int AS age_sec,
                  m.question, m.status AS market_status
           FROM market_positions mp
           JOIN markets m ON m.id = mp.market_id
           WHERE mp.status = 'pending'
             AND mp.created_at < now() - interval '30 minutes'
           ORDER BY mp.created_at ASC LIMIT 20`
        ),
        db.query(
          `SELECT m.id, m.question, m.creator_id, m.creator_stake,
                  m.creator_reward_amount, m.creator_stake_refund_tx_hash,
                  m.creator_reward_tx_hash, m.resolved_at, m.resolved_outcome
           FROM markets m
           WHERE m.status = 'resolved'
             AND m.creator_stake > 0
             AND (m.creator_stake_refund_tx_hash IS NULL OR m.creator_reward_tx_hash IS NULL)
           ORDER BY m.resolved_at DESC LIMIT 20`
        ),
      ])
      const s = summary.rows[0] || {}
      res.json({
        summary: {
          active: parseInt(s.active_count) || 0,
          resolved: parseInt(s.resolved_count) || 0,
          creators_with_stake: parseInt(s.creators_with_stake) || 0,
          active_volume_usd: parseFloat(s.active_volume) || 0,
          unrefunded_creator_stake_usd: parseFloat(s.unrefunded_stake) || 0,
        },
        active_top_20: active.rows,
        stuck_pending_positions: stuckPositions.rows,
        creator_payout_audit: creatorAudit.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 27.manual market resolution (operator override). Guards against
  // resolving twice, validates outcome enum, writes to execution_log for audit.
  // Does NOT trigger winner payouts directly.that's the sweep's job. Here we
  // only mark status + resolved_outcome; the payout sweep (execution-dispatch)
  // picks it up on next tick.
  router.post('/admin/api/markets/:id/resolve', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { id } = req.params
      const { outcome, reason } = req.body || {}
      if (!['yes', 'no', 'invalid'].includes(outcome)) {
        return res.status(400).json({ error: 'outcome must be: yes | no | invalid' })
      }
      const result = await db.query(
        `UPDATE markets
         SET status = 'resolved', resolved_outcome = $1, resolved_at = now()
         WHERE id = $2 AND status = 'active'
         RETURNING id, question, status, resolved_outcome, total_volume`,
        [outcome, id]
      )
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Market not found or already resolved' })
      }
      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'market', $1, 'manual_resolve', 'success', $2, now())`,
        [id, `admin_resolve → ${outcome}${reason ? ' | reason: ' + String(reason).slice(0, 200) : ''}`]
      )
      res.json({ ok: true, market: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 26.stranded deposits panel. Rows where funds landed on a
  // deposit address but we can't bridge (user has no Issuer Base address,
  // or the bridge attempt failed and can't auto-retry). Admin triages
  // case-by-case: onboard the user, refund, or abandon.
  //
  // Session 27.LEFT JOIN latest stranded_triage execution_log row per
  // user_id so admin sees the triage decision alongside the stuck row.
  router.get('/admin/api/stranded', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [summary, rows, triageNotes] = await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS total,
                  COALESCE(SUM(amount::numeric), 0) AS total_usd,
                  COUNT(DISTINCT user_id) AS unique_users
           FROM transactions WHERE status = 'stranded'`
        ),
        db.query(
          `SELECT t.id, t.user_id, t.source_chain, t.amount, t.token,
                  t.user_wallet AS source_address, t.created_at,
                  u.email
           FROM transactions t LEFT JOIN users u ON u.id = t.user_id
           WHERE t.status = 'stranded'
           ORDER BY t.created_at DESC LIMIT 100`
        ),
        // Latest triage note per user_id (may span multiple users sharing
        // a stranded scenario, e.g. shared Solana address tech debt)
        db.query(
          `SELECT DISTINCT ON (entity_id) entity_id AS user_id,
                  action, detail, created_at
           FROM execution_log
           WHERE entity_type = 'stranded_triage'
           ORDER BY entity_id, created_at DESC`
        ),
      ])
      const s = summary.rows[0] || {}
      const notesByUser = new Map<string, any>()
      for (const n of triageNotes.rows) notesByUser.set(n.user_id, n)
      res.json({
        total: parseInt(s.total) || 0,
        total_usd: Number(s.total_usd) || 0,
        unique_users: parseInt(s.unique_users) || 0,
        rows: rows.rows.map(r => ({
          ...r,
          triage: notesByUser.get(r.user_id) || null,
        })),
        triage_notes: triageNotes.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 27.POST a new stranded triage decision. Lets admin record
  // future "abandoned" / "recovered via manual sweep" / "awaiting user
  // onboarding" decisions without direct DB access.
  router.post('/admin/api/stranded/triage', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { userId, action, detail } = req.body || {}
      if (!userId || !action) {
        return res.status(400).json({ error: 'userId + action required' })
      }
      const validActions = ['abandoned_orphan_user', 'abandoned_below_threshold',
        'recovered_manual_sweep', 'awaiting_user_onboarding', 'other']
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` })
      }
      const result = await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'stranded_triage', $1, $2, 'success', $3, now())
         RETURNING id, created_at`,
        [String(userId).slice(0, 200), action, String(detail || '').slice(0, 2000)]
      )
      res.json({ ok: true, ...result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Sprint 2.4.issuer webhook event flow. Shows per-event-type counts
  // + recent rows + observe-only state so admin can verify webhooks are
  // flowing and decide when to flip observe-only off.
  //
  // Session 27 live-feed polish.also return:
  //   - HMAC verification stats (pass/fail rate)
  //   - Last 20 verification attempts (even the rejected ones) so admin
  //     can distinguish "SD3 not delivering" from "delivering but HMAC
  //     rejecting" when debugging
  router.get('/admin/api/issuer-webhooks', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const [byType, recent, verifyStats, recentVerifications] = await Promise.all([
        db.query(
          `SELECT event_type, COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE processed = true) AS processed,
                  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
                  MAX(created_at) AS latest
           FROM issuer_webhook_events
           WHERE created_at > now() - interval '30 days'
           GROUP BY event_type
           ORDER BY total DESC`
        ),
        db.query(
          `SELECT id, event_type, issuer_user_id, processed, process_result,
                  created_at, sd3_webhook_id
           FROM issuer_webhook_events
           ORDER BY created_at DESC LIMIT 20`
        ),
        db.query(
          `SELECT
             COUNT(*)                                             AS total,
             COUNT(*) FILTER (WHERE signature_verified = true)    AS verified,
             COUNT(*) FILTER (WHERE signature_verified = false)   AS rejected,
             COUNT(*) FILTER (WHERE received_at > now() - interval '24 hours') AS last_24h,
             MAX(received_at)                                     AS latest
           FROM webhook_verifications WHERE webhook_source = 'issuer'`
        ).catch(() => ({ rows: [{}] })),
        db.query(
          `SELECT id, signature_verified, source_ip, received_at,
                  SUBSTRING(signature_provided FROM 1 FOR 24) AS sig_prefix,
                  SUBSTRING(request_body_hash FROM 1 FOR 16) AS body_prefix
           FROM webhook_verifications
           WHERE webhook_source = 'issuer'
           ORDER BY received_at DESC LIMIT 20`
        ).catch(() => ({ rows: [] })),
      ])
      const v = verifyStats.rows[0] || {}
      res.json({
        observe_only: process.env.ISSUER_WEBHOOK_OBSERVE_ONLY === 'true',
        by_type: byType.rows.map(r => ({
          event_type: r.event_type,
          total: parseInt(r.total) || 0,
          processed: parseInt(r.processed) || 0,
          last_24h: parseInt(r.last_24h) || 0,
          latest: r.latest,
        })),
        recent: recent.rows,
        verification_stats: {
          total: parseInt(v.total) || 0,
          verified: parseInt(v.verified) || 0,
          rejected: parseInt(v.rejected) || 0,
          last_24h: parseInt(v.last_24h) || 0,
          latest: v.latest || null,
          verify_rate: (parseInt(v.total) || 0) > 0
            ? parseInt(v.verified) / parseInt(v.total)
            : null,
        },
        recent_verifications: recentVerifications.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Sprint 6.1 thin slice.transaction detail lookup for skip-row UUID links.
  // Monitor skip detail messages include the collided tx's UUID ("matches
  // failed tx 98579971-..."). The admin panel renders UUIDs as clickable
  // chips that call this endpoint to pop up the full tx row.
  router.get('/admin/api/transaction/:id', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const id = req.params.id
      // UUID format check.prevent arbitrary string injection
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ error: 'Invalid UUID format' })
      }
      const result = await db.query(
        `SELECT t.*, u.email
         FROM transactions t LEFT JOIN users u ON u.id = t.user_id
         WHERE t.id = $1`,
        [id]
      )
      if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found' })
      res.json(result.rows[0])
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Sprint 6.4 thin slice.failed_restart panel. Lists transactions that
  // died mid-flight during a prior pm2 restart so admin can check whether
  // user funds actually landed on Base before considering lost.
  router.get('/admin/api/failed-restart', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 50
      const [summary, rows] = await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE timestamp > $1)::int AS last_24h
           FROM transactions
           WHERE status = 'failed_restart'`,
          [Date.now() - 24 * 60 * 60 * 1000]
        ),
        db.query(
          `SELECT id, user_id, source_chain, dest_chain, token, amount, forwarded,
                  base_deposit_address, tx_hash, created_at, timestamp
           FROM transactions
           WHERE status = 'failed_restart'
           ORDER BY timestamp DESC LIMIT $1`,
          [limit]
        ),
      ])
      res.json({
        total: summary.rows[0].total || 0,
        last_24h: summary.rows[0].last_24h || 0,
        rows: rows.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/admin/api/monitor-skips', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 20
      const [byReason, recent] = await Promise.all([
        db.query(
          `SELECT action AS reason, COUNT(*) AS count
           FROM execution_log
           WHERE entity_type = 'monitor' AND status = 'skipped'
             AND created_at > now() - interval '24 hours'
           GROUP BY action
           ORDER BY count DESC`
        ),
        db.query(
          `SELECT id, entity_id AS deposit_address, action AS reason, detail, created_at
           FROM execution_log
           WHERE entity_type = 'monitor' AND status = 'skipped'
           ORDER BY created_at DESC LIMIT $1`,
          [limit]
        ),
      ])
      res.json({
        by_reason_24h: byReason.rows.map(r => ({ reason: r.reason, count: parseInt(r.count) })),
        recent: recent.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: Marathon 7 swap attempts.surfaces logSwapAttempt entries from execution_log.
  // Mirrors monitor-skips pattern: aggregated counts by action (last 24h) + recent rows.
  // Action codes from swap.ts logSwapAttempt:
  //   - native_swap (status=success)
  //   - native_swap:below_threshold, native_swap:insufficient_for_gas,
  //     native_swap:tx_reverted, native_swap:exception (status=failed)
  router.get('/admin/api/swap-attempts', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = parseInt(req.query.limit as string) || 20
      const [byAction, recent] = await Promise.all([
        db.query(
          `SELECT action, status, COUNT(*) AS count
           FROM execution_log
           WHERE entity_type = 'swap'
             AND created_at > now() - interval '24 hours'
           GROUP BY action, status
           ORDER BY count DESC`
        ),
        db.query(
          `SELECT id, entity_id AS deposit_address, action, status, detail, created_at
           FROM execution_log
           WHERE entity_type = 'swap'
           ORDER BY created_at DESC LIMIT $1`,
          [limit]
        ),
      ])
      res.json({
        by_action_24h: byAction.rows.map(r => ({ action: r.action, status: r.status, count: parseInt(r.count) })),
        recent: recent.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── ERC-20 Allowlist Admin (Session 23 Thread D) ─────────────────────────
  // Admin can list, enable/disable, or add ERC-20s without redeploy. Every
  // write force-refreshes the in-memory snapshot so changes take effect
  // immediately (not after the 60s TTL). Policy enforcement lives in
  // Neural Net/Claude Memory/Memecoin Allowlist Policy.md.

  // GET /admin/api/erc20-allowlist.list everything, grouped by chain.
  router.get('/admin/api/erc20-allowlist', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const result = await db.query(
        `SELECT id, chain_id, symbol, display_name, contract_address, decimals,
                category, enabled, audited_at, audit_notes, min_liquidity_usd,
                created_at, updated_at
         FROM erc20_allowlist
         ORDER BY chain_id, category DESC, symbol`
      )
      res.json({
        count: result.rows.length,
        rows: result.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/erc20-allowlist/:id/toggle.flip enabled on/off.
  router.post('/admin/api/erc20-allowlist/:id/toggle', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const id = req.params.id
      const result = await db.query(
        `UPDATE erc20_allowlist
         SET enabled = NOT enabled
         WHERE id = $1
         RETURNING id, chain_id, symbol, enabled`,
        [id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
      // Force immediate snapshot refresh so the swap engine sees the change.
      await forceRefreshAllowlist()
      res.json({ ok: true, token: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/erc20-allowlist.add a new token. Requires caller to
  // have done the Memecoin Allowlist Policy review beforehand (we can't
  // fully automate it.the scam-flag + community-rep checks need judgment).
  router.post('/admin/api/erc20-allowlist', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { chainId, symbol, displayName, contractAddress, decimals, category, auditNotes, minLiquidityUsd, enabled } = req.body || {}
      if (!chainId || !symbol || !contractAddress || !decimals || !category) {
        return res.status(400).json({ error: 'chainId, symbol, contractAddress, decimals, category required' })
      }
      if (!['bluechip', 'memecoin'].includes(category)) {
        return res.status(400).json({ error: 'category must be bluechip or memecoin' })
      }
      const result = await db.query(
        `INSERT INTO erc20_allowlist
         (chain_id, symbol, display_name, contract_address, decimals, category, enabled, audited_at, audit_notes, min_liquidity_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9)
         ON CONFLICT (chain_id, symbol) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           contract_address = EXCLUDED.contract_address,
           decimals = EXCLUDED.decimals,
           category = EXCLUDED.category,
           enabled = EXCLUDED.enabled,
           audit_notes = EXCLUDED.audit_notes,
           min_liquidity_usd = EXCLUDED.min_liquidity_usd,
           updated_at = now()
         RETURNING id, chain_id, symbol, enabled`,
        [
          Number(chainId),
          String(symbol).toUpperCase(),
          displayName || symbol,
          contractAddress,
          Number(decimals),
          category,
          enabled !== false,  // default true
          auditNotes || null,
          Number(minLiquidityUsd || 0),
        ]
      )
      await forceRefreshAllowlist()
      res.json({ ok: true, token: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // HELM (Session 30 H1.security plane audit log)
  // ─────────────────────────────────────────────────────────────────────────

  // GET /admin/api/contracts.public contracts manifest (S35 Marathon 11)
  // Mirrors /contracts.html. Single source of truth for the address list lives
  // in this endpoint so admin + public surfaces never drift.
  router.get('/admin/api/contracts', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      res.json({
        fetchedAt: new Date().toISOString(),
        oftAdapter: [
          { chain: 'Base',       chainId: 8453,   address: '0xA150EC8B718C22E12036f916d90FF72af14B3E96', block: '43,065,841',  explorer: 'https://basescan.org/address/0xA150EC8B718C22E12036f916d90FF72af14B3E96' },
          { chain: 'Arbitrum',   chainId: 42161,  address: '0xd58C1412e50fF00212770B170D86e2387D2d2b18', block: '441,771,079', explorer: 'https://arbiscan.io/address/0xd58C1412e50fF00212770B170D86e2387D2d2b18' },
          { chain: 'BSC',        chainId: 56,     address: '0xce4c2270890267aC860fdc72b6946359d0898675', block: null,          explorer: 'https://bscscan.com/address/0xce4c2270890267aC860fdc72b6946359d0898675' },
          { chain: 'Celo',       chainId: 42220,  address: '0xA150EC8B718C22E12036f916d90FF72af14B3E96', block: '61,633,777',  explorer: 'https://celoscan.io/address/0xA150EC8B718C22E12036f916d90FF72af14B3E96' },
          { chain: 'Gnosis',     chainId: 100,    address: '0xA150EC8B718C22E12036f916d90FF72af14B3E96', block: '45,153,715',  explorer: 'https://gnosisscan.io/address/0xA150EC8B718C22E12036f916d90FF72af14B3E96' },
          { chain: 'Scroll',     chainId: 534352, address: '0xA150EC8B718C22E12036f916d90FF72af14B3E96', block: '31,907,962',  explorer: 'https://scrollscan.com/address/0xA150EC8B718C22E12036f916d90FF72af14B3E96' },
          { chain: 'zkSync Era', chainId: 324,    address: '0xA150EC8B718C22E12036f916d90FF72af14B3E96', block: '69,073,536',  explorer: 'https://explorer.zksync.io/address/0xA150EC8B718C22E12036f916d90FF72af14B3E96' },
        ],
        oftToken: [
          { chain: 'Arbitrum', address: '0xCf06b8A18b49c6b26b11426F8Cd9d697ba714134', block: '439,422,870', explorer: 'https://arbiscan.io/address/0xCf06b8A18b49c6b26b11426F8Cd9d697ba714134' },
        ],
        feeVaults: [
          { label: 'EVM Fee Vault', chain: 'Base',   address: '0x749edFC84A28793ce150d4E7E71bcEe73C454b56', explorer: 'https://basescan.org/address/0x749edFC84A28793ce150d4E7E71bcEe73C454b56' },
          { label: 'SPL Fee Vault', chain: 'Solana', address: 'GZxqx21AX1uXgDv86mveNmaBS7fSK1AyxAMxkYRsMf8t', explorer: 'https://solscan.io/account/GZxqx21AX1uXgDv86mveNmaBS7fSK1AyxAMxkYRsMf8t' },
        ],
        x402Vaults: [
          { label: 'x402 Revenue (Base)',   chain: 'Base / Base Sepolia', address: '0x050cdf3608664bD667586393986cF8803f1Cd1B8', explorer: 'https://basescan.org/address/0x050cdf3608664bD667586393986cF8803f1Cd1B8' },
          { label: 'Mythos Agent Vault',    chain: 'Base / Base Sepolia', address: '0xe9e54C01Eea4fB8a429BE8975567077AFA6929aa', explorer: 'https://basescan.org/address/0xe9e54C01Eea4fB8a429BE8975567077AFA6929aa' },
        ],
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // GET /admin/api/helm.rule catalog + 24h event summary + allowlist + per-rule modes
  router.get('/admin/api/helm', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const summary = await helmEventSummary(24 * 60 * 60 * 1000)
      const egress = getEgressMode()
      const txcap = getTxCapMode()
      const fsg = getFsGuardMode()
      res.json({
        rules: HELM_RULES,
        summary,
        egressAllowlist: getEgressAllowlist(),
        env: {
          logScanEnabled: process.env.HELM_LOG_SCAN !== 'off',
          // HELM-101 (egress)
          egressEnforce: egress.mode === 'enforce',
          egressSource: egress.source,
          // HELM-105 (tx cap)
          txcapEnforce: txcap.mode === 'enforce',
          txcapSource: txcap.enforceSource,
          txcapUsd: txcap.capUsd,
          txcapCapSource: txcap.capSource,
          // HELM-201/202/203 (fs guard)
          fsGuardEnforce: fsg.mode === 'enforce',
          fsGuardSource: fsg.source,
        },
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/helm/egress-mode.runtime override of HELM-101
  // enforce/observe mode. Pass {mode:'enforce'|'observe'|'env'} where 'env'
  // reverts to env-driven behavior. Operator-friendly: flip without
  // redeploy. Survives until process restart (env wins on next boot
  // unless HELM_EGRESS_ENFORCE is also set).
  router.post('/admin/api/helm/egress-mode', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const mode = String(req.body?.mode || '').toLowerCase()
      if (mode === 'enforce') {
        setEgressEnforceMode(true)
      } else if (mode === 'observe') {
        setEgressEnforceMode(false)
      } else if (mode === 'env') {
        setEgressEnforceMode(null)
      } else {
        return res.status(400).json({ error: "mode must be 'enforce' | 'observe' | 'env'" })
      }
      const next = getEgressMode()
      // Best-effort audit row so we have a paper trail of operator flips.
      db.query(
        `INSERT INTO heimdall_events (rule_id, category, severity, action, agent_id, subject, context)
         VALUES ('HELM-CTRL', 'gjallarhorn', 'medium', 'log-only', 'admin', $1,
                 jsonb_build_object('mode', $2, 'source', $3))`,
        [`Egress mode changed → ${next.mode}`, next.mode, next.source],
      ).catch(() => {})
      res.json({ ok: true, mode: next.mode, source: next.source })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/helm/txcap-mode.runtime override of HELM-105
  // enforce/observe mode + optional cap value. Body: { mode: 'enforce'|
  // 'observe'|'env', capUsd?: number|null }. capUsd=null reverts to env/default.
  router.post('/admin/api/helm/txcap-mode', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const mode = String(req.body?.mode || '').toLowerCase()
      if (mode === 'enforce') {
        setTxCapEnforceMode(true)
      } else if (mode === 'observe') {
        setTxCapEnforceMode(false)
      } else if (mode === 'env') {
        setTxCapEnforceMode(null)
      } else if (mode !== '') {
        return res.status(400).json({ error: "mode must be 'enforce' | 'observe' | 'env'" })
      }

      // Optional cap override. Send null to revert to env/default.
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'capUsd')) {
        const cap = req.body.capUsd
        if (cap === null) {
          setTxCapOverride(null)
        } else if (typeof cap === 'number' && cap > 0 && Number.isFinite(cap)) {
          setTxCapOverride(cap)
        } else {
          return res.status(400).json({ error: 'capUsd must be a positive number or null' })
        }
      }

      const next = getTxCapMode()
      db.query(
        `INSERT INTO heimdall_events (rule_id, category, severity, action, agent_id, subject, context)
         VALUES ('HELM-CTRL', 'gjallarhorn', 'medium', 'log-only', 'admin', $1,
                 jsonb_build_object('mode', $2, 'capUsd', $3, 'enforceSource', $4, 'capSource', $5))`,
        [
          `TxCap mode changed → ${next.mode} ($${next.capUsd})`,
          next.mode,
          next.capUsd,
          next.enforceSource,
          next.capSource,
        ],
      ).catch(() => {})
      res.json({ ok: true, ...next })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/helm/fs-guard-mode.runtime override of HELM-201/202/203
  // (Neural Net + skills filesystem write gate). Body: { mode }.
  router.post('/admin/api/helm/fs-guard-mode', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const mode = String(req.body?.mode || '').toLowerCase()
      if (mode === 'enforce') {
        setFsGuardEnforceMode(true)
      } else if (mode === 'observe') {
        setFsGuardEnforceMode(false)
      } else if (mode === 'env') {
        setFsGuardEnforceMode(null)
      } else {
        return res.status(400).json({ error: "mode must be 'enforce' | 'observe' | 'env'" })
      }
      const next = getFsGuardMode()
      db.query(
        `INSERT INTO heimdall_events (rule_id, category, severity, action, agent_id, subject, context)
         VALUES ('HELM-CTRL', 'gjallarhorn', 'medium', 'log-only', 'admin', $1,
                 jsonb_build_object('mode', $2, 'source', $3))`,
        [`FsGuard mode changed → ${next.mode}`, next.mode, next.source],
      ).catch(() => {})
      res.json({ ok: true, ...next })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /admin/api/helm/events?limit=N
  router.get('/admin/api/helm/events', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500)
      const result = await db.query(
        `SELECT id, rule_id, category, severity, action, agent_id, subject, context,
                occurred_at, false_positive, fp_marked_by, fp_marked_at
         FROM heimdall_events
         ORDER BY occurred_at DESC
         LIMIT $1`,
        [limit],
      )
      res.json({ count: result.rows.length, events: result.rows })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/helm/events/:id/fp.toggle false-positive label.
  // Body: { value: true | false | null, by?: string }
  // value=true marks confirmed FP, =false marks confirmed true-positive,
  // =null clears the label (back to "unlabeled"). Operator-driven; this is
  // the foundation for rule-sensitivity tuning in the self-learning loop.
  router.post('/admin/api/helm/events/:id/fp', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ error: 'event id required' })
      const raw = req.body?.value
      let value: boolean | null
      if (raw === null) value = null
      else if (raw === true || raw === 'true') value = true
      else if (raw === false || raw === 'false') value = false
      else return res.status(400).json({ error: 'value must be true | false | null' })
      const by = String(req.body?.by || 'admin').slice(0, 64)
      const upd = await db.query(
        `UPDATE heimdall_events
         SET false_positive = $1,
             fp_marked_by   = CASE WHEN $1 IS NULL THEN NULL ELSE $2 END,
             fp_marked_at   = CASE WHEN $1 IS NULL THEN NULL ELSE now() END
         WHERE id = $3
         RETURNING id, rule_id, false_positive, fp_marked_by, fp_marked_at`,
        [value, by, id],
      )
      if (upd.rows.length === 0) return res.status(404).json({ error: 'event not found' })
      res.json({ ok: true, ...upd.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // S33 Tier 1 #15.audit dispatch endpoint.
  // POST /admin/api/helm/critical-finding
  // Body: { subject, impact, locations[], foundBy, fixCommit?, djEntry?, dedupeKey?, severity? }
  // Drives logCriticalFinding (heimdall_events row + Telegram alert + dedup).
  // The pattern: audit-spawning agents (auditor skill, scheduled audit
  // crons, ad-hoc grep passes) terminate by POSTing each P0 finding
  // here. Each call is one finding.fires once per dedupeKey/6h.
  // Auth: admin-key. Bypassing this endpoint with raw SQL writes loses
  // the Telegram + dedup guarantees, so always go through it.
  router.post('/admin/api/helm/critical-finding', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const b = req.body || {}
      const subject = String(b.subject || '').slice(0, 200).trim()
      const impact = String(b.impact || '').slice(0, 1000).trim()
      const locations = Array.isArray(b.locations)
        ? b.locations.map((l: any) => String(l).slice(0, 200)).slice(0, 20)
        : []
      const foundBy = String(b.foundBy || 'manual').slice(0, 64).trim()
      const fixCommit = b.fixCommit ? String(b.fixCommit).slice(0, 64) : null
      const djEntry = b.djEntry ? String(b.djEntry).slice(0, 100) : null
      const dedupeKey = b.dedupeKey ? String(b.dedupeKey).slice(0, 200) : undefined
      const severity = b.severity === 'high' ? 'high' : 'critical'

      if (!subject) return res.status(400).json({ error: 'subject required' })
      if (!impact) return res.status(400).json({ error: 'impact required' })
      if (!foundBy) return res.status(400).json({ error: 'foundBy required' })

      const { logCriticalFinding } = await import('./helm/critical-finding')
      const result = await logCriticalFinding(db, {
        subject,
        impact,
        locations,
        foundBy,
        fixCommit,
        djEntry,
        dedupeKey,
        severity,
      })
      res.json({
        ok: !result.deduped,
        eventId: result.eventId,
        telegramFired: result.telegramFired,
        deduped: result.deduped,
      })
    } catch (err: any) {
      console.error('[admin] critical-finding dispatch failed:', err?.message?.slice(0, 200))
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'dispatch failed' })
    }
  })

  // S33 Tier 1 #16.Helm self-test endpoint.
  // GET /admin/api/helm/self-test
  // Returns per-rule diagnostic state: armed, mode, last-fired timestamp,
  // and 24h event counts. Operator uses this post-deploy to confirm every
  // rule that was supposed to install actually did, post-flag-flip to
  // confirm enforce/observe transitioned, and pre-incident to see which
  // rules have signal vs which are dark.
  router.get('/admin/api/helm/self-test', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { runHelmSelfTest } = await import('./helm/self-test')
      const result = await runHelmSelfTest(db)
      res.json(result)
    } catch (err: any) {
      console.error('[admin] heimdall self-test failed:', err?.message?.slice(0, 200))
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'self-test failed' })
    }
  })

  // GET /admin/api/helm/fp-rates.per-rule false-positive rate over
  // a window (default 30d). Drives the per-rule sensitivity dashboard +
  // the "ready to enforce?" decision on each rule.
  //
  // S33 Tier 1 #17 additions:
  //   - Per-day trend (`trend` array per rule).daily FP rate over the
  //     window, suitable for a sparkline/30d trend graph.
  //   - `readyToEnforce` flag per rule.true when:
  //       * labeled_events >= MIN_LABELED_FOR_FLIP (default 20)
  //       * fp_rate <= MAX_FP_FOR_FLIP (default 0.05)
  //       * (last 7 days FP rate also <= MAX).proxy for stability
  //     Operator uses this as the green-light signal for env flag flip
  //     observe→enforce. Override either threshold via query param
  //     (`?minLabeled=10&maxFp=0.10`) for sensitivity analysis.
  router.get('/admin/api/helm/fp-rates', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const days = Math.max(1, Math.min(365, Number(req.query.days) || 30))
      const minLabeled = Math.max(1, Math.min(1000, Number(req.query.minLabeled) || 20))
      const maxFp = Math.max(0, Math.min(1, Number(req.query.maxFp) || 0.05))

      // Roll-up per rule (window total)
      const result = await db.query(
        `SELECT rule_id,
                COUNT(*) FILTER (WHERE occurred_at >= now() - ($1 || ' days')::interval) AS total_events,
                COUNT(*) FILTER (WHERE false_positive IS NOT NULL
                                 AND occurred_at >= now() - ($1 || ' days')::interval) AS labeled_events,
                COUNT(*) FILTER (WHERE false_positive = true
                                 AND occurred_at >= now() - ($1 || ' days')::interval) AS fp_count,
                COUNT(*) FILTER (WHERE false_positive = false
                                 AND occurred_at >= now() - ($1 || ' days')::interval) AS tp_count,
                COUNT(*) FILTER (WHERE occurred_at >= now() - interval '7 days') AS total_events_7d,
                COUNT(*) FILTER (WHERE false_positive IS NOT NULL
                                 AND occurred_at >= now() - interval '7 days') AS labeled_events_7d,
                COUNT(*) FILTER (WHERE false_positive = true
                                 AND occurred_at >= now() - interval '7 days') AS fp_count_7d
         FROM heimdall_events
         GROUP BY rule_id
         HAVING COUNT(*) FILTER (WHERE occurred_at >= now() - ($1 || ' days')::interval) > 0
         ORDER BY rule_id`,
        [days],
      )

      // Per-day trend (one row per rule per day for the window). Operators
      // see "is the rule getting noisier or quieter over time?". Rate is
      // null on days with zero labeled events (gap in trend, NOT zero).
      const trendResult = await db.query(
        `SELECT rule_id,
                date_trunc('day', occurred_at) AS day,
                COUNT(*) AS day_events,
                COUNT(*) FILTER (WHERE false_positive IS NOT NULL) AS day_labeled,
                COUNT(*) FILTER (WHERE false_positive = true) AS day_fp,
                COUNT(*) FILTER (WHERE false_positive = false) AS day_tp
         FROM heimdall_events
         WHERE occurred_at >= now() - ($1 || ' days')::interval
         GROUP BY rule_id, date_trunc('day', occurred_at)
         ORDER BY rule_id, day ASC`,
        [days],
      )
      // Pivot trend rows into per-rule arrays
      const trendByRule = new Map<string, Array<{ day: string; events: number; labeled: number; fp: number; tp: number; fpRate: number | null }>>()
      for (const t of trendResult.rows) {
        const labeled = Number(t.day_labeled) || 0
        const fp = Number(t.day_fp) || 0
        const arr = trendByRule.get(t.rule_id) || []
        arr.push({
          day: new Date(t.day).toISOString().slice(0, 10),
          events: Number(t.day_events) || 0,
          labeled,
          fp,
          tp: Number(t.day_tp) || 0,
          fpRate: labeled > 0 ? +(fp / labeled).toFixed(3) : null,
        })
        trendByRule.set(t.rule_id, arr)
      }

      const rates = result.rows.map((r: any) => {
        const labeled = Number(r.labeled_events) || 0
        const fpCount = Number(r.fp_count) || 0
        const fpRate = labeled > 0 ? +(fpCount / labeled).toFixed(3) : null
        const labeled7d = Number(r.labeled_events_7d) || 0
        const fp7d = Number(r.fp_count_7d) || 0
        const fpRate7d = labeled7d > 0 ? +(fp7d / labeled7d).toFixed(3) : null
        // Ready-to-enforce decision. Conservative: needs window-rate AND
        // 7d-rate both under threshold (catches recent regressions even if
        // 30d average looks fine).
        const readyToEnforce =
          labeled >= minLabeled &&
          fpRate !== null &&
          fpRate <= maxFp &&
          (fpRate7d === null || fpRate7d <= maxFp)
        return {
          ruleId: r.rule_id,
          totalEvents: Number(r.total_events) || 0,
          labeledEvents: labeled,
          fpCount,
          tpCount: Number(r.tp_count) || 0,
          // FP rate among LABELED events only.unlabeled events leave
          // the rate undefined rather than counting as "not FP."
          fpRate,
          // 7-day window for recent-stability check
          fpRate7d,
          totalEvents7d: Number(r.total_events_7d) || 0,
          labeledEvents7d: labeled7d,
          readyToEnforce,
          trend: trendByRule.get(r.rule_id) || [],
        }
      })
      res.json({
        windowDays: days,
        thresholds: { minLabeled, maxFp },
        rules: rates,
        readyToEnforceCount: rates.filter((r) => r.readyToEnforce).length,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /admin/api/mythos/pov.bundled snapshot for the Mythos POV
  // dashboard. Returns budget + reputation + recent counsel + recent
  // predictions in one call. Authed via admin key (checkAdminAuth).
  router.get('/admin/api/mythos/pov', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const agentId = (req.query.agentId as string) || 'mythos'
      // Run all four queries in parallel.
      const [budgetRes, repRes, counselRes, predsRes, recentEventsRes, x402CallsRes] = await Promise.all([
        // Budget
        db.query(
          `SELECT period, usd_authority::text, usd_remaining::text,
                  last_reset_at, note
           FROM agent_budgets
           WHERE agent_id = $1 AND active = true
           ORDER BY period`,
          [agentId],
        ),
        // Reputation + history
        Promise.all([
          db.query(
            `SELECT predictions_count_total, correct_count_total,
                    score_avg_total::text, score_avg_30d::text,
                    reputation_tier, risk_limit_multiplier::text,
                    last_recomputed_at
             FROM agent_reputation WHERE agent_id = $1`,
            [agentId],
          ),
          db.query(
            `SELECT snapshot_at, score_avg_total::text, reputation_tier,
                    risk_limit_multiplier::text, predictions_count_total
             FROM agent_reputation_history
             WHERE agent_id = $1
             ORDER BY snapshot_at ASC
             LIMIT 60`,
            [agentId],
          ),
        ]),
        // Recent Huginn counsel events on actions THIS agent proposed
        db.query(
          `SELECT id, subject, context, occurred_at
           FROM heimdall_events
           WHERE rule_id = 'HELM-CTRL'
             AND agent_id = $1
             AND context->>'kind' = 'huginn-counsel'
           ORDER BY occurred_at DESC
           LIMIT 20`,
          [agentId],
        ),
        // Recent predictions made BY this agent
        db.query(
          `SELECT id, prediction_type, prediction_subject, confidence::text,
                  predicted_at, horizon_days, correct, score::text,
                  outcome_observed_at, reasoning
           FROM agent_predictions
           WHERE agent_id = $1
           ORDER BY predicted_at DESC
           LIMIT 20`,
          [agentId],
        ),
        // Recent ledger entries (budget activity)
        db.query(
          `SELECT id, action, currency, chain_id, delta::text, description, occurred_at
           FROM agent_budget_ledger
           WHERE agent_id = $1
           ORDER BY occurred_at DESC
           LIMIT 20`,
          [agentId],
        ),
        // Recent x402 calls (S33.Programmatic Agent Treasury)
        db.query(
          `SELECT id, entity_id, status, detail, tx_hash, created_at
           FROM execution_log
           WHERE entity_type = 'x402_call'
             AND entity_id = $1
           ORDER BY created_at DESC
           LIMIT 20`,
          [agentId],
        ),
      ])

      const [repHead, repHistory] = repRes

      res.json({
        agentId,
        fetchedAt: new Date().toISOString(),
        budgets: budgetRes.rows.map((r: any) => ({
          period: r.period,
          usdAuthority: Number(r.usd_authority) || 0,
          usdRemaining: Number(r.usd_remaining) || 0,
          lastResetAt: r.last_reset_at,
          note: r.note,
        })),
        reputation: repHead.rows[0]
          ? {
              predictionsCountTotal: Number(repHead.rows[0].predictions_count_total) || 0,
              correctCountTotal: Number(repHead.rows[0].correct_count_total) || 0,
              scoreAvgTotal: Number(repHead.rows[0].score_avg_total) || 0,
              scoreAvg30d: Number(repHead.rows[0].score_avg_30d) || 0,
              tier: repHead.rows[0].reputation_tier,
              riskLimitMultiplier: Number(repHead.rows[0].risk_limit_multiplier) || 1,
              lastRecomputedAt: repHead.rows[0].last_recomputed_at,
            }
          : null,
        reputationHistory: repHistory.rows.map((r: any) => ({
          snapshotAt: r.snapshot_at,
          scoreAvgTotal: Number(r.score_avg_total) || 0,
          tier: r.reputation_tier,
          multiplier: Number(r.risk_limit_multiplier) || 1,
          predictionsCount: Number(r.predictions_count_total) || 0,
        })),
        recentCounsel: counselRes.rows.map((r: any) => ({
          id: r.id,
          subject: r.subject,
          context: r.context,
          occurredAt: r.occurred_at,
        })),
        recentPredictions: predsRes.rows.map((r: any) => ({
          id: r.id,
          type: r.prediction_type,
          subject: r.prediction_subject,
          confidence: Number(r.confidence) || 0,
          predictedAt: r.predicted_at,
          horizonDays: r.horizon_days,
          correct: r.correct,
          score: r.score != null ? Number(r.score) : null,
          outcomeObservedAt: r.outcome_observed_at,
          reasoning: r.reasoning,
        })),
        x402Calls: x402CallsRes.rows.map((r: any) => {
          let detail: any = {}
          try { detail = typeof r.detail === 'string' ? JSON.parse(r.detail) : (r.detail || {}) } catch { detail = {} }
          return {
            id: r.id,
            occurredAt: r.created_at,
            status: r.status,
            txHash: r.tx_hash,
            url: detail.url ?? null,
            method: detail.method ?? 'GET',
            hostname: detail.hostname ?? null,
            responseStatus: detail.responseStatus ?? null,
            amountDebitedUsd: Number(detail.amountDebitedUsd) || 0,
            counselVerdict: detail.counselVerdict ?? null,
            sandboxed: !!detail.sandboxed,
          }
        }),
        recentLedger: recentEventsRes.rows.map((r: any) => ({
          id: r.id,
          action: r.action,
          currency: r.currency,
          chainId: r.chain_id,
          delta: Number(r.delta) || 0,
          description: r.description,
          occurredAt: r.occurred_at,
        })),
      })
    } catch (err: any) {
      console.error('[mythos-pov]', err.message)
      res.status(500).json({ error: err.message?.slice(0, 200) || 'internal' })
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // SOLANA ALLOWLIST (Session 30 Phase 2.5.migration 030)
  // ─────────────────────────────────────────────────────────────────────────
  // Mirror of the erc20-allowlist admin endpoints above, but for Solana SPL
  // tokens via Jupiter. Same shape so the admin UI can reuse its components.
  // Single chain (Solana, our chainId=-1 convention) so no chain-id field
  // in request bodies; mint_address is the unique key.

  // GET /admin/api/solana-allowlist.list everything, ordered by category.
  router.get('/admin/api/solana-allowlist', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const result = await db.query(
        `SELECT id, symbol, display_name, mint_address, decimals,
                category, enabled, audited_at, audit_notes, min_liquidity_usd,
                created_at, updated_at
         FROM solana_allowlist
         ORDER BY category, symbol`,
      )
      res.json({
        count: result.rows.length,
        rows: result.rows,
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/solana-allowlist/:id/toggle.flip enabled on/off.
  router.post('/admin/api/solana-allowlist/:id/toggle', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const id = req.params.id
      const result = await db.query(
        `UPDATE solana_allowlist
         SET enabled = NOT enabled
         WHERE id = $1
         RETURNING id, symbol, enabled`,
        [id],
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
      // Force immediate snapshot refresh so quote calls see the change
      // without waiting for the 60s TTL.
      await forceRefreshSolanaAllowlist()
      res.json({ ok: true, token: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /admin/api/solana-allowlist.add or upsert a Solana SPL token.
  // Same policy applies as erc20: caller must have done the Memecoin
  // Allowlist Policy review (audit_notes should reflect that). Decimals
  // wrong here = 100x wrong quotes downstream.verify on Solscan first.
  router.post('/admin/api/solana-allowlist', async (req: any, res: any) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const { symbol, displayName, mintAddress, decimals, category, auditNotes, minLiquidityUsd, enabled } = req.body || {}
      if (!symbol || !mintAddress || decimals == null || !category) {
        return res.status(400).json({ error: 'symbol, mintAddress, decimals, category required' })
      }
      if (!['native', 'stablecoin', 'bluechip', 'memecoin'].includes(category)) {
        return res.status(400).json({ error: 'category must be native | stablecoin | bluechip | memecoin' })
      }
      // Loose base58 mint shape check (32–44 chars, no I/O/0/l ambiguity chars)
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(mintAddress))) {
        return res.status(400).json({ error: 'mintAddress is not a valid base58 mint' })
      }
      const result = await db.query(
        `INSERT INTO solana_allowlist
         (symbol, display_name, mint_address, decimals, category, enabled, audited_at, audit_notes, min_liquidity_usd)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)
         ON CONFLICT (mint_address) DO UPDATE SET
           symbol = EXCLUDED.symbol,
           display_name = EXCLUDED.display_name,
           decimals = EXCLUDED.decimals,
           category = EXCLUDED.category,
           enabled = EXCLUDED.enabled,
           audit_notes = EXCLUDED.audit_notes,
           min_liquidity_usd = EXCLUDED.min_liquidity_usd,
           updated_at = now()
         RETURNING id, symbol, mint_address, enabled`,
        [
          String(symbol).toUpperCase(),
          displayName || symbol,
          mintAddress,
          Number(decimals),
          category,
          enabled !== false, // default true
          auditNotes || null,
          Number(minLiquidityUsd || 0),
        ],
      )
      await forceRefreshSolanaAllowlist()
      res.json({ ok: true, token: result.rows[0] })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 26.on-demand token audit via GoPlus. Admin clicks "Audit" next
  // to a proposed token, this fetches honeypot/tax/proxy signals from
  // GoPlus and returns a verdict (safe | caution | high_risk) + reasons.
  //
  // GoPlus is free, no key required. ~1-2s latency. Cached implicitly by
  // the browser since GoPlus sets Cache-Control on their API.
  router.get('/admin/api/audit-token', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const chainId = parseInt(String(req.query.chainId || ''))
      const address = String(req.query.address || '').trim()
      if (!chainId || !address) {
        return res.status(400).json({ error: 'chainId + address required' })
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address must be 0x + 40 hex chars' })
      }
      const audit = await fetchTokenAudit(chainId, address)
      if (!audit) return res.status(502).json({ error: 'GoPlus fetch failed' })
      res.json(audit)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Session 24.Skill Health + Invocation telemetry for the sub-agents
  // dashboard. Reads execution_log for entity_types that represent agent/skill
  // activity (growth_agent, scheduled audits, etc.) and aggregates per-skill
  // error rate + invocation count over a window.
  //
  // Response shape:
  //   {
  //     skills: {
  //       [skillId: string]: {
  //         total24h: number,
  //         errors24h: number,
  //         successes24h: number,
  //         lastSeen: ISODate | null,
  //         health: 'green' | 'yellow' | 'red' | 'unknown',
  //         invocations7d: number  // for heat-map sizing
  //       }
  //     },
  //     meta: { source: 'execution_log', window24h: ISODate, window7d: ISODate }
  //   }
  //
  // Thresholds (configurable later):
  //   green:  no errors in 24h (or no activity at all.silent is OK for idle skills)
  //   yellow: 1-3 errors in 24h, or >10 errors but <30% error rate
  //   red:    >30% error rate OR >5 consecutive failures
  router.get('/admin/api/skill-health', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      // Aggregate by "action" string.growth_agent actions like 'daily_cycle',
      // 'hourly_check', 'approval_review', 'video_pipeline' map to specific
      // skills. For other entity_types we use entity_type as the skill id.
      // Session 25 Thread D.include 'claude_skill' entity_type (written
      // by SubagentStop hook) so on-demand skills show up in the dashboard.
      const q24h = await db.query(
        `SELECT entity_type, entity_id, action, status, COUNT(*) AS c, MAX(created_at) AS last_seen
         FROM execution_log
         WHERE created_at > now() - interval '24 hours'
           AND entity_type IN ('growth_agent', 'swap', 'monitor', 'issuer_sync', 'bridge', 'market_oracle', 'claude_skill')
         GROUP BY entity_type, entity_id, action, status`
      )
      const q7d = await db.query(
        `SELECT entity_type, entity_id, action, COUNT(*) AS c
         FROM execution_log
         WHERE created_at > now() - interval '7 days'
           AND entity_type IN ('growth_agent', 'swap', 'monitor', 'issuer_sync', 'bridge', 'market_oracle', 'claude_skill')
         GROUP BY entity_type, entity_id, action`
      )

      // Skill-id mapper.maps (entity_type, entity_id, action) to a logical
      // skill id that matches sub-agents.json node ids where possible.
      function skillIdFor(entityType: string, entityId: string | null, action: string): string {
        // claude_skill rows store the skill id directly in entity_id
        if (entityType === 'claude_skill' && entityId) return entityId
        if (entityType === 'growth_agent') {
          if (action?.includes('daily')) return 'agent'
          if (action?.includes('approval')) return 'approval-pipeline'
          if (action?.includes('video') || action?.includes('heygen')) return 'video-pipeline'
          if (action?.includes('knowledge')) return 'knowledge-engine'
          if (action?.includes('thought')) return 'thought-engine'
          return 'mythos'
        }
        if (entityType === 'swap') return 'bridge'  // swap is bridge-family
        if (entityType === 'monitor') return 'bridge'
        if (entityType === 'issuer_sync') return 'issuer'
        if (entityType === 'market_oracle') return 'market'
        return entityType
      }

      const skills: Record<string, any> = {}
      for (const row of q24h.rows) {
        const id = skillIdFor(row.entity_type, row.entity_id, row.action)
        if (!skills[id]) skills[id] = { total24h: 0, errors24h: 0, successes24h: 0, lastSeen: null, invocations7d: 0 }
        const count = Number(row.c)
        skills[id].total24h += count
        if (row.status === 'failed' || row.status === 'error') skills[id].errors24h += count
        else if (row.status === 'success' || row.status === 'completed') skills[id].successes24h += count
        const ts = row.last_seen ? new Date(row.last_seen).toISOString() : null
        if (ts && (!skills[id].lastSeen || ts > skills[id].lastSeen)) skills[id].lastSeen = ts
      }
      for (const row of q7d.rows) {
        const id = skillIdFor(row.entity_type, row.entity_id, row.action)
        if (!skills[id]) skills[id] = { total24h: 0, errors24h: 0, successes24h: 0, lastSeen: null, invocations7d: 0 }
        skills[id].invocations7d += Number(row.c)
      }

      // Health classification
      for (const id of Object.keys(skills)) {
        const s = skills[id]
        const errRate = s.total24h > 0 ? s.errors24h / s.total24h : 0
        if (s.total24h === 0) {
          s.health = 'unknown'  // no activity in 24h.idle, don't color
        } else if (errRate > 0.30 || s.errors24h >= 5) {
          s.health = 'red'
        } else if (s.errors24h >= 1) {
          s.health = 'yellow'
        } else {
          s.health = 'green'
        }
      }

      res.json({
        skills,
        meta: {
          source: 'execution_log',
          generatedAt: new Date().toISOString(),
          skillCount: Object.keys(skills).length,
        },
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // API: Mythos thought log (inner monologue history)
  router.get('/admin/api/mythos/thoughts', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const result = await db.query(
        `SELECT action, status, detail, created_at FROM execution_log
         WHERE entity_type = 'growth_agent'
         ORDER BY created_at DESC LIMIT 100`
      )
      res.json(result.rows)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ─── MCP key sys-admin ────────────────────────────────────────────────────
  // Force-revoke an MCP key when a bad actor is detected. Manual for now;
  // Helm/Mythos will call this programmatically once we wire the
  // detection signals (rate-limit busts, anomalous tool-call patterns,
  // sudden geo shifts, etc.).
  //
  // Companion to the user-facing /mcp/keys/:id DELETE which only lets users
  // revoke their OWN keys. This one is admin-keyed and can revoke ANY key.

  // GET /admin/api/mcp/keys — list ALL active keys across all users
  router.get('/admin/api/mcp/keys', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500)
      const result = await db.query(
        `SELECT k.id, k.user_id, u.email, k.key_prefix, k.name, k.scopes,
                k.created_at, k.last_used_at, k.revoked_at
         FROM nuro_mcp_keys k
         LEFT JOIN users u ON u.id = k.user_id
         ORDER BY k.created_at DESC
         LIMIT $1`,
        [limit]
      )
      res.json({ ok: true, keys: result.rows })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // POST /admin/api/mcp/keys/:id/force-revoke — kill a specific key NOW
  router.post('/admin/api/mcp/keys/:id/force-revoke', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    const keyId = req.params.id
    const reason = (req.body?.reason || 'admin force-revoke').toString().slice(0, 280)
    try {
      const result = await db.query(
        `UPDATE nuro_mcp_keys
         SET revoked_at = now()
         WHERE id = $1 AND revoked_at IS NULL
         RETURNING id, user_id, name, key_prefix`,
        [keyId]
      )
      if (!result.rows[0]) {
        return res.status(404).json({ ok: false, error: 'key not found or already revoked' })
      }
      // Audit trail in execution_log (heimdall-readable)
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ('mcp_key', $1, 'force_revoke', 'success', $2)`,
        [keyId, reason]
      ).catch((e) => console.warn('[admin] mcp force-revoke log failed:', e?.message))
      res.json({ ok: true, revoked: result.rows[0], reason })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // POST /admin/api/mcp/keys/force-revoke-all-user — kill ALL of a user's keys
  // For 'panic button' scenarios — account compromised, kill everything they
  // have outstanding. Auditable.
  router.post('/admin/api/mcp/keys/force-revoke-all-user', async (req, res) => {
    if (!checkAdminAuth(req, res)) return
    const userId = req.body?.user_id
    const reason = (req.body?.reason || 'admin force-revoke-all').toString().slice(0, 280)
    if (!userId) return res.status(400).json({ ok: false, error: 'missing user_id' })
    try {
      const result = await db.query(
        `UPDATE nuro_mcp_keys
         SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL
         RETURNING id, name, key_prefix`,
        [userId]
      )
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ('mcp_key', $1, 'force_revoke_all', 'success', $2)`,
        [userId, `revoked ${result.rows.length} keys: ${reason}`]
      ).catch((e) => console.warn('[admin] mcp force-revoke-all log failed:', e?.message))
      res.json({ ok: true, count: result.rows.length, revoked: result.rows, reason })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  return router
}

// ─── DASHBOARD HTML ──────────────────────────────────────────────────────────

function dashboardHTML(adminKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AFI Admin Console · Mythos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* ═══════════════════════════════════════════════════════════════════════
     Session 25.Admin Console visual refresh.
     Match the /architecture/neural-net.html aesthetic:
       - Deep cosmic black bg with dual radial glows (teal + purple)
       - Inter font (Mono stays only for tx hashes / code strings)
       - Glass cards with subtle borders + backdrop-filter
       - Gradient header title
       - Pulsing dot on live indicators
       - Smooth transform + border transitions on hover
     HTML + class names + JS are deliberately untouched.purely a restyle.
     ════════════════════════════════════════════════════════════════════════ */
  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* ═══════════════════════════════════════════════════════════════════════
     Admin Console v3 — design tokens.
     Mirror src/styles/theme.dark.css exactly so the admin console
     feels like the dashboard, not a separate ops tool. Same hex values,
     same naming convention. Only the variable scope differs (admin uses
     :root since this is a self-contained HTML page, dashboard uses
     CSS imports).

     Spec lineage:
       - Linear (linear.app/brand) — typography ladder + cool-tinted neutrals
       - Vercel/Geist (vercel.com/geist) — 4px base spacing, 8px radius
       - Stripe Dashboard — muted-gray table headers, tabular-nums numerics
       - GitHub Primer — pill badges, 6 semantic variants
       - Datadog — density toggle (compact/comfortable/spacious)
     ════════════════════════════════════════════════════════════════════════ */
  :root {
    /* Backgrounds */
    --bg-page: #0A0A0A;
    --bg-card: #111111;
    --bg-card-2: #161616;
    --bg-input: #161616;

    /* Borders — pure white-alpha, neutral on cool-tinted neutrals */
    --border-subtle: rgba(255,255,255,0.06);
    --border-default: rgba(255,255,255,0.10);
    --border-strong: rgba(255,255,255,0.18);

    /* Text */
    --fg-primary: #EDEDED;
    --fg-secondary: #A1A1A1;
    --fg-muted: #707070;
    --fg-disabled: #4A4A4A;

    /* Accent — single brand. Dark theme electric blue. */
    --accent: #0D90FF;
    --accent-hover: #3DA6FF;
    --accent-deep: #0A73CC;
    --accent-surface: rgba(13,144,255,0.08);
    --accent-border: rgba(13,144,255,0.24);
    --accent-glow: rgba(13,144,255,0.18);

    /* Semantic state — NOT the brand. Reserved for success/warning/error. */
    --success: #00C08B;
    --warning: #FFAB00;
    --danger: #DE5555;
    --info: #6AAAFF;

    /* Radii — 4 tokens (was 11 distinct values across the file) */
    --r-sm: 6px;
    --r-md: 8px;
    --r-lg: 12px;
    --r-pill: 999px;

    /* Spacing — strict 4px base, 8 tokens (was ~16 ad-hoc values) */
    --s-1: 4px;
    --s-2: 8px;
    --s-3: 12px;
    --s-4: 16px;
    --s-5: 20px;
    --s-6: 24px;
    --s-8: 32px;
    --s-10: 40px;

    /* Typography — 8 tokens (was 13+ ad-hoc sizes including 9/10.5/11.5/12.5) */
    --text-display: 28px;  /* stat-card values */
    --text-h1:      20px;  /* page title */
    --text-h2:      13px;  /* section headers (uppercase, letter-spaced) */
    --text-h3:      13px;  /* card titles */
    --text-body:    13px;  /* table cells, body */
    --text-mono:    12px;  /* tx hashes, code */
    --text-caption: 11px;  /* stat labels, metadata */
    --text-micro:   10px;  /* badges only */
  }

  body {
    background: var(--bg-page);
    color: var(--fg-primary);
    font-family: 'Geist', 'Inter', 'SF Pro', system-ui, -apple-system, sans-serif;
    font-size: var(--text-body);
    line-height: 1.55;
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
    /* Geist + Inter both support these — disambiguates Il10O glyphs */
    font-feature-settings: 'ss01', 'cv11';
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Ambient cosmic glow — opacity reduced (was 0.035 / 0.025 — too noisy
     behind dense data per the v3 spec). Keeps the cosmic feel without
     competing with content. */
  body::before {
    content: '';
    position: fixed;
    top: 35%;
    left: 50%;
    width: 1200px;
    height: 1200px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(13,144,255,0.020) 0%, transparent 65%);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 0;
  }
  body::after {
    content: '';
    position: fixed;
    top: 20%;
    right: -280px;
    width: 860px;
    height: 860px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(61,166,255,0.015) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }
  .header, .grid, .section { position: relative; z-index: 1; }

  /* Scrollbars — visible faint track + always-visible gray thumb. Brand
     blue on active drag. Cross-browser. The "2001 default scrollbars"
     complaint comes from a transparent-until-hover treatment in the
     previous version + child scrollers not inheriting; this fixes both
     by using a visible track + a wider universal selector. */
  * {
    scrollbar-width: thin;
    scrollbar-color: #2A2A2A transparent;
  }
  *:hover { scrollbar-color: #3A3A45 transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.02);
    border-radius: 4px;
  }
  *::-webkit-scrollbar-thumb {
    background: #2A2A2A;
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  *::-webkit-scrollbar-thumb:hover  { background: #3A3A45; }
  *::-webkit-scrollbar-thumb:active { background: var(--accent); }
  *::-webkit-scrollbar-corner       { background: transparent; }

  /* Header — sticky bar. Drop the gradient text title (consumer-marketing
     idiom). Use solid foreground per the v3 spec. */
  .header {
    background: rgba(17,17,17,0.6);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    padding: var(--s-5) var(--s-8);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .header h1 {
    font-size: var(--text-h1);
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--fg-primary);
    margin-bottom: var(--s-1);
  }
  .header .status {
    font-size: var(--text-caption);
    color: var(--fg-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 500;
  }

  /* Stats grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--s-3);
    padding: var(--s-5) var(--s-8);
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-default);
    border-radius: var(--r-md);
    padding: var(--s-4) var(--s-5);
    transition: border-color 0.2s ease;
    position: relative;
    overflow: hidden;
  }
  .stat-card:hover {
    border-color: var(--border-strong);
    /* No translateY hover-lift on stat cards per v3 spec — was gimmicky
       at scale (every card lifting on every hover reads as nervous). */
  }
  .stat-card .label {
    color: var(--fg-muted);
    font-size: var(--text-caption);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: var(--s-2);
  }
  .stat-card .value {
    font-size: var(--text-display);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  /* Semantic value colors. .green is success teal, NOT brand blue, per
     the single-accent rule (brand blue is reserved for the .blue role). */
  .stat-card .value.green  { color: var(--success); }
  .stat-card .value.yellow { color: var(--warning); }
  .stat-card .value.red    { color: var(--danger); }
  .stat-card .value.blue   { color: var(--accent); }

  /* Sections — muted-gray heading, not brand blue. Brand color belongs
     on focus/CTA states, not on every section header. */
  .section { padding: var(--s-3) var(--s-8); }
  .section h2 {
    font-size: var(--text-h2);
    color: var(--fg-secondary);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 600;
    margin: var(--s-6) 0 var(--s-3);
    padding-bottom: var(--s-2);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .section h2::before {
    content: '';
    display: inline-block;
    width: 24px;
    height: 1px;
    background: var(--border-strong);
  }

  /* Tabs — pill-shaped */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
    margin-bottom: var(--s-4);
    padding: var(--s-1);
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    width: fit-content;
    max-width: 100%;
  }
  .tab {
    padding: 8px 14px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    cursor: pointer;
    color: var(--fg-secondary);
    font-size: var(--text-mono);
    font-weight: 500;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit;
  }
  .tab:hover { color: var(--fg-primary); background: rgba(255,255,255,0.04); }
  .tab.active {
    background: var(--accent-surface) !important;
    color: var(--accent) !important;
    border-color: var(--accent-border) !important;
  }

  /* Tables — Stripe / Linear / Vercel convention.
     - Header: muted-gray, NOT brand blue (brand belongs on focus, not on
       every column heading; data is what should pop)
     - No zebra striping (modern dark-mode practice; horizontal lines only)
     - 16px horizontal cell padding (was 14px — small but consistent
       scan-rhythm matters at 48 tables)
     - Hover state on rows; cell text brightens on row hover
     - Sticky header by default; child scrollers inherit via the wider
       universal scrollbar selector. */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-body);
  }
  th {
    text-align: left;
    padding: var(--s-2) var(--s-4);
    color: var(--fg-secondary);
    background: var(--bg-input);
    border-bottom: 1px solid var(--border-default);
    font-size: var(--text-caption);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 5;
  }
  td {
    padding: 10px var(--s-4);
    border-bottom: 1px solid var(--border-subtle);
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-secondary);
    transition: color 0.15s;
  }
  /* Column-alignment helpers — opt-in via class on th/td */
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.center, th.center { text-align: center; }
  tr { transition: background-color 0.15s; }
  tr:hover { background: var(--accent-surface); }
  tr:hover td { color: var(--fg-primary); }

  /* Tx hashes and inline code in monospace */
  code, .mono, td code {
    font-family: 'Geist Mono', 'SF Mono', 'Fira Code', Menlo, monospace;
    font-size: var(--text-mono);
    color: var(--accent-hover);
    background: var(--accent-surface);
    padding: 2px 6px;
    border-radius: var(--r-sm);
  }

  /* Badges — 6 semantic variants. Pill rounded (--r-pill, was 10px). Title
     Case (no UPPERCASE — Stripe / Linear / Vercel convention). */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    height: 22px;
    padding: 0 10px;
    font-size: var(--text-caption);
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    border-radius: var(--r-pill);
    border: 1px solid transparent;
    font-family: inherit;
    white-space: nowrap;
  }
  .badge.success {
    background: rgba(0,192,139,0.12);
    color: var(--success);
    border-color: rgba(0,192,139,0.30);
  }
  .badge.warning, .badge.skipped {
    background: rgba(255,171,0,0.12);
    color: var(--warning);
    border-color: rgba(255,171,0,0.30);
  }
  .badge.failed, .badge.frozen, .badge.danger {
    background: rgba(222,85,85,0.12);
    color: var(--danger);
    border-color: rgba(222,85,85,0.30);
  }
  .badge.pending, .badge.info {
    background: rgba(106,170,255,0.12);
    color: var(--info);
    border-color: rgba(106,170,255,0.30);
  }
  .badge.neutral {
    background: rgba(255,255,255,0.05);
    color: var(--fg-secondary);
    border-color: var(--border-default);
  }
  .badge.brand {
    background: var(--accent-surface);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  /* Phase 3: pulse animation is now reserved for .badge.live only.
     .badge.active is the calm version -- accent-tinted, no animation,
     no leading dot. Use it for "row is currently the active selection"
     or "card is unfrozen" -- states that stay put. */
  .badge.active {
    background: var(--accent-surface);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  /* .badge.live -- for actually-streaming / actually-live indicators.
     Pulsing dot prefix signals real-time movement. Use sparingly. */
  .badge.live {
    background: var(--accent-surface);
    color: var(--accent);
    border-color: var(--accent-border);
    position: relative;
    padding-left: 18px;
  }
  .badge.live::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px rgba(13,144,255,0.7);
    animation: pulseDot 1.8s ease-in-out infinite;
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
    50% { opacity: 0.45; transform: translateY(-50%) scale(0.85); }
  }

  /* Table wrapper — sits on solid card bg, no glass blur */
  .table-wrap {
    max-height: 500px;
    overflow-y: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--r-md);
    background: var(--bg-card);
  }

  /* Button system — 4 variants × 3 sizes. Solid fill on primary, outline
     on secondary, transparent on ghost, outlined on danger. No gradients
     (Linear / Stripe / Vercel use solid fills — gradients on buttons read
     as consumer marketing, not internal ops tool). */
  .btn,
  .refresh-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    height: 32px;
    padding: 0 14px;
    background: var(--accent);
    color: #001628;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    cursor: pointer;
    font-size: var(--text-mono);
    font-weight: 600;
    letter-spacing: 0;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .btn:hover, .refresh-btn:hover { background: var(--accent-hover); }
  .btn:disabled, .refresh-btn:disabled {
    opacity: 0.4; cursor: not-allowed; pointer-events: none;
  }

  /* Variants */
  .btn-primary { background: var(--accent); color: #001628; }
  .btn-primary:hover { background: var(--accent-hover); }

  .btn-secondary {
    background: transparent;
    color: var(--fg-primary);
    border-color: var(--border-default);
  }
  .btn-secondary:hover {
    background: rgba(255,255,255,0.04);
    border-color: var(--border-strong);
  }

  .btn-ghost {
    background: transparent;
    color: var(--fg-secondary);
    border-color: transparent;
  }
  .btn-ghost:hover {
    background: rgba(255,255,255,0.04);
    color: var(--fg-primary);
  }

  .btn-danger {
    background: transparent;
    color: var(--danger);
    border-color: rgba(222,85,85,0.3);
  }
  .btn-danger:hover { background: rgba(222,85,85,0.08); }

  /* Sizes */
  .btn-sm { height: 28px; padding: 0 12px; font-size: var(--text-caption); }
  .btn-lg { height: 40px; padding: 0 20px; font-size: var(--text-body); }

  /* Icon-button — for table-row inline actions (freeze, copy, edit) */
  .btn-icon {
    width: 28px; height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--fg-secondary);
    border: 0;
    border-radius: var(--r-sm);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .btn-icon:hover { background: rgba(255,255,255,0.05); color: var(--fg-primary); }

  .auto-label {
    color: var(--fg-muted);
    font-size: var(--text-caption);
    margin-left: var(--s-3);
    letter-spacing: 0;
  }

  /* Filter row + form controls — unified .input style for every text field */
  .filter-row {
    display: flex;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
    align-items: center;
    flex-wrap: wrap;
  }
  select, input[type="text"], input[type="number"], input[type="search"], input[type="email"] {
    background: var(--bg-input);
    color: var(--fg-primary);
    border: 1px solid var(--border-default);
    height: 32px;
    padding: 0 12px;
    border-radius: var(--r-sm);
    font-size: var(--text-mono);
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s;
  }
  select:hover, input[type="text"]:hover, input[type="number"]:hover {
    border-color: var(--border-strong);
  }
  select:focus, input[type="text"]:focus, input[type="number"]:focus, input[type="search"]:focus, input[type="email"]:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card-2);
  }

  /* Empty-state row for tables that may have zero rows */
  .table-empty {
    padding: var(--s-8) var(--s-4);
    text-align: center;
    color: var(--fg-muted);
    font-size: var(--text-body);
  }

  /* Density toggle — Phase 3 wires the JS that flips data-density on body */
  body[data-density="compact"] td { padding: 6px var(--s-4); }
  body[data-density="comfortable"] td { padding: 10px var(--s-4); }
  body[data-density="spacious"] td { padding: 14px var(--s-4); }

  /* ═══════════════════════════════════════════════════════════════════════
     Phase 2 utility classes — replace 859 inline style="..." attributes
     with named classes. Same visual language, single source of truth.
     ════════════════════════════════════════════════════════════════════════ */

  /* Card variants — base + compact + glass */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-default);
    border-radius: var(--r-md);
    padding: var(--s-4) var(--s-5);
    transition: border-color 0.2s ease;
  }
  .card:hover { border-color: var(--border-strong); }
  .card-compact { padding: var(--s-3) var(--s-4); }
  .card-glass {
    background: rgba(17,17,17,0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: var(--s-3);
    margin-bottom: var(--s-4);
    border-bottom: 1px solid var(--border-subtle);
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .card-title {
    font-size: var(--text-h3);
    font-weight: 600;
    color: var(--fg-primary);
    line-height: 1.4;
  }
  .card-subtitle {
    font-size: var(--text-caption);
    color: var(--fg-muted);
    line-height: 1.4;
    font-weight: 500;
  }

  /* KPI tile — compact metric card used in 4-up grids inside larger panels */
  .kpi-tile {
    padding: var(--s-2) var(--s-3);
    background: var(--bg-card-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
  }
  .kpi-tile .kpi-label {
    font-size: var(--text-micro);
    color: var(--fg-muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .kpi-tile .kpi-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--fg-primary);
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .kpi-tile .kpi-value.success { color: var(--success); }
  .kpi-tile .kpi-value.warning { color: var(--warning); }
  .kpi-tile .kpi-value.danger  { color: var(--danger); }
  .kpi-tile .kpi-value.info    { color: var(--info); }
  .kpi-tile .kpi-value.brand   { color: var(--accent); }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--s-2);
  }

  /* Nav-pill — for the secondary jump-nav strip (Pipeline / Webhooks / etc.) */
  .nav-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    padding: 4px 10px;
    border-radius: var(--r-sm);
    background: var(--bg-card);
    color: var(--fg-secondary);
    text-decoration: none;
    border: 1px solid var(--border-subtle);
    font-size: var(--text-caption);
    font-weight: 500;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .nav-pill:hover {
    background: var(--accent-surface);
    color: var(--accent);
    border-color: var(--accent-border);
  }

  /* Disclosure toggle — for <details><summary> patterns */
  .disclosure-toggle {
    cursor: pointer;
    color: var(--fg-secondary);
    font-size: var(--text-caption);
    font-weight: 500;
    padding: var(--s-1) 0;
    list-style: none;
  }
  .disclosure-toggle::-webkit-details-marker { display: none; }
  .disclosure-toggle:hover { color: var(--fg-primary); }
  details[open] > .disclosure-toggle { color: var(--accent); }

  /* Form helpers — paired-field rows for compact admin forms */
  .form-row {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: var(--s-2);
  }
  .form-label {
    font-size: var(--text-caption);
    color: var(--fg-muted);
    font-weight: 500;
    min-width: 100px;
  }
  textarea {
    background: var(--bg-input);
    color: var(--fg-primary);
    border: 1px solid var(--border-default);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    font-size: var(--text-mono);
    font-family: 'Geist Mono', 'SF Mono', monospace;
    transition: border-color 0.15s, background 0.15s;
    resize: vertical;
    min-height: 60px;
  }
  textarea:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card-2);
  }

  /* Section anchor target — adds a subtle margin so sticky-header doesn't clip */
  .section[id^="section-"] { scroll-margin-top: 80px; }

  /* ═══════════════════════════════════════════════════════════════════════
     Phase 2 chunk 2 — hero-strip layout + segment toggle + chain-health pills
     Replaces the inline-styled markup at the top of the dashboard tab
     (Deposit Funnel + Chain Health). Same data + IDs, better hierarchy.
     ════════════════════════════════════════════════════════════════════════ */

  /* Hero strip — Deposit Funnel + Chain Health, top of dashboard */
  .hero-strip {
    display: grid;
    grid-template-columns: 2fr 3fr;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
  }
  @media (max-width: 1024px) {
    .hero-strip { grid-template-columns: 1fr; }
  }

  /* Inline icon — paired with card-title for visual hierarchy.
     Sized for 13px text + 1.5px stroke. Color inherits via currentColor
     unless an icon-sm modifier overrides it (default = accent). */
  .icon-sm {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--accent);
  }
  .icon-xs {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  /* Card-title row with leading icon (used in card-header left side) */
  .card-title-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  /* Segment toggle — for 24h/7d range picker. Replaces 2 buttons that
     each had ~7 inline style props plus a setFunnelRange cssText hack. */
  .seg-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg-card-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
  }
  .seg-toggle-btn {
    padding: 3px 10px;
    font-size: var(--text-micro);
    font-weight: 600;
    background: transparent;
    color: var(--fg-muted);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
  }
  .seg-toggle-btn:hover { color: var(--fg-secondary); }
  .seg-toggle-btn.active {
    background: var(--accent);
    color: #001628;
  }

  /* Funnel sparkline + meta */
  .funnel-spark {
    width: 100%;
    height: 40px;
    background: var(--bg-card-2);
    border-radius: var(--r-sm);
    margin-bottom: var(--s-1);
    display: block;
  }
  .funnel-meta {
    font-size: var(--text-caption);
    color: var(--fg-muted);
    line-height: 1.4;
  }

  /* Chain Health — pill grid + state colors. State classes are applied
     by loadChainHealth() based on the API's status field (green/yellow/
     red/unknown). Was 4 inline-style branches; now CSS-driven. */
  .chain-health-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-content: flex-start;
  }
  .chain-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: var(--bg-card-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-pill);
    font-size: var(--text-caption);
    font-weight: 600;
    color: var(--fg-muted);
    transition: border-color 0.15s, color 0.15s;
  }
  .chain-pill .chain-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-disabled);
    flex-shrink: 0;
  }
  .chain-pill.green {
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .chain-pill.green .chain-dot {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .chain-pill.yellow {
    color: var(--warning);
    border-color: rgba(255,171,0,0.24);
  }
  .chain-pill.yellow .chain-dot {
    background: var(--warning);
    box-shadow: 0 0 6px rgba(255,171,0,0.40);
  }
  .chain-pill.red {
    color: var(--danger);
    border-color: rgba(222,85,85,0.24);
  }
  .chain-pill.red .chain-dot {
    background: var(--danger);
    box-shadow: 0 0 6px rgba(222,85,85,0.40);
  }

  /* Monitor-paused pill — shown ahead of chain strip when poll suspended */
  .monitor-paused-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255,171,0,0.08);
    border: 1px solid rgba(255,171,0,0.24);
    border-radius: var(--r-pill);
    font-size: var(--text-micro);
    color: var(--warning);
    margin-right: var(--s-1);
  }

  /* Empty / loading text helper */
  .muted-text {
    font-size: var(--text-caption);
    color: var(--fg-muted);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Phase 2 chunk 3 — above-the-fold polish
     Targets the most visible part of the page (page title, top KPI row,
     tab bar, jump-nav). The hero strip from chunk 2 sits between the
     stat-card row and the section content; chunk 3 makes the parts
     above and around it match the new visual language.
     ════════════════════════════════════════════════════════════════════════ */

  /* Page title — Phase 1 sized this at --text-h1 (20px) which works for
     card titles but reads too small as a page-level h1. Bump to display. */
  .page-title-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  .page-title-icon {
    width: 28px;
    height: 28px;
    color: var(--accent);
    flex-shrink: 0;
  }
  .header h1 { font-size: 24px; }
  @media (min-width: 1280px) {
    .header h1 { font-size: 26px; }
  }

  /* Stat-card leading icon — top-right corner, faded. Modern admin
     convention (Linear, Datadog) — gives each KPI a visual anchor
     without competing with the data value. */
  .stat-card .stat-icon {
    position: absolute;
    top: var(--s-3);
    right: var(--s-3);
    width: 18px;
    height: 18px;
    color: var(--fg-disabled);
    pointer-events: none;
    transition: color 0.2s ease;
  }
  .stat-card:hover .stat-icon { color: var(--fg-muted); }

  /* Tab icon slot — for inline SVGs in tab labels. Replaces the 4
     inline gradient overrides on Execution Layer / Mythos / Helm
     / Contracts. Single-accent rule: tabs are uniform, the active
     state is what signals selection (already handled in Phase 1). */
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .tab-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Phase 2 chunk 4 — Issuer Webhooks panel + Sub-process 10-tile grid
     The two biggest panels below the hero strip. Both were inline-styled
     stat-cards with per-section accent colors (cyan / pink / amber / red /
     orange / teal) violating the single-accent rule. Now uniform .card +
     .card-header + Lucide icons; section identity comes from icon shape
     and label, not from header color.
     ════════════════════════════════════════════════════════════════════════ */

  /* Sub-process tile grid container (10 tiles, 2-up at desktop, 1-up below 900px) */
  .subprocess-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-3);
  }
  @media (max-width: 900px) {
    .subprocess-grid { grid-template-columns: 1fr; }
  }

  /* Sub-process tile — .card + scrollable body that maxes at 300px tall. */
  .subprocess-tile {
    display: flex;
    flex-direction: column;
  }
  .subprocess-tile .subprocess-tile-body {
    overflow-y: auto;
    max-height: 300px;
    flex: 1;
  }
  .subprocess-tile table { font-size: var(--text-mono); }
  .subprocess-tile .subprocess-tile-totals {
    font-size: var(--text-micro);
    color: var(--fg-muted);
    font-weight: 400;
  }
  .subprocess-tile .subprocess-tile-by-reason {
    font-size: var(--text-mono);
    padding: var(--s-1) 0 var(--s-2);
    border-bottom: 1px dashed var(--border-subtle);
    margin-bottom: var(--s-2);
  }

  /* Status pill — for live/observe-only indicators on panel headers.
     Replaces 2 cssText hacks in loadIssuerWebhooksPanel(). */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    font-size: var(--text-micro);
    font-weight: 600;
    margin-left: var(--s-2);
  }
  .status-pill.live {
    background: var(--accent-surface);
    color: var(--accent);
  }
  .status-pill.live::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
    animation: heartbeatPulse 1.6s ease-in-out infinite;
  }
  .status-pill.observe {
    background: rgba(255,171,0,0.10);
    color: var(--warning);
    font-weight: 500;
  }

  /* Disclosure summary with leading icon (chevron rotates open) */
  .disclosure-toggle .disclosure-icon {
    width: 12px;
    height: 12px;
    transition: transform 0.15s ease;
  }
  details[open] > .disclosure-toggle .disclosure-icon {
    transform: rotate(90deg);
  }

  /* Compact table inside disclosures — smaller padding than the global
     table; fits better inside the constrained details/summary area. */
  .compact-table {
    width: 100%;
    font-size: var(--text-mono);
    margin-top: var(--s-2);
  }
  .compact-table th {
    padding: 3px 6px;
    font-size: var(--text-micro);
  }
  .compact-table td { padding: 4px 6px; }

  /* Result badge for the verify-or-reject column */
  .verify-result {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
  }
  .verify-result.verified { color: var(--accent); }
  .verify-result.rejected { color: var(--danger); }

  /* ═══════════════════════════════════════════════════════════════════════
     Phase 2 chunk 5 — remaining dashboard panels
     Scheduled Intents, Failed Restart, Agents, Markets, ERC-20 Allowlist,
     Solana SPL Allowlist. All previously inline-styled stat-cards with
     per-section accent colors (cyan, red, light-blue, amber, purple).
     ════════════════════════════════════════════════════════════════════════ */

  /* Global input/select styling — replaces ~40 inline padding+background+
     border+color repeats across the agent-create + allowlist forms.
     Mirrors the textarea rule from chunk 1. */
  input[type="text"],
  input[type="number"],
  input[type="email"],
  input[type="password"],
  input[type="search"],
  select {
    background: var(--bg-input);
    color: var(--fg-primary);
    border: 1px solid var(--border-default);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    font-size: var(--text-body);
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s;
  }
  input[type="text"]:focus,
  input[type="number"]:focus,
  input[type="email"]:focus,
  input[type="password"]:focus,
  input[type="search"]:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card-2);
  }
  input[type="text"]::placeholder,
  input[type="number"]::placeholder,
  input[type="email"]::placeholder,
  input[type="search"]::placeholder,
  textarea::placeholder {
    color: var(--fg-disabled);
  }
  label {
    color: var(--fg-muted);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  /* Alert panel — for stuck-positions / creator-audit-pending /
     incomplete-bridge call-outs. Two variants: warning + danger. */
  .alert-panel {
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    font-size: var(--text-mono);
    margin-top: var(--s-2);
  }
  .alert-panel.warning {
    background: rgba(255,171,0,0.05);
    border: 1px solid rgba(255,171,0,0.20);
  }
  .alert-panel.danger {
    background: rgba(222,85,85,0.05);
    border: 1px solid rgba(222,85,85,0.20);
  }
  .alert-panel-title {
    font-size: var(--text-caption);
    font-weight: 600;
    margin-bottom: var(--s-1);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .alert-panel.warning .alert-panel-title { color: var(--warning); }
  .alert-panel.danger .alert-panel-title { color: var(--danger); }

  /* Pill-style add button (e.g. "+ Add Token") */
  .btn-pill {
    font-size: var(--text-micro);
    padding: 4px 12px;
    border-radius: var(--r-pill);
    background: var(--accent-surface);
    color: var(--accent);
    border: 1px solid var(--accent-border);
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .btn-pill:hover {
    background: var(--accent-surface);
    border-color: var(--accent);
    color: var(--accent-hover);
  }

  /* Inline form panel — the dashed-border expandable form area used
     by the allowlist add-form. Replaces 2 inline-styled blocks. */
  .form-panel {
    padding: var(--s-3);
    background: var(--accent-surface);
    border: 1px dashed var(--accent-border);
    border-radius: var(--r-md);
    margin-bottom: var(--s-2);
    font-size: var(--text-mono);
  }
  .form-panel-title {
    color: var(--accent);
    font-weight: 600;
    margin-bottom: var(--s-2);
    font-size: var(--text-caption);
  }
  .form-grid {
    display: grid;
    gap: var(--s-2);
    margin-bottom: var(--s-2);
  }
  .form-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .form-grid.cols-5 { grid-template-columns: repeat(5, 1fr); }
  .form-grid.cols-6 { grid-template-columns: repeat(6, 1fr); }
  @media (max-width: 900px) {
    .form-grid.cols-4,
    .form-grid.cols-5,
    .form-grid.cols-6 { grid-template-columns: 1fr 1fr; }
  }
  .form-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-2);
  }
  .form-actions.right { justify-content: flex-end; }
  .form-input-cell label { display: block; margin-bottom: 2px; }

  /* Audit-result block inside the allowlist add-form */
  .audit-result {
    margin-bottom: var(--s-2);
    padding: var(--s-2) var(--s-3);
    background: var(--bg-card-2);
    border-radius: var(--r-sm);
    border: 1px solid var(--border-subtle);
    font-size: var(--text-mono);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Phase 3 — finishing-school polish
     Density toggle widget, empty-state primitive, restricted pulse.
     ════════════════════════════════════════════════════════════════════════ */

  /* Empty-state cell -- normalizes ~12 places that all had inline
     style="padding:6px; color:#555" or similar. Used for table rows
     when there's no data, and for "Loading…" placeholder cells.
     Italic to differentiate from real data; centered + padded so the
     reader's eye finds the message. */
  .empty-state {
    text-align: center;
    padding: var(--s-3) var(--s-4);
    color: var(--fg-disabled);
    font-style: italic;
    font-size: var(--text-mono);
  }

  /* Density toggle widget -- 3-button seg-toggle in the header. Reuses
     .seg-toggle / .seg-toggle-btn from chunk 2; just spaces it from the
     LIVE indicator and shrinks the button width since labels are 1 letter. */
  .density-toggle {
    margin-right: var(--s-3);
  }
  .density-toggle .seg-toggle-btn {
    min-width: 24px;
    text-align: center;
  }

  /* Jump-nav strip — replaces the inline-styled sticky bar above the
     pipeline section. Each <a> uses .nav-pill (defined in chunk 1). */
  .jump-nav {
    position: sticky;
    top: 48px;
    z-index: 45;
    background: linear-gradient(to bottom, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.88) 100%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    margin: 0 calc(var(--s-4) * -1) var(--s-3);
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .jump-nav-label {
    color: var(--fg-muted);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin-right: var(--s-1);
  }

  /* Sub-process dashboard stat-cards inner heading */
  #tab-dashboard .stat-card > div:first-child {
    padding-bottom: var(--s-2) !important;
    margin-bottom: var(--s-3) !important;
    border-bottom: 1px solid var(--border-subtle) !important;
    font-size: var(--text-h3) !important;
    letter-spacing: 0;
    font-weight: 600 !important;
    color: var(--fg-primary);
  }

  /* Inline gradient-tinted tabs (Execution Layer + Mythos).preserve intent */
  .tab[style*="00bcd4"] { border-color: rgba(0,188,212,0.25) !important; }
  .tab[style*="00bcd4"].active { background: rgba(0,188,212,0.1) !important; color: #00bcd4 !important; }
  .tab[style*="e040fb"] { border-color: rgba(224,64,251,0.25) !important; }
  .tab[style*="e040fb"].active { background: rgba(224,64,251,0.1) !important; color: #e040fb !important; }

  /* ═══════════════════════════════════════════════════════════════════════
     Session 25.Admin Console Phase 2 dynamic layer.
     Additive motion + feedback cues on top of the cosmic CSS refresh.
     ════════════════════════════════════════════════════════════════════════ */

  /* Heartbeat pulse next to the header status. Animates continuously so
     operators can see the dashboard is alive, even between refreshes. */
  .heartbeat {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    margin-right: var(--s-3);
    padding: 4px 10px 4px 8px;
    border-radius: var(--r-pill);
    border: 1px solid var(--accent-border);
    background: var(--accent-surface);
    font-size: var(--text-micro);
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--accent);
  }
  .heartbeat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px rgba(13,144,255,0.8);
    animation: heartbeatPulse 1.6s ease-in-out infinite;
  }
  @keyframes heartbeatPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    30% { opacity: 0.45; transform: scale(0.75); }
    60% { opacity: 1; transform: scale(1.1); }
  }

  /* Stat-value flash when a number changes (applied via JS on data refresh).
     Phase 3 will restrict this to high-frequency tiles only — currently
     every refresh causes 7 stat tiles to glow simultaneously, which reads
     as nervous, not alive. */
  .stat-card .value.flash {
    animation: valueFlash 900ms ease-out;
  }
  @keyframes valueFlash {
    0% {
      color: var(--accent);
      text-shadow: 0 0 14px rgba(13,144,255,0.85);
    }
    100% {
      text-shadow: 0 0 0 rgba(13,144,255,0);
    }
  }

  /* New row enter animation. When fresh rows land in any table, they fade-up
     slightly. Applied via JS after refresh. */
  tr.row-fresh {
    animation: rowFresh 520ms cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  @keyframes rowFresh {
    0%   { opacity: 0; transform: translateY(-4px); background: var(--accent-surface); }
    60%  { opacity: 1; background: rgba(13,144,255,0.05); }
    100% { opacity: 1; transform: translateY(0); background: transparent; }
  }

  /* Log row click affordance */
  tr.log-row { transition: background-color 0.12s; }
  tr.log-row:hover { background: var(--accent-surface) !important; }
  tr.log-row:hover td { color: var(--fg-primary); }

  /* Click-through modal for log rows */
  .log-modal-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    align-items: center;
    justify-content: center;
    padding: var(--s-6);
  }
  .log-modal-body {
    width: 100%;
    max-width: 760px;
    max-height: calc(100vh - 48px);
    overflow: hidden;
    background: var(--bg-card);
    border: 1px solid var(--border-default);
    border-radius: var(--r-lg);
    padding: var(--s-5) var(--s-6);
    box-shadow: 0 32px 80px rgba(0,0,0,0.7);
  }

  /* Refresh button.spin the arrow while refreshing. */
  .refresh-btn.refreshing {
    pointer-events: none;
    opacity: 0.7;
  }
  .refresh-btn.refreshing::before {
    content: '↻ ';
    display: inline-block;
    animation: refreshSpin 900ms linear infinite;
  }
  @keyframes refreshSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="page-title-row">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="page-title-icon">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      <h1>AFI Admin Console</h1>
    </div>
    <div class="status">Intent Layer ↔ Execution Layer · Real-time monitoring</div>
  </div>
  <div style="display:flex;align-items:center;">
    <div class="seg-toggle density-toggle" role="group" aria-label="Row density">
      <button class="seg-toggle-btn" data-density="compact" onclick="setDensity('compact')" title="Compact rows">C</button>
      <button class="seg-toggle-btn active" data-density="comfortable" onclick="setDensity('comfortable')" title="Default density">D</button>
      <button class="seg-toggle-btn" data-density="spacious" onclick="setDensity('spacious')" title="Spacious rows">S</button>
    </div>
    <span class="heartbeat" title="Dashboard is live and polling"><span class="heartbeat-dot" aria-hidden></span> LIVE</span>
    <button class="refresh-btn" id="refreshBtn" onclick="refreshAll()">↻ Refresh</button>
    <span class="auto-label" id="lastRefresh">—</span>
  </div>
</div>

<div class="grid" id="stats-grid">
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
    <div class="label">Pending Card Txs</div>
    <div class="value blue" id="s-pending-card">—</div>
  </div>
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
    </svg>
    <div class="label">Pending Market Bets</div>
    <div class="value blue" id="s-pending-bets">—</div>
  </div>
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
    <div class="label">Won (Unpaid)</div>
    <div class="value yellow" id="s-won-unpaid">—</div>
  </div>
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
    </svg>
    <div class="label">Errors (24h)</div>
    <div class="value red" id="s-errors">—</div>
  </div>
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
    </svg>
    <div class="label">Total Cards</div>
    <div class="value green" id="s-total-cards">—</div>
  </div>
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>
    </svg>
    <div class="label">Frozen Cards</div>
    <div class="value red" id="s-frozen">—</div>
  </div>
  <div class="stat-card">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="stat-icon">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
    <div class="label">Issuer Linked</div>
    <div class="value green" id="s-issuer">—</div>
  </div>
</div>

<div class="section">
  <div class="tabs">
    <div class="tab active" onclick="switchTab('dashboard')">Sub-Processes</div>
    <div class="tab" onclick="switchTab('log')">Full Log</div>
    <div class="tab" onclick="switchTab('pending')">Pending Intents</div>
    <div class="tab" onclick="switchTab('cards')">Cards</div>
    <div class="tab" onclick="switchTab('feeds')">Market Feeds</div>
    <div class="tab" onclick="switchTab('execution')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
        <path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>
      </svg>
      Execution Layer
    </div>
    <div class="tab" onclick="switchTab('mythos')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      </svg>
      Mythos
    </div>
    <div class="tab" onclick="switchTab('helm')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      </svg>
      Helm
    </div>
    <div class="tab" onclick="switchTab('contracts')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
      Contracts
    </div>
  </div>

  <!-- ── SUB-PROCESS GRID DASHBOARD ──────────────────────────────────── -->
  <div id="tab-dashboard">
    <!-- Session 27 jump-nav, refactored in Phase 2 chunk 3 to use .jump-nav
         + .nav-pill (chunk 1 utility) + Lucide inline SVGs. Sticky beneath
         tab row so operators can bounce between sections without scrolling
         through the whole wall. -->
    <div class="jump-nav">
      <span class="jump-nav-label">Jump to</span>
      <a href="#section-pipeline" class="nav-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
          <line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
        Pipeline
      </a>
      <a href="#section-webhooks" class="nav-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
          <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
        </svg>
        Webhooks
      </a>
      <a href="#section-queue" class="nav-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
          <rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>
        </svg>
        Queue &amp; Triage
      </a>
      <a href="#section-markets" class="nav-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
          <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
        </svg>
        Markets
      </a>
      <a href="#section-agents" class="nav-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
          <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
        </svg>
        Agents
      </a>
      <a href="#section-subprocess" class="nav-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
          <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
        </svg>
        Sub-processes
      </a>
    </div>

    <!-- Section: Pipeline & Infrastructure -->
    <div id="section-pipeline" class="section"></div>
    <!-- Sprint 6.5: Deposit Funnel + Chain Health hero strip (Phase 2 chunk 2) -->
    <div class="hero-strip">

      <div class="card card-glass">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
            </svg>
            <div class="card-title">Deposit Funnel</div>
            <span id="funnel-range-label" class="card-subtitle">24h</span>
          </div>
          <div class="seg-toggle">
            <button id="funnel-btn-24h" class="seg-toggle-btn active" onclick="setFunnelRange('24h')">24h</button>
            <button id="funnel-btn-7d" class="seg-toggle-btn" onclick="setFunnelRange('7d')">7d</button>
          </div>
        </div>
        <div id="funnel-overall" class="kpi-grid" style="margin-bottom: var(--s-3);">
          <div class="kpi-tile">
            <div class="kpi-label">Detected</div>
            <div id="funnel-detected" class="kpi-value">—</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-label">Bridged</div>
            <div id="funnel-bridged" class="kpi-value brand">—</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-label">Pending</div>
            <div id="funnel-pending" class="kpi-value warning">—</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-label">Failed</div>
            <div id="funnel-failed" class="kpi-value danger">—</div>
          </div>
        </div>
        <!-- Sparkline: stacked bars per bucket (hour for 24h, day for 7d) -->
        <svg id="funnel-spark" class="funnel-spark" viewBox="0 0 240 40" preserveAspectRatio="none"></svg>
        <div id="funnel-meta" class="funnel-meta">—</div>
      </div>

      <div class="card card-glass">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <div class="card-title">Chain Health</div>
          </div>
        </div>
        <div id="chain-health-strip" class="chain-health-strip">
          <div class="muted-text">Loading…</div>
        </div>
      </div>

    </div>

    <!-- Sprint 2.6 scheduled intents countdown panel. Hidden when empty. -->
    <!-- Section: Webhooks -->
    <div id="section-webhooks" class="section"></div>
    <!-- Session 27 Issuer webhook live-feed panel (Phase 2 chunk 4 restyle).
         Shows HMAC verify stats + last 20 verification attempts (including
         HMAC-rejected). LIVE indicator when observe_only flips off. -->
    <div class="card" style="margin-bottom: var(--s-3);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
            <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
          </svg>
          <div class="card-title">Issuer Webhooks</div>
          <span id="webhook-observe-state" class="status-pill">&mdash;</span>
        </div>
        <div id="webhook-last-seen" class="muted-text">&mdash;</div>
      </div>
      <!-- HMAC verify strip: 4-up KPI tiles -->
      <div class="kpi-grid" style="margin-bottom: var(--s-3);">
        <div class="kpi-tile">
          <div class="kpi-label">Total verified</div>
          <div id="wh-verified" class="kpi-value brand">&mdash;</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">HMAC rejected</div>
          <div id="wh-rejected" class="kpi-value danger">&mdash;</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">Verify rate</div>
          <div id="wh-rate" class="kpi-value info">&mdash;</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-label">Last 24h</div>
          <div id="wh-24h" class="kpi-value">&mdash;</div>
        </div>
      </div>
      <!-- Recent verification attempts -->
      <details>
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Recent 20 verification attempts (HMAC trail)
        </summary>
        <div style="overflow-x:auto;">
          <table class="compact-table">
            <thead><tr><th>When</th><th>Result</th><th>From IP</th><th>Sig prefix</th><th>Body hash</th></tr></thead>
            <tbody id="webhook-verify-tbody"></tbody>
          </table>
        </div>
      </details>
      <!-- Recent processed events -->
      <details>
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Recent 20 processed events
        </summary>
        <div style="overflow-x:auto;">
          <table class="compact-table">
            <thead><tr><th>When</th><th>Event type</th><th>Issuer user</th><th>Result</th></tr></thead>
            <tbody id="webhook-events-tbody"></tbody>
          </table>
        </div>
      </details>
    </div>

    <!-- Section: Queue & Triage -->
    <div id="section-queue" class="section"></div>
    <div id="scheduled-intents-panel" class="card" style="display:none; margin-bottom: var(--s-3);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div class="card-title">Scheduled Intents</div>
          <span id="scheduled-count" class="card-subtitle">&mdash;</span>
        </div>
        <div class="muted-text">Upcoming + history</div>
      </div>
      <!-- Upcoming queue -->
      <div class="muted-text" style="font-weight: 600; margin-bottom: var(--s-1); text-transform: uppercase; letter-spacing: 0.04em;">Upcoming</div>
      <div style="overflow-x:auto; margin-bottom: var(--s-3);">
        <table class="compact-table">
          <thead><tr>
            <th>Type</th><th>User</th><th>Amount</th><th>Destination</th><th>Scheduled for</th><th>Countdown</th>
          </tr></thead>
          <tbody id="scheduled-intents-tbody"></tbody>
        </table>
      </div>
      <!-- History: last 30 days of completed/cancelled/failed scheduled intents -->
      <details id="scheduled-history-details">
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          History <span id="scheduled-history-count" class="muted-text">&mdash;</span>
        </summary>
        <div style="overflow-x:auto;">
          <table class="compact-table">
            <thead><tr>
              <th>Type</th><th>User</th><th>Amount</th><th>Destination</th><th>Scheduled for</th><th>Final status</th><th>Tx hash</th>
            </tr></thead>
            <tbody id="scheduled-history-tbody"></tbody>
          </table>
        </div>
      </details>
    </div>

    <!-- Sprint 6.4 failed_restart panel. Surfaces incomplete bridges from a
         prior pm2 restart. Hidden when count = 0 to keep dashboard clean. -->
    <div id="failed-restart-panel" class="card" style="display:none; margin-bottom: var(--s-3); border-color: rgba(222,85,85,0.30);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm" style="color: var(--danger);">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
          </svg>
          <div class="card-title">Incomplete bridges from restart</div>
          <span id="failed-restart-count" class="card-subtitle">&mdash;</span>
        </div>
        <div class="muted-text">Inspect each &mdash; user funds may or may not have landed on Base</div>
      </div>
      <div style="overflow-x:auto;">
        <table class="compact-table">
          <thead><tr>
            <th>When</th><th>User</th><th>Source → Dest</th><th>Amount</th><th>Forwarded</th><th>Base deposit addr</th><th>Tx hash</th>
          </tr></thead>
          <tbody id="failed-restart-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- Section: Agents -->
    <div id="section-agents" class="section"></div>
    <!-- Session 27 Sprint 2.3 Agent/bot admin panel (Phase 2 chunk 5 restyle) -->
    <div class="card" style="margin-bottom: var(--s-3);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
            <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
          </svg>
          <div class="card-title">Agents / Bots</div>
          <span id="agents-meta" class="card-subtitle">&mdash;</span>
        </div>
        <div id="agents-flags" class="muted-text"></div>
      </div>
      <!-- Summary strip: 6-up KPI tiles -->
      <div class="kpi-grid" style="margin-bottom: var(--s-3);">
        <div class="kpi-tile"><div class="kpi-label">Total</div><div id="agents-total" class="kpi-value">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Active</div><div id="agents-active" class="kpi-value brand">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Paused</div><div id="agents-paused" class="kpi-value warning">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Funded $</div><div id="agents-funded" class="kpi-value info">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Invested $</div><div id="agents-invested" class="kpi-value info">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Profit $</div><div id="agents-profit" class="kpi-value brand">&mdash;</div></div>
      </div>
      <!-- Session 28 Task 6: Admin agent creation form -->
      <details class="form-panel" style="background: var(--bg-card-2); border-style: solid;">
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Create agent (admin)
        </summary>
        <div class="form-grid cols-4" style="margin-top: var(--s-2);">
          <div class="form-input-cell" style="grid-column: span 2;">
            <label>User ID (UUID or email lookup)</label>
            <input id="agent-create-user" type="text" placeholder="uuid or email@example.com" style="width:100%;" />
          </div>
          <div class="form-input-cell" style="grid-column: span 2;">
            <label>Name</label>
            <input id="agent-create-name" type="text" placeholder="Alpha Bot" maxlength="80" style="width:100%;" />
          </div>
          <div class="form-input-cell">
            <label>Type</label>
            <select id="agent-create-type" style="width:100%;">
              <option value="polymarket">polymarket</option>
            </select>
          </div>
          <div class="form-input-cell">
            <label>Risk $ (0&ndash;10000)</label>
            <input id="agent-create-risk" type="number" min="0" max="10000" value="100" step="10" style="width:100%;" />
          </div>
          <div class="form-input-cell">
            <label>Card ID (optional)</label>
            <input id="agent-create-card" type="text" placeholder="auto-link primary" style="width:100%;" />
          </div>
          <div style="display:flex; align-items:end;">
            <button id="agent-create-submit" type="button" onclick="adminCreateAgent()" class="btn btn-primary" style="width:100%;">Create →</button>
          </div>
        </div>
        <div class="form-input-cell" style="margin-top: var(--s-2);">
          <label>Strategy JSON (advanced &mdash; defaults to passive polymarket)</label>
          <textarea id="agent-create-strategy" rows="2" placeholder='{"mode":"passive","categories":["politics","crypto","sports"]}' style="width:100%;"></textarea>
        </div>
        <div id="agent-create-result" class="muted-text" style="margin-top: var(--s-2);"></div>
      </details>

      <!-- Agent rows -->
      <details style="margin-top: var(--s-2);">
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Recent agents (top 20)
        </summary>
        <div style="overflow-x:auto;">
          <table class="compact-table">
            <thead><tr>
              <th>Name</th><th>User</th><th>Type</th><th>Status</th><th>Wallet</th><th>Funded</th><th>Profit</th><th>Bets</th><th>W/L</th><th>Actions</th>
            </tr></thead>
            <tbody id="agents-rows-tbody"></tbody>
          </table>
        </div>
      </details>
      <!-- Recent bets -->
      <details>
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Recent bets (last 20)
        </summary>
        <div style="overflow-x:auto;">
          <table class="compact-table">
            <thead><tr>
              <th>When</th><th>Agent</th><th>Market</th><th>Side</th><th>Amount</th><th>Status</th><th>Payout</th>
            </tr></thead>
            <tbody id="agents-bets-tbody"></tbody>
          </table>
        </div>
      </details>
    </div>

    <!-- Section: Markets -->
    <div id="section-markets" class="section"></div>
    <!-- Session 27 Prediction market admin panel (Phase 2 chunk 5 restyle) -->
    <div class="card" style="margin-bottom: var(--s-3);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          <div class="card-title">Prediction Markets</div>
          <span id="markets-meta" class="card-subtitle">&mdash;</span>
        </div>
        <div class="muted-text">Live state &middot; manual resolve + creator payout audit</div>
      </div>
      <!-- Summary row: 5-up KPI tiles -->
      <div id="markets-summary" class="kpi-grid" style="margin-bottom: var(--s-3);">
        <div class="kpi-tile"><div class="kpi-label">Active</div><div id="mkt-active" class="kpi-value brand">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Resolved</div><div id="mkt-resolved" class="kpi-value">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Active $ vol</div><div id="mkt-volume" class="kpi-value info">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Creators staked</div><div id="mkt-creators" class="kpi-value">&mdash;</div></div>
        <div class="kpi-tile"><div class="kpi-label">Unrefunded $</div><div id="mkt-unrefunded" class="kpi-value warning">&mdash;</div></div>
      </div>
      <!-- Stuck positions (>30 min pending) - hidden when empty -->
      <div id="markets-stuck-panel" class="alert-panel danger" style="display:none; margin-bottom: var(--s-2);">
        <div class="alert-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
          Stuck pending positions (&gt;30 min)
        </div>
        <div id="markets-stuck-tbody" style="font-size: var(--text-mono);"></div>
      </div>
      <!-- Top active by volume -->
      <details>
        <summary class="disclosure-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="disclosure-icon">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Top 20 active by volume
        </summary>
        <div style="overflow-x:auto;">
          <table class="compact-table">
            <thead><tr>
              <th>Question</th><th>Cat</th><th>Volume</th><th>Yes/No</th><th>Positions</th><th>Resolution</th><th></th>
            </tr></thead>
            <tbody id="markets-active-tbody"></tbody>
          </table>
        </div>
      </details>
      <!-- Creator payout audit - hidden when empty -->
      <div id="markets-creator-audit-panel" class="alert-panel warning" style="display:none;">
        <div class="alert-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
            <path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>
          </svg>
          Resolved markets awaiting creator stake refund or reward payout
        </div>
        <div id="markets-creator-audit-tbody" style="font-size: var(--text-mono);"></div>
      </div>
    </div>

    <!-- Section: Sub-processes (Phase 2 chunk 4 restyle - 10 uniform tiles) -->
    <div id="section-subprocess" class="section"></div>
    <div class="subprocess-grid">
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
            <div class="card-title">Mythos Agent</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-growth-agent"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <div class="card-title">Oracle &amp; Resolutions</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-oracle"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            <div class="card-title">Card &amp; Issuer</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-card-issuer"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
            </svg>
            <div class="card-title">Errors &amp; Crashes</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Source</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-errors"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>
            </svg>
            <div class="card-title">Transfers &amp; P2P</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-transfers"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
            <div class="card-title">Market Bets &amp; Payouts</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-markets"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
            </svg>
            <div class="card-title">Issuer Webhooks</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-webhooks"></tbody></table>
        </div>
      </div>
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>
            </svg>
            <div class="card-title">Client-Side Crashes</div>
          </div>
        </div>
        <div class="subprocess-tile-body">
          <table><thead><tr><th>Time</th><th>Page</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody id="grid-client"></tbody></table>
        </div>
      </div>
      <!-- Sprint 6.1 telemetry: logMonitorSkip writes here; Sprint 6.5 surfaces it -->
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>
            </svg>
            <div class="card-title">Monitor Skips (24h)</div>
          </div>
          <span id="monitor-skip-totals" class="subprocess-tile-totals"></span>
        </div>
        <div class="subprocess-tile-body">
          <div id="monitor-skip-by-reason" class="subprocess-tile-by-reason"></div>
          <table><thead><tr><th>Time</th><th>Reason</th><th>Detail</th></tr></thead>
            <tbody id="grid-monitor-skips"></tbody></table>
        </div>
      </div>
      <!-- Session 23 Marathon 7 telemetry: logSwapAttempt writes here -->
      <div class="card subprocess-tile">
        <div class="card-header">
          <div class="card-title-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
            </svg>
            <div class="card-title">Native→USDC Swaps (24h)</div>
          </div>
          <span id="swap-totals" class="subprocess-tile-totals"></span>
        </div>
        <div class="subprocess-tile-body">
          <div id="swap-by-action" class="subprocess-tile-by-reason"></div>
          <table><thead><tr><th>Time</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody id="grid-swaps"></tbody></table>
        </div>
      </div>
    </div>

    <!-- Session 24 ERC-20 Allowlist Admin Panel (Phase 2 chunk 5 restyle) -->
    <div class="card" style="margin-top: var(--s-3);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
            <circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>
          </svg>
          <div class="card-title">ERC-20 Allowlist</div>
          <span class="card-subtitle">DB-backed</span>
        </div>
        <div style="display:flex; gap: var(--s-2); align-items:center;">
          <span id="allowlist-summary" class="muted-text"></span>
          <button onclick="toggleAllowlistAddForm()" class="btn-pill">+ Add Token</button>
        </div>
      </div>
      <div id="allowlist-add-form" class="form-panel" style="display:none;">
        <div class="form-panel-title">Add new ERC-20 (apply Memecoin Allowlist Policy first)</div>
        <div class="form-grid cols-6">
          <input id="al-chainId"  type="number" placeholder="chainId (e.g. 1)" />
          <input id="al-symbol"   type="text"   placeholder="SYMBOL" />
          <input id="al-name"     type="text"   placeholder="Display name" />
          <input id="al-contract" type="text"   placeholder="0x contract..." />
          <input id="al-decimals" type="number" placeholder="decimals (18)" />
          <select id="al-category">
            <option value="bluechip">bluechip</option>
            <option value="memecoin">memecoin</option>
          </select>
        </div>
        <textarea id="al-notes" placeholder="Audit notes &mdash; TokenSniffer score, liquidity, etc." style="width:100%; min-height: 44px; margin-bottom: var(--s-2);"></textarea>
        <!-- Session 26 GoPlus token audit. Run BEFORE adding to see honeypot + tax + proxy signals. -->
        <div id="al-audit-result" class="audit-result" style="display:none;"></div>
        <div class="form-actions">
          <button onclick="runTokenAudit()" class="btn btn-secondary btn-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            Run audit (GoPlus)
          </button>
          <div style="display:flex; gap: var(--s-1);">
            <button onclick="toggleAllowlistAddForm()" class="btn btn-ghost btn-sm">Cancel</button>
            <button onclick="submitAllowlistAdd()" class="btn btn-primary btn-sm">Add + Force Refresh</button>
          </div>
        </div>
      </div>
      <div style="overflow-y:auto; max-height: 420px;">
        <table>
          <thead>
            <tr><th>Symbol</th><th>Name</th><th>Chain</th><th>Category</th><th>Contract</th><th>Audited</th><th>Liquidity</th><th>Enabled</th></tr>
          </thead>
          <tbody id="grid-allowlist"></tbody>
        </table>
      </div>
    </div>

    <!-- Session 30 Phase 2.5 Solana SPL Allowlist Admin Panel (Phase 2 chunk 5 restyle) -->
    <div class="card" style="margin-top: var(--s-3);">
      <div class="card-header">
        <div class="card-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-sm">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
          </svg>
          <div class="card-title">Solana Allowlist</div>
          <span class="card-subtitle">Jupiter-routed</span>
        </div>
        <div style="display:flex; gap: var(--s-2); align-items:center;">
          <span id="sol-allowlist-summary" class="muted-text"></span>
          <button onclick="toggleSolAllowlistAddForm()" class="btn-pill">+ Add SPL Token</button>
        </div>
      </div>
      <div id="sol-allowlist-add-form" class="form-panel" style="display:none;">
        <div class="form-panel-title">Add Solana SPL token &mdash; verify mint + decimals on Solscan first</div>
        <div class="form-grid cols-5">
          <input id="sol-symbol"   type="text"   placeholder="SYMBOL" />
          <input id="sol-name"     type="text"   placeholder="Display name" />
          <input id="sol-mint"     type="text"   placeholder="Mint address (base58)" style="grid-column: span 2;" />
          <input id="sol-decimals" type="number" placeholder="decimals" />
        </div>
        <select id="sol-category" style="margin-bottom: var(--s-2); width:100%;">
          <option value="memecoin">memecoin</option>
          <option value="bluechip">bluechip</option>
          <option value="stablecoin">stablecoin</option>
          <option value="native">native</option>
        </select>
        <textarea id="sol-notes" placeholder="Audit notes &mdash; liquidity on Raydium/Orca, age, red flags…" style="width:100%; min-height: 44px; margin-bottom: var(--s-2);"></textarea>
        <div class="form-actions right">
          <button onclick="toggleSolAllowlistAddForm()" class="btn btn-ghost btn-sm">Cancel</button>
          <button onclick="submitSolAllowlistAdd()" class="btn btn-primary btn-sm">Add + Force Refresh</button>
        </div>
      </div>
      <div style="overflow-y:auto; max-height: 360px;">
        <table>
          <thead>
            <tr><th>Symbol</th><th>Name</th><th>Category</th><th>Mint</th><th>Decimals</th><th>Audited</th><th>Enabled</th></tr>
          </thead>
          <tbody id="grid-sol-allowlist"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ── FULL EXECUTION LOG ──────────────────────────────────────────── -->
  <div id="tab-log" style="display:none">
    <div class="filter-row">
      <select id="filter-type" onchange="loadLog()">
        <option value="">All Types</option>
        <option value="growth_agent">Growth Agent</option>
        <option value="oracle">Oracle</option>
        <option value="card_transaction">Card Transactions</option>
        <option value="market_position">Market Positions</option>
        <option value="market_payout">Market Payouts</option>
        <option value="owen_sync">Issuer Sync</option>
        <option value="owen_webhook">Issuer Webhooks</option>
        <option value="card_freeze">Card Freeze</option>
        <option value="transfer">Transfers</option>
        <option value="client_error">Client Crashes</option>
        <option value="error_execution">Execution Errors</option>
        <option value="error_monitor">Monitor Errors</option>
        <option value="error_admin">System Errors</option>
      </select>
      <select id="filter-status" onchange="loadLog()">
        <option value="">All Status</option>
        <option value="success">Success</option>
        <option value="failed">Failed</option>
        <option value="skipped">Skipped</option>
      </select>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Time</th><th>Type</th><th>Action</th><th>Status</th><th>Detail</th><th>TX Hash</th><th>Error</th></tr></thead>
      <tbody id="log-body"></tbody></table>
    </div>
  </div>

  <div id="tab-pending" style="display:none">
    <h2>Pending Card Transactions</h2>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>Name</th><th>Created</th></tr></thead>
    <tbody id="pending-card-body"></tbody></table></div>

    <h2>Market Positions (Pending/Won)</h2>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Market</th><th>Side</th><th>Cost</th><th>Status</th><th>TX</th><th>Payout</th></tr></thead>
    <tbody id="pending-market-body"></tbody></table></div>

    <h2>Pending Transfers</h2>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Sender</th><th>Recipient</th><th>Amount</th><th>Created</th></tr></thead>
    <tbody id="pending-transfer-body"></tbody></table></div>
  </div>

  <div id="tab-cards" style="display:none">
    <div class="table-wrap"><table><thead><tr><th>Card ID</th><th>User</th><th>Number</th><th>Balance</th><th>Status</th><th>Issuer ID</th><th>KYC</th><th>Synced At</th></tr></thead>
    <tbody id="cards-body"></tbody></table></div>
  </div>

  <div id="tab-feeds" style="display:none">
    <h2>Crypto Prices (CoinGecko.60s refresh)</h2>
    <div class="table-wrap"><table><thead><tr><th>Coin</th><th>Symbol</th><th>Price</th><th>24h Change</th><th>Volume</th><th>Last Synced</th></tr></thead>
    <tbody id="crypto-body"></tbody></table></div>

    <h2>Auto-Created Markets</h2>
    <div class="table-wrap"><table><thead><tr><th>Question</th><th>Category</th><th>Source</th><th>Status</th><th>Volume</th><th>YES</th><th>NO</th></tr></thead>
    <tbody id="markets-body"></tbody></table></div>

    <h2>Sports Events</h2>
    <div class="table-wrap"><table><thead><tr><th>Sport</th><th>League</th><th>Match</th><th>Date</th><th>Status</th><th>Score</th></tr></thead>
    <tbody id="sports-body"></tbody></table></div>
  </div>

  <!-- ── EXECUTION LAYER PANEL ──────────────────────────────────────── -->
  <div id="tab-execution" style="display:none">
    <!-- Chain Volume Summary -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 12px;">
      <div class="stat-card"><div class="label">Total On-Chain TXs</div><div class="value" style="color:#00bcd4;" id="ex-total-txs">—</div></div>
      <div class="stat-card"><div class="label">Total Volume</div><div class="value" style="color:#0d90ff;" id="ex-total-vol">—</div></div>
      <div class="stat-card"><div class="label">Total Fees Earned</div><div class="value" style="color:#f5a623;" id="ex-total-fees">—</div></div>
      <div class="stat-card"><div class="label">Chains Active</div><div class="value blue" id="ex-chains">—</div></div>
    </div>

    <!-- Sub-tabs -->
    <div class="tabs" style="margin-top:8px;">
      <div class="tab active" onclick="switchExecTab('txs')" id="et-txs">📜 All Transactions</div>
      <div class="tab" onclick="switchExecTab('chain-breakdown')" id="et-chain-breakdown">⛓️ Chain Breakdown</div>
      <div class="tab" onclick="switchExecTab('onchain')" id="et-onchain">🔗 On-Chain Log</div>
      <div class="tab" onclick="switchExecTab('withdrawals')" id="et-withdrawals">💸 Withdrawals</div>
      <div class="tab" onclick="switchExecTab('deposits')" id="et-deposits">📥 Deposits</div>
    </div>

    <!-- All Transactions -->
    <div id="exec-txs">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>User</th><th>Route</th><th>Token</th><th>Amount</th><th>Fee</th><th>Forwarded</th><th>Chain</th><th>Status</th><th>TX Hash</th></tr></thead>
        <tbody id="exec-txs-body"></tbody></table>
      </div>
    </div>

    <!-- Chain Breakdown -->
    <div id="exec-chain-breakdown" style="display:none">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="stat-card">
          <div style="color:#00bcd4; font-size:13px; font-weight:bold; margin-bottom:8px;">Volume by Chain</div>
          <div id="exec-chain-bars" style="font-size:12px;"></div>
        </div>
        <div class="stat-card">
          <div style="color:#00bcd4; font-size:13px; font-weight:bold; margin-bottom:8px;">Transaction Count by Chain</div>
          <div id="exec-chain-counts" style="font-size:12px;"></div>
        </div>
      </div>
    </div>

    <!-- On-Chain Log (entries with tx hashes) -->
    <div id="exec-onchain" style="display:none">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>Type</th><th>Action</th><th>Status</th><th>Detail</th><th>TX Hash</th></tr></thead>
        <tbody id="exec-onchain-body"></tbody></table>
      </div>
    </div>

    <!-- Withdrawals -->
    <div id="exec-withdrawals" style="display:none">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Status</th><th>Detail</th><th>TX Hash</th></tr></thead>
        <tbody id="exec-withdrawals-body"></tbody></table>
      </div>
    </div>

    <!-- Deposits -->
    <div id="exec-deposits" style="display:none">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Status</th><th>Detail</th><th>TX Hash</th></tr></thead>
        <tbody id="exec-deposits-body"></tbody></table>
      </div>
    </div>
  </div>

  <!-- ── MYTHOS AGENT PANEL ─────────────────────────────────────────── -->
  <!-- ── HELM SECURITY PLANE (Session 30 H1) ────────────────────────── -->
  <div id="tab-heimdall" style="display:none">
    <!-- Summary strip -->
    <div style="display:grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 12px;">
      <div class="stat-card"><div class="label">Total Rules</div><div class="value" style="color:#0d90ff;" id="heim-total-rules">52</div></div>
      <div class="stat-card"><div class="label">Live Enforced (TS)</div><div class="value green" id="heim-live-rules">—</div></div>
      <div class="stat-card"><div class="label">Events (24h)</div><div class="value blue" id="heim-events-24h">—</div></div>
      <div class="stat-card"><div class="label">Critical (24h)</div><div class="value" style="color:#ff6b6b;" id="heim-critical-24h">—</div></div>
      <div class="stat-card"><div class="label">Egress Mode</div><div class="value yellow" id="heim-egress-mode">—</div></div>
      <div class="stat-card"><div class="label">Log-scanner</div><div class="value green" id="heim-log-scanner">—</div></div>
    </div>

    <!-- Context band -->
    <div style="padding:10px 14px; background:rgba(13,144,255,0.05); border:1px solid rgba(13,144,255,0.2); border-radius:8px; margin-bottom:12px; font-size:11.5px; color:#aaa; line-height:1.6;">
      <span style="color:#0d90ff; font-weight:700;">🛡️ Helm Layer 4.5</span>.Marathon 8 Corvus security plane. 52-rule catalog (Phase 0 D.2 shipped), TypeScript bridge enforces 2 rules today
      (<span style="color:#0d90ff;">HELM-108</span> secret-in-log redaction · <span style="color:#0d90ff;">HELM-101</span> egress observer). Rust ingress proxy ships in Marathon 8 Phase 1 on the Pi.
      Rules below are grouped by Norse-archetype category.see <span style="color:#0d90ff;">Neural Net/Claude Memory/Helm.Rule Catalog.md</span>.
    </div>

    <!-- Operator controls.per-rule enforce toggles -->
    <div style="display:flex; flex-direction:column; gap:6px; padding:10px 14px; background:rgba(245,166,35,0.04); border:1px solid rgba(245,166,35,0.15); border-radius:8px; margin-bottom:12px; font-size:11.5px;">

      <!-- HELM-101 egress -->
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="color:#aaa; min-width:170px;"><b style="color:#0d90ff;">HELM-101</b> egress mode:</span>
        <span id="heim-egress-current" style="color:#f5a623; font-weight:700; text-transform:uppercase;">—</span>
        <span id="heim-egress-source" style="color:#666; font-size:10px;"></span>
        <div style="margin-left:auto; display:flex; gap:6px;">
          <button onclick="setHelmEgressMode('observe')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(91,141,239,0.4); background:rgba(91,141,239,0.1); color:#5b8def; cursor:pointer; font-weight:700;">→ Observe</button>
          <button onclick="setHelmEgressMode('enforce')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(255,107,107,0.4); background:rgba(255,107,107,0.1); color:#ff6b6b; cursor:pointer; font-weight:700;">→ Enforce (block)</button>
          <button onclick="setHelmEgressMode('env')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid #2a2a4a; background:transparent; color:#888; cursor:pointer;">Revert to env</button>
        </div>
      </div>

      <!-- HELM-105 tx-cap -->
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="color:#aaa; min-width:170px;"><b style="color:#0d90ff;">HELM-105</b> tx-cap mode:</span>
        <span id="heim-txcap-current" style="color:#f5a623; font-weight:700; text-transform:uppercase;">—</span>
        <span id="heim-txcap-cap" style="color:#888; font-size:10px;"></span>
        <span id="heim-txcap-source" style="color:#666; font-size:10px;"></span>
        <div style="margin-left:auto; display:flex; gap:6px;">
          <button onclick="setHelmTxCapMode('observe')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(91,141,239,0.4); background:rgba(91,141,239,0.1); color:#5b8def; cursor:pointer; font-weight:700;">→ Observe</button>
          <button onclick="setHelmTxCapMode('enforce')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(255,107,107,0.4); background:rgba(255,107,107,0.1); color:#ff6b6b; cursor:pointer; font-weight:700;">→ Enforce (block)</button>
          <button onclick="setHelmTxCapPrompt()" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(245,166,35,0.4); background:rgba(245,166,35,0.1); color:#f5a623; cursor:pointer; font-weight:700;">Set cap…</button>
          <button onclick="setHelmTxCapMode('env')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid #2a2a4a; background:transparent; color:#888; cursor:pointer;">Revert</button>
        </div>
      </div>

      <!-- HELM-201/202/203 fs-guard -->
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="color:#aaa; min-width:170px;"><b style="color:#0d90ff;">HELM-201/202/203</b> fs-guard:</span>
        <span id="heim-fsguard-current" style="color:#f5a623; font-weight:700; text-transform:uppercase;">—</span>
        <span id="heim-fsguard-source" style="color:#666; font-size:10px;"></span>
        <div style="margin-left:auto; display:flex; gap:6px;">
          <button onclick="setHelmFsGuardMode('observe')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(91,141,239,0.4); background:rgba(91,141,239,0.1); color:#5b8def; cursor:pointer; font-weight:700;">→ Observe</button>
          <button onclick="setHelmFsGuardMode('enforce')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid rgba(255,107,107,0.4); background:rgba(255,107,107,0.1); color:#ff6b6b; cursor:pointer; font-weight:700;">→ Enforce (block)</button>
          <button onclick="setHelmFsGuardMode('env')" style="padding:4px 10px; font-size:10px; border-radius:6px; border:1px solid #2a2a4a; background:transparent; color:#888; cursor:pointer;">Revert to env</button>
        </div>
      </div>
    </div>

    <!-- Sub-tabs -->
    <div class="tabs" style="margin-top:8px;">
      <div class="tab active" onclick="switchHelmTab('rules')" id="ht-rules">📜 Rule Catalog</div>
      <div class="tab" onclick="switchHelmTab('status')" id="ht-status">🛡️ Status</div>
      <div class="tab" onclick="switchHelmTab('events')" id="ht-events">🚨 Recent Events</div>
      <div class="tab" onclick="switchHelmTab('egress')" id="ht-egress">🌐 Egress Allowlist</div>
      <div class="tab" onclick="switchHelmTab('mythos-pov')" id="ht-mythos-pov">🪞 Mythos POV</div>
    </div>

    <!-- S33 Tier 1 #16.Status panel (self-test) -->
    <div id="heim-sub-status" style="display:none; margin-top:10px;">
      <div class="stat-card">
        <div style="color:#0d90ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Helm self-test.per-rule armed/mode + 24h activity</div>
        <div style="color:#666; font-size:10px; margin-bottom:8px;">
          One row per rule from the canonical catalog. <span style="color:#0d90ff;">armed=yes</span> = scanner installed; <span style="color:#888;">unknown</span> = scaffold-only / Rust-tier rule. Mode <span style="color:#5b8def;">enforce</span> means blocking actions throw; <span style="color:#888;">observe</span> just logs. Click ⟳ to refresh.
        </div>
        <div id="heim-status-rollup" style="display:flex; gap:12px; margin-bottom:10px; font-size:11px;"></div>
        <div style="overflow-y:auto; max-height:560px;">
          <table style="width:100%; font-size:11px;">
            <thead style="position:sticky; top:0; background:var(--bg, #050510);">
              <tr>
                <th style="text-align:left;">Rule</th>
                <th style="text-align:left;">Category</th>
                <th style="text-align:left;">Sev</th>
                <th style="text-align:left;">Action</th>
                <th style="text-align:center;">Armed</th>
                <th style="text-align:center;">Mode</th>
                <th style="text-align:right;">24h</th>
                <th style="text-align:right;">Total</th>
                <th style="text-align:left;">Last fired</th>
              </tr>
            </thead>
            <tbody id="heim-status-tbody"><tr><td colspan="9" class="empty-state">Click <em>Status</em> tab to load…</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Rule catalog -->
    <div id="heim-sub-rules" style="margin-top:10px;">
      <div id="heim-rules-list"></div>
    </div>

    <!-- Events stream -->
    <div id="heim-sub-events" style="display:none; margin-top:10px;">
      <div class="stat-card">
        <div style="color:#0d90ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Recent Helm events (last 100)</div>
        <div style="color:#666; font-size:10px; margin-bottom:8px;">
          Click <span style="color:#f5a623;">FP?</span> to mark a false-positive (rule fired but no real risk) or <span style="color:#0d90ff;">TP</span> to confirm a true-positive. Labels feed the per-rule sensitivity tuning + future enforce-mode flips.
        </div>
        <div style="overflow-y:auto; max-height:520px;">
          <table style="width:100%; font-size:11px;">
            <thead style="position:sticky; top:0; background:var(--bg, #050510);">
              <tr><th>Time</th><th>Rule</th><th>Severity</th><th>Action</th><th>Agent</th><th>Subject</th><th style="text-align:center;">Label</th></tr>
            </thead>
            <tbody id="heim-events-tbody"><tr><td colspan="7" class="empty-state">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Per-rule FP rate summary.drives the "ready to enforce?" decision. -->
      <div class="stat-card" style="margin-top:10px;">
        <div style="color:#3da6ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>Per-rule FP rate (last 30 days)</span>
          <span id="heim-fp-ready-count" style="font-size:10px; font-weight:500; color:#0d90ff; padding:2px 8px; background:rgba(13,144,255,0.08); border:1px solid rgba(13,144,255,0.25); border-radius:4px;"></span>
        </div>
        <div style="color:#666; font-size:10px; margin-bottom:8px;">
          High-volume rules with <span style="color:#0d90ff;">low FP rates</span> (&lt;5%) on &ge;20 labeled events earn a <span style="color:#0d90ff;">●</span> ready dot.candidates for enforce-mode promotion. 7d column catches recent regressions.
        </div>
        <table style="width:100%; font-size:11px;">
          <thead>
            <tr>
              <th style="text-align:left;">Rule</th>
              <th style="text-align:right;">Total events</th>
              <th style="text-align:right;">Labeled</th>
              <th style="text-align:right;">FP count</th>
              <th style="text-align:right;">FP rate (30d)</th>
              <th style="text-align:right;">FP rate (7d)</th>
              <th style="text-align:center;">30d trend</th>
              <th style="text-align:center;" title="Ready to flip observe→enforce">Ready</th>
            </tr>
          </thead>
          <tbody id="heim-fp-rates-tbody">
            <tr><td colspan="8" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Egress allowlist -->
    <div id="heim-sub-egress" style="display:none; margin-top:10px;">
      <div class="stat-card">
        <div style="color:#0d90ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Allowlisted outbound hosts · HELM-101</div>
        <div id="heim-egress-list" style="font-family:monospace; font-size:11px; color:#aaa; columns: 2; column-gap: 20px;"></div>
      </div>
    </div>

    <!-- Mythos POV.agent's-eye view of own state (S31 H2) -->
    <div id="heim-sub-mythos-pov" style="display:none; margin-top:10px;">
      <div style="margin-bottom:10px; padding:10px 14px; background:rgba(192,90,255,0.05); border:1px solid rgba(192,90,255,0.2); border-radius:8px; font-size:11.5px; color:#aaa;">
        <span style="color:#c05aff; font-weight:700;">🪞 Mythos POV</span>.what the agent sees about itself: budget remaining, reputation arc, recent Huginn counsel, prediction track record, ledger activity. Powered by /admin/api/mythos/pov.
      </div>

      <!-- Reputation + budget summary cards -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom:12px;">
        <div class="stat-card"><div class="label">Reputation Tier</div><div class="value" id="m-pov-tier" style="color:#c05aff;">—</div></div>
        <div class="stat-card"><div class="label">Multiplier</div><div class="value" id="m-pov-mult" style="color:#0d90ff;">—</div></div>
        <div class="stat-card"><div class="label">Predictions (total)</div><div class="value blue" id="m-pov-pred-total">—</div></div>
        <div class="stat-card"><div class="label">Avg Score</div><div class="value yellow" id="m-pov-avg-score">—</div></div>
        <div class="stat-card"><div class="label">Weekly Budget</div><div class="value" id="m-pov-budget" style="color:#5b8def;">—</div></div>
        <div class="stat-card"><div class="label">Remaining</div><div class="value green" id="m-pov-budget-remaining">—</div></div>
      </div>

      <!-- Reputation arc chart -->
      <div class="stat-card" style="margin-bottom:12px;">
        <div style="color:#c05aff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Reputation arc.score_avg over time</div>
        <div id="m-pov-arc" style="min-height:120px; padding:8px 4px; color:#666; font-size:11px;">No history yet.first reputation cycle hasn't run.</div>
      </div>

      <!-- Recent counsel (Huginn verdicts on actions Mythos proposed) -->
      <div class="stat-card" style="margin-bottom:12px;">
        <div style="color:#c05aff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Recent Huginn counsel (last 20)</div>
        <div style="overflow-y:auto; max-height:280px;">
          <table style="width:100%; font-size:11px;">
            <thead style="position:sticky; top:0; background:var(--bg, #050510);">
              <tr><th style="text-align:left;">Time</th><th style="text-align:left;">Verdict</th><th style="text-align:left;">Subject</th><th style="text-align:right;">Confidence</th></tr>
            </thead>
            <tbody id="m-pov-counsel-tbody"><tr><td colspan="4" class="empty-state">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Recent predictions -->
      <div class="stat-card" style="margin-bottom:12px;">
        <div style="color:#c05aff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Recent predictions (last 20).outcome scoring drives reputation</div>
        <div style="overflow-y:auto; max-height:280px;">
          <table style="width:100%; font-size:11px;">
            <thead style="position:sticky; top:0; background:var(--bg, #050510);">
              <tr><th style="text-align:left;">Predicted At</th><th style="text-align:left;">Type</th><th style="text-align:left;">Subject</th><th style="text-align:right;">Confidence</th><th style="text-align:right;">Horizon</th><th style="text-align:center;">Status</th></tr>
            </thead>
            <tbody id="m-pov-preds-tbody"><tr><td colspan="6" class="empty-state">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Recent ledger -->
      <div class="stat-card">
        <div style="color:#c05aff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Recent budget ledger (last 20)</div>
        <div style="overflow-y:auto; max-height:280px;">
          <table style="width:100%; font-size:11px;">
            <thead style="position:sticky; top:0; background:var(--bg, #050510);">
              <tr><th style="text-align:left;">Time</th><th style="text-align:left;">Action</th><th style="text-align:right;">Δ</th><th style="text-align:left;">Description</th></tr>
            </thead>
            <tbody id="m-pov-ledger-tbody"><tr><td colspan="4" class="empty-state">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Recent x402 calls (S33.Programmatic Agent Treasury) -->
      <div class="stat-card" style="margin-bottom:12px;">
        <div style="color:#0d90ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span>x402 calls (last 20).agent payments via Coinbase facilitator</span>
          <span id="m-pov-x402-addr" style="font-family:monospace; font-size:10px; color:#666; font-weight:normal;">—</span>
        </div>
        <div style="overflow-y:auto; max-height:300px;">
          <table style="width:100%; font-size:11px;">
            <thead style="position:sticky; top:0; background:var(--bg, #050510);">
              <tr><th style="text-align:left;">Time</th><th style="text-align:left;">Status</th><th style="text-align:left;">Host</th><th style="text-align:right;">Cost</th><th style="text-align:left;">Counsel</th><th style="text-align:left;">Tx</th></tr>
            </thead>
            <tbody id="m-pov-x402-tbody"><tr><td colspan="6" class="empty-state">No x402 calls yet (Phase 1 awaits funded agent vault).</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div id="tab-mythos" style="display:none">
    <!-- Identity Card -->
    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
      <div class="stat-card"><div class="label">Agent Name</div><div class="value" style="color:#e040fb; font-size:20px;" id="m-name">—</div></div>
      <div class="stat-card"><div class="label">Version</div><div class="value green" id="m-version">—</div></div>
      <div class="stat-card"><div class="label">Cycles (30d)</div><div class="value blue" id="m-cycles">—</div></div>
      <div class="stat-card"><div class="label">Total Posts</div><div class="value green" id="m-total-posts">—</div></div>
      <div class="stat-card"><div class="label">Pending Approvals</div><div class="value yellow" id="m-pending">—</div></div>
      <div class="stat-card"><div class="label">Knowledge Entries</div><div class="value blue" id="m-knowledge-count">—</div></div>
    </div>

    <!-- Sub-tabs for Mythos -->
    <div class="tabs" style="margin-top:8px;">
      <div class="tab active" onclick="switchMythosTab('posts')" id="mt-posts">📝 Post Feed</div>
      <div class="tab" onclick="switchMythosTab('approvals')" id="mt-approvals">✅ Approval Queue</div>
      <div class="tab" onclick="switchMythosTab('socials')" id="mt-socials">🔑 API Keys & Socials</div>
      <div class="tab" onclick="switchMythosTab('knowledge')" id="mt-knowledge">🧬 Knowledge Base</div>
      <div class="tab" onclick="switchMythosTab('thoughts')" id="mt-thoughts">💭 Thought Log</div>
      <div class="tab" onclick="switchMythosTab('memory')" id="mt-memory">🗄️ Memory Map</div>
    </div>

    <!-- Post Feed -->
    <div id="mythos-posts">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>Platform</th><th>Type</th><th>Content</th><th>Tags</th><th>Link</th></tr></thead>
        <tbody id="mythos-posts-body"></tbody></table>
      </div>
    </div>

    <!-- Approval Queue -->
    <div id="mythos-approvals" style="display:none">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>Platform</th><th>Risk</th><th>Status</th><th>Content</th><th>Action</th></tr></thead>
        <tbody id="mythos-approvals-body"></tbody></table>
      </div>
    </div>

    <!-- API Keys & Socials -->
    <div id="mythos-socials" style="display:none">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">

        <!-- Connected Platforms -->
        <div class="stat-card" style="grid-column: 1 / -1;">
          <div style="color:#e040fb; font-size:14px; font-weight:bold; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #2a2a4a;">🌐 Connected Platforms</div>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:10px;">

            <!-- X / Twitter -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:#000;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;">𝕏</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">X (Twitter)</span>
                  <span class="badge success">CONNECTED</span>
                </div>
                <div style="color:#888;font-size:11px;margin-bottom:6px;">@nurocard</div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span style="color:#555;font-size:10px;">Password:</span>
                  <code style="background:#0a0a15;padding:2px 6px;border-radius:3px;font-size:10px;color:#aaa;user-select:all;">fuwsyc-vovfow-0wefTi</code>
                </div>
              </div>
            </div>

            <!-- HeyGen -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">🎬</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">HeyGen</span>
                  <span class="badge success">CONNECTED</span>
                </div>
                <div style="color:#888;font-size:11px;margin-bottom:6px;">AI Avatar Video Generation</div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span style="color:#555;font-size:10px;">API Key:</span>
                  <code style="background:#0a0a15;padding:2px 6px;border-radius:3px;font-size:10px;color:#aaa;user-select:all;overflow:hidden;text-overflow:ellipsis;max-width:180px;display:inline-block;">sk_V2_hgu_k4lVo...8imiwI3do</code>
                </div>
              </div>
            </div>

            <!-- Telegram -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:#229ED9;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">✈️</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">Telegram</span>
                  <span class="badge success">CONNECTED</span>
                </div>
                <div style="color:#888;font-size:11px;">Bot + Channel.posting enabled</div>
              </div>
            </div>

            <!-- Moltbook -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#0d90ff,#0a8f6f);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">📗</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">Moltbook</span>
                  <span class="badge pending">PENDING</span>
                </div>
                <div style="color:#888;font-size:11px;">Registration pending.name conflict (409)</div>
              </div>
            </div>

            <!-- YouTube -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:#FF0000;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">▶️</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">YouTube</span>
                  <span class="badge failed">NEEDS SETUP</span>
                </div>
                <div style="color:#888;font-size:11px;">Create channel + OAuth credentials</div>
              </div>
            </div>

            <!-- TikTok -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:#000;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">🎵</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">TikTok</span>
                  <span class="badge failed">NEEDS SETUP</span>
                </div>
                <div style="color:#888;font-size:11px;">Create account + get API access</div>
              </div>
            </div>

            <!-- Instagram -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#833AB4,#FD1D1D,#FCAF45);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">📸</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">Instagram</span>
                  <span class="badge failed">NEEDS SETUP</span>
                </div>
                <div style="color:#888;font-size:11px;">Create business account + Meta API</div>
              </div>
            </div>

            <!-- LinkedIn -->
            <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:14px; display:flex; align-items:flex-start; gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:#0A66C2;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;font-weight:bold;color:#fff;">in</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="color:#e0e0e0;font-weight:bold;font-size:13px;">LinkedIn</span>
                  <span class="badge failed">NEEDS SETUP</span>
                </div>
                <div style="color:#888;font-size:11px;">Create company page + API credentials</div>
              </div>
            </div>

          </div>
        </div>

        <!-- Twitter API Keys -->
        <div class="stat-card">
          <div style="color:#1DA1F2; font-size:13px; font-weight:bold; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid #2a2a4a;">𝕏 Twitter API Keys</div>
          <div style="font-size:11px;">
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a1a2a;">
              <span style="color:#888;">API Key</span>
              <span style="color:#aaa;" id="m-tw-api-key">—</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a1a2a;">
              <span style="color:#888;">API Secret</span>
              <span style="color:#aaa;" id="m-tw-api-secret">—</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a1a2a;">
              <span style="color:#888;">Access Token</span>
              <span style="color:#aaa;" id="m-tw-access">—</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;">
              <span style="color:#888;">Access Secret</span>
              <span style="color:#aaa;" id="m-tw-access-secret">—</span>
            </div>
            <div style="margin-top:8px;padding:6px;background:#1a1a0a;border:1px solid #f5a62333;border-radius:4px;color:#f5a623;font-size:10px;">
              ⚠ Twitter API keys need to be set in .env on VPS:<br>
              TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
            </div>
          </div>
        </div>

        <!-- HeyGen API Details -->
        <div class="stat-card">
          <div style="color:#8b5cf6; font-size:13px; font-weight:bold; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid #2a2a4a;">🎬 HeyGen API</div>
          <div style="font-size:11px;">
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a1a2a;">
              <span style="color:#888;">API Key</span>
              <code style="color:#0d90ff;font-size:10px;user-select:all;">sk_V2_hgu_k4lVoTCoQzs_RBO6U42uX7OsihFxbUrkM6V8imiwI3do</code>
            </div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a1a2a;">
              <span style="color:#888;">Avatar ID</span>
              <span style="color:#f5a623;" id="m-heygen-avatar">needs configuration</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;">
              <span style="color:#888;">Status</span>
              <span class="badge success">KEY VALID</span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Knowledge Base -->
    <div id="mythos-knowledge" style="display:none">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Category</th><th>Insight</th><th>Confidence</th><th>Evidence</th><th>Updated</th></tr></thead>
        <tbody id="mythos-knowledge-body"></tbody></table>
      </div>
    </div>

    <!-- Thought Log -->
    <div id="mythos-thoughts" style="display:none">
      <div class="table-wrap" style="max-height:500px;">
        <table><thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody id="mythos-thoughts-body"></tbody></table>
      </div>
    </div>

    <!-- Memory Map -->
    <div id="mythos-memory" style="display:none">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div class="stat-card">
          <div style="color:#e040fb; font-size:13px; font-weight:bold; margin-bottom:8px;">Memory Categories</div>
          <div id="mythos-memory-map" style="font-size:12px;"></div>
        </div>
        <div class="stat-card">
          <div style="color:#e040fb; font-size:13px; font-weight:bold; margin-bottom:8px;">Recent Thoughts</div>
          <div id="mythos-recent-thoughts" style="font-size:12px; max-height:300px; overflow-y:auto;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── PUBLIC CONTRACTS PANEL (S35 Marathon 11) ──────────────────────────── -->
  <div id="tab-contracts" style="display:none">
    <div style="margin-bottom:12px; padding:10px 14px; background:rgba(61,166,255,0.05); border:1px solid rgba(61,166,255,0.2); border-radius:8px; font-size:11.5px; color:#aaa;">
      <span style="color:#3da6ff; font-weight:700;">📜 Public Contracts</span>.proof-of-existence for every Nuro-deployed smart contract. Mirror of <a href="/contracts.html" target="_blank" style="color:#3da6ff;">app.nuro.finance/contracts.html</a>. Operator surface for quick block-explorer access + balance checks. Refresh ⟳ to recompute live balances.
    </div>

    <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">
      <button onclick="loadContracts()" style="padding:6px 12px; font-size:11px; border-radius:6px; border:1px solid rgba(61,166,255,0.4); background:rgba(61,166,255,0.1); color:#3da6ff; cursor:pointer; font-weight:700;">⟳ Refresh balances</button>
      <a href="/contracts.html" target="_blank" style="padding:6px 12px; font-size:11px; border-radius:6px; border:1px solid #2a2a4a; background:transparent; color:#888; cursor:pointer; text-decoration:none;">↗ Public page</a>
      <span id="contracts-fetched-at" style="margin-left:auto; font-size:10px; color:#555;"></span>
    </div>

    <!-- MyOFTAdapter -->
    <div class="stat-card" style="margin-bottom:12px;">
      <div style="color:#0d90ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">MyOFTAdapter.LayerZero V2 OFT bridge (7 chains)</div>
      <table style="width:100%; font-size:11px;">
        <thead><tr><th style="text-align:left;">Chain</th><th style="text-align:left;">Chain ID</th><th style="text-align:left;">Address</th><th style="text-align:right;">Block</th><th style="text-align:left;">Explorer</th></tr></thead>
        <tbody id="contracts-oft-adapter-tbody"></tbody>
      </table>
    </div>

    <!-- MyOFT -->
    <div class="stat-card" style="margin-bottom:12px;">
      <div style="color:#3da6ff; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">MyOFT.synthetic OFT token (Arbitrum)</div>
      <table style="width:100%; font-size:11px;">
        <thead><tr><th style="text-align:left;">Chain</th><th style="text-align:left;">Address</th><th style="text-align:right;">Block</th><th style="text-align:left;">Explorer</th></tr></thead>
        <tbody id="contracts-oft-token-tbody"></tbody>
      </table>
    </div>

    <!-- Fee Vaults -->
    <div class="stat-card" style="margin-bottom:12px;">
      <div style="color:#5b8def; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Fee Vaults.collected protocol revenue</div>
      <table style="width:100%; font-size:11px;">
        <thead><tr><th style="text-align:left;">Vault</th><th style="text-align:left;">Chain</th><th style="text-align:left;">Address</th><th style="text-align:left;">Explorer</th></tr></thead>
        <tbody id="contracts-fee-vaults-tbody"></tbody>
      </table>
    </div>

    <!-- x402 + Mythos vaults -->
    <div class="stat-card" style="margin-bottom:12px;">
      <div style="color:#f5a623; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">x402 Revenue + Mythos Agent Vault</div>
      <table style="width:100%; font-size:11px;">
        <thead><tr><th style="text-align:left;">Vault</th><th style="text-align:left;">Chain</th><th style="text-align:left;">Address</th><th style="text-align:left;">Explorer</th></tr></thead>
        <tbody id="contracts-x402-tbody"></tbody>
      </table>
    </div>

    <!-- CCTP-only chains note -->
    <div class="stat-card">
      <div style="color:#888; font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px;">Chains supported via external infrastructure (no Nuro contract)</div>
      <div style="color:#aaa; font-size:11.5px; line-height:1.7;">
        <div>▸ <strong style="color:#c5c5c5;">Ethereum, Polygon, Optimism, Avalanche, Mantle, Mode</strong>.Circle CCTP V2 native</div>
        <div>▸ <strong style="color:#c5c5c5;">HyperEVM</strong>.Across Protocol SpokePool <code style="background:#1a1a2e;padding:1px 4px;border-radius:3px;color:#3da6ff;">0x35E63eA3eb0fb7A3bc543C71FB66412e1F6B0E04</code></div>
        <div>▸ <strong style="color:#c5c5c5;">Solana</strong>.Circle CCTP V2 program <code style="background:#1a1a2e;padding:1px 4px;border-radius:3px;color:#3da6ff;">CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3</code></div>
      </div>
    </div>
  </div>
</div>

<script>
const KEY = '${adminKey}';
const BASE = '';
function api(path) { return fetch(BASE + path + (path.includes('?') ? '&' : '?') + 'key=' + KEY).then(r => r.json()); }

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function badge(status) {
  const cls = status === 'success' ? 'success' : status === 'failed' ? 'failed' : status === 'skipped' ? 'skipped' : 'pending';
  return '<span class="badge ' + cls + '">' + status + '</span>';
}
function esc(s) { if (!s) return '—'; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function shortHash(h) { return h ? h.slice(0,10) + '...' : '—'; }

// Phase 2 admin.flash a stat value when it changes, so operators see
// real-time deltas rather than having to squint at static numbers.
function setStat(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = el.textContent;
  const next = String(value ?? '—');
  if (prev !== next) {
    el.textContent = next;
    el.classList.remove('flash');
    // Force reflow so the animation restarts on consecutive changes
    void el.offsetWidth;
    el.classList.add('flash');
  }
}

async function loadSummary() {
  const s = await api('/admin/api/summary');
  setStat('s-pending-card', s.pending_card_transactions);
  setStat('s-pending-bets', s.pending_market_bets);
  setStat('s-won-unpaid', s.won_unpaid);
  setStat('s-errors', s.errors_24h);
  setStat('s-total-cards', s.total_cards);
  setStat('s-frozen', s.frozen_cards);
  setStat('s-issuer', s.issuer_linked_cards);
}

// Phase 2 admin.store the last-loaded execution log rows in-module so
// the drill-down modal can look up the full record by id without another
// API round-trip.
let __lastExecLogRows = [];

async function loadLog() {
  const type = document.getElementById('filter-type').value;
  const status = document.getElementById('filter-status').value;
  let url = '/admin/api/execution-log?limit=100';
  if (type) url += '&entity_type=' + type;
  if (status) url += '&status=' + status;
  const rows = await api(url);
  __lastExecLogRows = rows;
  document.getElementById('log-body').innerHTML = rows.map((r, i) =>
    '<tr class="log-row" data-idx="' + i + '" style="cursor:pointer" onclick="openLogRow(' + i + ')"><td>' + fmtTime(r.created_at) + '</td><td>' + esc(r.entity_type) + '</td><td>' + esc(r.action) +
    '</td><td>' + badge(r.status) + '</td><td title="' + esc(r.detail) + '">' + linkifyTxUuids(r.detail?.slice(0,60) || '') +
    '</td><td>' + shortHash(r.tx_hash) + '</td><td title="' + esc(r.error_message) + '">' + esc(r.error_message?.slice(0,40)) + '</td></tr>'
  ).join('');
}

// Drill-down modal.click any log row to see the full record as JSON
// plus clickable tx_hash links and a "copy to clipboard" button.
function openLogRow(idx) {
  const row = __lastExecLogRows[idx];
  if (!row) return;
  const backdrop = document.getElementById('log-modal-backdrop');
  const body = document.getElementById('log-modal-body');
  if (!backdrop || !body) return;
  const pretty = JSON.stringify(row, null, 2);
  const txLink = row.tx_hash
    ? '<a href="https://basescan.org/tx/' + esc(row.tx_hash) + '" target="_blank" rel="noopener noreferrer" style="color:#0d90ff;text-decoration:none;">View on Basescan ↗</a>'
    : '';
  // Session 27 polish.when entity_id looks like a UUID (common for
  // transfer/market/transaction logs), fetch the linked transaction row
  // and render it inline above the JSON. Gives operator instant context
  // without a second click.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entityIsUuid = row.entity_id && uuidRe.test(String(row.entity_id));
  body.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
      '<div style="display:flex;gap:10px;align-items:center;">' +
        '<span style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#0d90ff;font-weight:700;">' + esc(row.entity_type) + '</span>' +
        '<span style="font-size:15px;color:#e0e0e0;font-weight:600;">' + esc(row.action) + '</span>' +
        badge(row.status) +
      '</div>' +
      '<button onclick="closeLogRow()" aria-label="Close" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#e0e0e0;padding:6px 12px;border-radius:8px;font-size:11px;cursor:pointer;">✕ Close</button>' +
    '</div>' +
    (txLink ? '<div style="margin-bottom:10px;font-size:12px;">' + txLink + '</div>' : '') +
    (entityIsUuid ? '<div id="linked-tx-panel" style="margin-bottom:12px; padding:10px 12px; background:rgba(13,144,255,0.05); border:1px solid rgba(13,144,255,0.15); border-radius:8px; font-size:11px; color:#888;">Loading linked transaction…</div>' : '') +
    '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
      '<button onclick="copyLogJson()" style="background:rgba(13,144,255,0.1);border:1px solid rgba(13,144,255,0.28);color:#0d90ff;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">Copy JSON</button>' +
      '<span id="copy-ack" style="font-size:11px;color:#666;align-self:center;"></span>' +
    '</div>' +
    '<pre id="log-json" style="background:#050510;border:1px solid rgba(255,255,255,0.05);padding:14px;border-radius:10px;font-size:11.5px;line-height:1.65;color:#3da6ff;font-family:Menlo,monospace;overflow:auto;max-height:60vh;white-space:pre-wrap;word-break:break-word;">' +
    esc(pretty) +
    '</pre>';
  backdrop.style.display = 'flex';

  // Async-fetch the linked tx if entity_id is a UUID. Silent on 404 (not
  // every UUID maps to a transaction.could be a bet, transfer,
  // market_position, or something else entirely). Only fire for entity
  // types where we know the FK points at transactions.
  if (entityIsUuid) {
    const likelyTxEntityTypes = ['monitor', 'bridge', 'transfer', 'swap', 'ops_alert', 'market_watcher'];
    const panel = document.getElementById('linked-tx-panel');
    if (!panel) return;
    if (!likelyTxEntityTypes.includes(row.entity_type)) {
      panel.style.display = 'none';
      return;
    }
    api('/admin/api/transaction/' + row.entity_id).then(tx => {
      const age = tx.created_at ? new Date(tx.created_at).toLocaleString() : '—';
      const amt = tx.amount != null ? Number(tx.amount).toFixed(4) + ' ' + (tx.token || 'USDC') : '—';
      const route = 'chain ' + (tx.source_chain || '—') + ' → ' + (tx.dest_chain || '—');
      panel.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
          '<span style="color:#0d90ff; font-weight:600; font-size:11px;">📎 Linked transaction</span>' +
          '<span style="color:#666; font-size:10px;">' + age + '</span>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:10px; font-size:11px;">' +
          '<div><span style="color:#666;">user:</span> <span style="font-family:monospace; color:#e8e8e8;">' + (tx.email || String(tx.user_id || '').slice(0, 10) + '…') + '</span></div>' +
          '<div><span style="color:#666;">route:</span> <span style="color:#e8e8e8;">' + route + '</span></div>' +
          '<div><span style="color:#666;">amount:</span> <span style="color:#0d90ff;">' + amt + '</span></div>' +
          '<div><span style="color:#666;">status:</span> ' + badge(tx.status) + '</div>' +
        '</div>';
    }).catch(() => {
      // Silent.entity_id was a UUID but not a tx. Hide the panel rather than show a scary error.
      panel.style.display = 'none';
    });
  }
}
function closeLogRow() {
  const backdrop = document.getElementById('log-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}
function copyLogJson() {
  const el = document.getElementById('log-json');
  const ack = document.getElementById('copy-ack');
  if (!el) return;
  try {
    navigator.clipboard.writeText(el.textContent || '');
    if (ack) { ack.textContent = '✓ copied'; setTimeout(() => { ack.textContent = ''; }, 2000); }
  } catch (e) {
    if (ack) ack.textContent = 'copy failed';
  }
}

async function loadPending() {
  const p = await api('/admin/api/pending');
  document.getElementById('pending-card-body').innerHTML = p.card_transactions.map(r =>
    '<tr><td>' + r.id?.slice(0,8) + '</td><td>' + esc(r.email || r.user_id?.slice(0,8)) + '</td><td>' + r.type +
    '</td><td>$' + parseFloat(r.amount).toFixed(2) + '</td><td>' + esc(r.name) + '</td><td>' + fmtTime(r.created_at) + '</td></tr>'
  ).join('') || '<tr><td colspan="6">No pending card transactions</td></tr>';

  document.getElementById('pending-market-body').innerHTML = p.market_positions.map(r =>
    '<tr><td>' + r.id?.slice(0,8) + '</td><td>' + esc(r.email || r.user_id?.slice(0,8)) + '</td><td title="' + esc(r.question) + '">' +
    esc(r.question?.slice(0,30)) + '</td><td>' + r.side?.toUpperCase() + '</td><td>$' + parseFloat(r.cost_basis).toFixed(2) +
    '</td><td>' + badge(r.status) + '</td><td>' + shortHash(r.execution_tx_hash) + '</td><td>' +
    (r.payout ? '$' + parseFloat(r.payout).toFixed(2) : '—') + '</td></tr>'
  ).join('') || '<tr><td colspan="8">No pending positions</td></tr>';

  document.getElementById('pending-transfer-body').innerHTML = p.transfers.map(r =>
    '<tr><td>' + r.id?.slice(0,8) + '</td><td>' + esc(r.email || r.sender_user_id?.slice(0,8)) + '</td><td>' +
    esc(r.recipient_name) + '</td><td>$' + parseFloat(r.amount).toFixed(2) + '</td><td>' + fmtTime(r.created_at) + '</td></tr>'
  ).join('') || '<tr><td colspan="5">No pending transfers</td></tr>';

  document.getElementById('cards-body').innerHTML = p.cards.map(r =>
    '<tr><td>' + r.id?.slice(0,8) + '</td><td>' + esc(r.email) + '</td><td>' + esc(r.card_number) +
    '</td><td>$' + parseFloat(r.balance || 0).toFixed(2) + '</td><td>' +
    (r.is_locked ? '<span class="badge frozen">FROZEN</span>' : '<span class="badge active">ACTIVE</span>') +
    '</td><td>' + (r.issuer_card_id ? r.issuer_card_id.slice(0,10) + '...' : '<span class="badge failed">NONE</span>') +
    '</td><td>' + esc(r.kyc_status) + '</td><td>' + fmtTime(r.balance_synced_at) + '</td></tr>'
  ).join('');
}

async function loadFeeds() {
  try {
    const [crypto, sports, markets] = await Promise.all([
      api('/feeds/crypto'),
      api('/feeds/sports?sport=Soccer'),
      fetch(BASE + '/feeds/trending?limit=10' + '&key=' + KEY).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);

    document.getElementById('crypto-body').innerHTML = (crypto || []).map(c =>
      '<tr><td>' + esc(c.name) + '</td><td style="text-transform:uppercase">' + esc(c.symbol) +
      '</td><td>$' + parseFloat(c.current_price || c.price_usd || 0).toLocaleString('en-US', {maximumFractionDigits:2}) +
      '</td><td style="color:' + (parseFloat(c.price_change_percentage_24h || c.price_change_24h || 0) >= 0 ? '#0d90ff' : '#ff5252') + '">' +
      (parseFloat(c.price_change_percentage_24h || c.price_change_24h || 0) >= 0 ? '+' : '') +
      parseFloat(c.price_change_percentage_24h || c.price_change_24h || 0).toFixed(2) + '%</td><td>$' +
      (parseFloat(c.total_volume || c.volume_24h || 0) / 1e6).toFixed(1) + 'M</td><td>' +
      fmtTime(c.last_synced_at) + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No crypto data yet</td></tr>';

    document.getElementById('sports-body').innerHTML = (sports || []).map(s =>
      '<tr><td>' + esc(s.sport) + '</td><td>' + esc(s.league) + '</td><td>' +
      esc(s.home_team) + ' vs ' + esc(s.away_team) + '</td><td>' + fmtTime(s.date) +
      '</td><td>' + badge(s.status === 'finished' ? 'success' : s.status === 'Not Started' ? 'pending' : 'skipped') +
      '</td><td>' + (s.home_score !== null ? s.home_score + '-' + s.away_score : '—') + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No sports data yet</td></tr>';

    document.getElementById('markets-body').innerHTML = (markets || []).map(m =>
      '<tr><td title="' + esc(m.question) + '">' + esc(m.question?.slice(0,50)) + '</td><td>' + esc(m.category) +
      '</td><td>' + esc(m.source) + '</td><td>' + badge('success') + '</td><td>$' +
      (parseFloat(m.volume_24h || 0) / 1000).toFixed(0) + 'K</td><td>' +
      (parseFloat(m.yes_price || 0) * 100).toFixed(0) + '%</td><td>' +
      (parseFloat(m.no_price || 0) * 100).toFixed(0) + '%</td></tr>'
    ).join('') || '<tr><td colspan="7">No trending markets</td></tr>';
  } catch (err) { console.error('Feed load error:', err); }
}

// Phase 3: row-density toggle. Persists in localStorage; restored on init
// before any tables render so the user never sees a flash of default density.
// Three modes: compact (6px) / comfortable (10px = default) / spacious (14px).
function setDensity(mode) {
  if (mode !== 'compact' && mode !== 'comfortable' && mode !== 'spacious') {
    mode = 'comfortable';
  }
  document.body.dataset.density = mode;
  try { localStorage.setItem('admin-density', mode); } catch (e) {}
  // Update toggle button visual state
  var btns = document.querySelectorAll('.density-toggle .seg-toggle-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.density === mode);
  }
}
(function initDensity() {
  var stored = 'comfortable';
  try { stored = localStorage.getItem('admin-density') || 'comfortable'; } catch (e) {}
  // Apply attribute immediately so first paint matches; defer button-class
  // update until DOMContentLoaded since the buttons may not exist yet.
  document.body.dataset.density = stored;
  document.addEventListener('DOMContentLoaded', function () {
    setDensity(stored);
  });
})();

// Sprint 6.5.Deposit Funnel loader. Renders the 4-stat headline +
// sparkline + summary. Updates on refresh + tab switch + range toggle.
var FUNNEL_RANGE = '24h';
function setFunnelRange(r) {
  FUNNEL_RANGE = (r === '7d') ? '7d' : '24h';
  // Phase 2 chunk 2: classList-based active state. The .seg-toggle-btn
  // and .seg-toggle-btn.active styles in CSS handle the visual --
  // no more inline cssText hack.
  var btn24 = document.getElementById('funnel-btn-24h');
  var btn7d = document.getElementById('funnel-btn-7d');
  var label = document.getElementById('funnel-range-label');
  if (btn24 && btn7d) {
    btn24.classList.toggle('active', FUNNEL_RANGE === '24h');
    btn7d.classList.toggle('active', FUNNEL_RANGE === '7d');
  }
  if (label) label.textContent = FUNNEL_RANGE;
  loadDepositFunnel();
}

function renderFunnelSparkline(buckets) {
  var svg = document.getElementById('funnel-spark');
  if (!svg || !buckets || buckets.length === 0) return;
  // Clear then re-build
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var W = 240, H = 40, pad = 2;
  var n = buckets.length;
  var barW = (W - pad * 2) / n;
  var max = 1;
  for (var i = 0; i < n; i++) {
    var v = buckets[i].detected || 0;
    if (v > max) max = v;
  }
  for (var i = 0; i < n; i++) {
    var b = buckets[i];
    var x = pad + i * barW;
    var detected = b.detected || 0;
    var bridged = b.bridged || 0;
    var failed = b.failed || 0;
    // Stacked: bridged (green) base, failed (red) atop, remainder detected-bridged-failed = pending (yellow)
    var pending = detected - bridged - failed;
    if (pending < 0) pending = 0;
    var hBridged = (bridged / max) * (H - pad * 2);
    var hFailed = (failed / max) * (H - pad * 2);
    var hPending = (pending / max) * (H - pad * 2);
    var yBase = H - pad;
    // Bridged (bottom)
    if (hBridged > 0) {
      var r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r1.setAttribute('x', String(x + 0.5));
      r1.setAttribute('y', String(yBase - hBridged));
      r1.setAttribute('width', String(Math.max(1, barW - 1)));
      r1.setAttribute('height', String(hBridged));
      r1.setAttribute('fill', '#0d90ff');
      r1.setAttribute('opacity', '0.85');
      svg.appendChild(r1);
    }
    if (hPending > 0) {
      var r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r2.setAttribute('x', String(x + 0.5));
      r2.setAttribute('y', String(yBase - hBridged - hPending));
      r2.setAttribute('width', String(Math.max(1, barW - 1)));
      r2.setAttribute('height', String(hPending));
      // Phase 2 chunk 2: align with --warning token (was #f5a623 amber)
      r2.setAttribute('fill', '#FFAB00');
      r2.setAttribute('opacity', '0.8');
      svg.appendChild(r2);
    }
    if (hFailed > 0) {
      var r3 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r3.setAttribute('x', String(x + 0.5));
      r3.setAttribute('y', String(yBase - hBridged - hPending - hFailed));
      r3.setAttribute('width', String(Math.max(1, barW - 1)));
      r3.setAttribute('height', String(hFailed));
      // Phase 2 chunk 2: align with --danger token (was #ff6b6b coral)
      r3.setAttribute('fill', '#DE5555');
      r3.setAttribute('opacity', '0.8');
      svg.appendChild(r3);
    }
    // Tooltip via <title>
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    g.setAttribute('x', String(x));
    g.setAttribute('y', '0');
    g.setAttribute('width', String(barW));
    g.setAttribute('height', String(H));
    g.setAttribute('fill', 'transparent');
    var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    var tLabel = b.t ? new Date(b.t).toLocaleString() : '';
    title.textContent = tLabel + '\\n' + detected + ' detected · ' + bridged + ' bridged · ' + failed + ' failed';
    g.appendChild(title);
    svg.appendChild(g);
  }
}

async function loadDepositFunnel() {
  try {
    const f = await api('/admin/api/deposit-funnel?range=' + FUNNEL_RANGE);
    const o = f.overall || {};
    setStat('funnel-detected', o.detected ?? 0);
    setStat('funnel-bridged', o.bridged ?? 0);
    setStat('funnel-pending', o.pending ?? 0);
    setStat('funnel-failed', o.failed ?? 0);
    const rate = (o.success_rate != null) ? (o.success_rate * 100).toFixed(1) + '%' : '—';
    const avg = o.avg_confirm_seconds != null ? (o.avg_confirm_seconds < 60 ? o.avg_confirm_seconds + 's' : Math.round(o.avg_confirm_seconds / 60) + 'm') : '—';
    const meta = document.getElementById('funnel-meta');
    if (meta) meta.textContent = 'Success rate: ' + rate + ' · Avg confirm: ' + avg;
    renderFunnelSparkline(f.sparkline || []);
  } catch (err) {
    console.error('[funnel] load error:', err);
  }
}

// Sprint 6.5.Chain Health strip. Renders one pill per chain with
// green/yellow/red color + last-confirmed age.
// Session 27.Issuer webhook live-feed loader. HMAC verify stats +
// live/observe-only pill + recent verification attempts (HMAC trail)
// + recent processed events.
async function loadIssuerWebhooksPanel() {
  try {
    const d = await api('/admin/api/issuer-webhooks');
    const vs = d.verification_stats || {};

    // Phase 2 chunk 4: classList-based status pill (.status-pill + .live |
    // .observe). The .live state has a heartbeat dot pseudo-element so
    // the leading ● glyph isn't needed in the text.
    const stateEl = document.getElementById('webhook-observe-state');
    if (stateEl) {
      stateEl.className = 'status-pill ' + (d.observe_only ? 'observe' : 'live');
      stateEl.textContent = d.observe_only ? 'OBSERVE-ONLY' : 'LIVE';
    }

    // Last-seen timestamp
    const lastSeenEl = document.getElementById('webhook-last-seen');
    if (lastSeenEl) {
      const latest = vs.latest;
      if (latest) {
        const ageMs = Date.now() - new Date(latest).getTime();
        const ageMin = Math.round(ageMs / 60000);
        const ageStr = ageMin < 1 ? '<1m' : ageMin < 60 ? ageMin + 'm' : ageMin < 1440 ? Math.round(ageMin / 60) + 'h' : Math.round(ageMin / 1440) + 'd';
        lastSeenEl.textContent = 'Last SD3 delivery: ' + ageStr + ' ago';
      } else {
        lastSeenEl.textContent = 'No deliveries yet';
      }
    }

    // Summary stats
    setStat('wh-verified', vs.verified || 0);
    setStat('wh-rejected', vs.rejected || 0);
    setStat('wh-24h', vs.last_24h || 0);
    const rateEl = document.getElementById('wh-rate');
    if (rateEl) {
      rateEl.textContent = vs.verify_rate != null
        ? (vs.verify_rate * 100).toFixed(0) + '%'
        : '—';
    }

    // Recent verifications table.
    // Phase 2 chunk 4: cells inherit padding from .compact-table td rule;
    // result spans use .verify-result.verified | .rejected; <code> uses
    // global code styling. No more per-cell style="..." attributes.
    const verifyBody = document.getElementById('webhook-verify-tbody');
    if (verifyBody) {
      const rows = d.recent_verifications || [];
      verifyBody.innerHTML = rows.length === 0
        ? '<tr><td colspan="5" class="empty-state">No verification attempts yet</td></tr>'
        : rows.map((r) => {
          const result = r.signature_verified
            ? '<span class="verify-result verified">✓ verified</span>'
            : '<span class="verify-result rejected">✗ rejected</span>';
          const ip = r.source_ip || '—';
          const sig = r.sig_prefix ? '<code>' + esc(r.sig_prefix) + '…</code>' : '—';
          const body = r.body_prefix ? '<code>' + esc(r.body_prefix) + '…</code>' : '—';
          const when = r.received_at ? new Date(r.received_at).toLocaleString().split(',')[1]?.trim() : '—';
          return '<tr>' +
            '<td>' + when + '</td>' +
            '<td>' + result + '</td>' +
            '<td><code>' + esc(ip) + '</code></td>' +
            '<td>' + sig + '</td>' +
            '<td>' + body + '</td>' +
            '</tr>';
        }).join('');
    }

    // Recent processed events table. Same class-based simplification.
    // resultClass: skipped -> warning, success-ish -> brand, else default.
    const eventsBody = document.getElementById('webhook-events-tbody');
    if (eventsBody) {
      const rows = d.recent || [];
      eventsBody.innerHTML = rows.length === 0
        ? '<tr><td colspan="4" class="empty-state">No processed events yet</td></tr>'
        : rows.map((r) => {
          const result = r.process_result || (r.processed ? 'success' : 'pending');
          const resultClass = result.includes('skipped') ? 'verify-result' // warning-ish
            : result.includes('success') || result.startsWith('kyc_status') || result.startsWith('card_id') ? 'verify-result verified'
            : '';
          const when = r.created_at ? new Date(r.created_at).toLocaleString().split(',')[1]?.trim() : '—';
          return '<tr>' +
            '<td>' + when + '</td>' +
            '<td><code>' + esc(r.event_type || '—') + '</code></td>' +
            '<td title="' + esc(r.issuer_user_id || '') + '"><code>' + esc(String(r.issuer_user_id || '').slice(0, 10) + '…') + '</code></td>' +
            '<td><span class="' + resultClass + '">' + esc(result.slice(0, 40)) + '</span></td>' +
            '</tr>';
        }).join('');
    }
  } catch (err) {
    console.error('[issuer-webhooks-panel] load error:', err);
  }
}

// Session 27 Sprint 2.3.Agent/bot admin loader. Summary strip + top 20
// agents + recent bet outcomes. Flag display for AGENT_* env state.
async function loadAgentsAdmin() {
  try {
    const d = await api('/admin/api/agents');
    const s = d.summary || {};
    setStat('agents-total', s.total || 0);
    setStat('agents-active', s.active || 0);
    setStat('agents-paused', s.paused || 0);
    const fundedEl = document.getElementById('agents-funded');
    if (fundedEl) fundedEl.textContent = '$' + Math.round(s.total_funded_usd || 0).toLocaleString();
    const invEl = document.getElementById('agents-invested');
    if (invEl) invEl.textContent = '$' + Math.round(s.total_invested_usd || 0).toLocaleString();
    const profEl = document.getElementById('agents-profit');
    if (profEl) {
      const p = Math.round(s.total_profit_usd || 0);
      profEl.textContent = (p >= 0 ? '+' : '') + '$' + p.toLocaleString();
      profEl.style.color = p >= 0 ? '#0d90ff' : '#ff6b6b';
    }
    const meta = document.getElementById('agents-meta');
    if (meta) meta.textContent = (s.total || 0) + ' total · ' + (s.active || 0) + ' active';

    // Flags display.shows which AGENT_* env vars are live
    const flags = document.getElementById('agents-flags');
    if (flags) {
      const chip = (on, label, onColor, offColor) =>
        '<span style="display:inline-block; padding:2px 8px; margin-left:4px; border-radius:999px; font-size:10px; font-weight:600; background:' + (on ? onColor + '22' : 'rgba(255,255,255,0.05)') + '; color:' + (on ? onColor : offColor) + ';">' + label + (on ? ' ✓' : ' ✗') + '</span>';
      flags.innerHTML =
        chip(!d.funding_observe_only, 'funding_live', '#0d90ff', '#f5a623') +
        chip(d.clob_trades_enabled, 'clob_live', '#0d90ff', '#888') +
        chip(d.profit_sweep_enabled, 'sweep_live', '#0d90ff', '#888');
    }

    // Agent rows
    const rowsBody = document.getElementById('agents-rows-tbody');
    if (rowsBody) {
      const agents = d.agents || [];
      rowsBody.innerHTML = agents.length === 0
        ? '<tr><td colspan="10" class="empty-state">No agents yet</td></tr>'
        : agents.map((a) => {
          const status = a.status || 'unknown';
          const statusColor = status === 'active' ? '#0d90ff' : status === 'paused' ? '#f5a623' : '#888';
          const walletShort = a.wallet_address ? a.wallet_address.slice(0, 6) + '…' + a.wallet_address.slice(-4) : '—';
          const userShort = String(a.email || a.user_id || '').slice(0, 20);
          const profit = Number(a.total_profit) || 0;
          const profColor = profit >= 0 ? '#0d90ff' : '#ff6b6b';
          const wins = parseInt(a.wins) || 0;
          const betCount = parseInt(a.bet_count) || 0;
          const wlStr = betCount > 0 ? wins + '/' + (betCount - wins) : '—';
          // Session 27.manual controls per row
          const toggleLabel = status === 'active' ? 'Pause' : status === 'paused' ? 'Resume' : '—';
          const toggleTarget = status === 'active' ? 'paused' : 'active';
          const toggleColor = status === 'active' ? '#f5a623' : '#0d90ff';
          const toggleBtn = (status === 'active' || status === 'paused')
            ? '<button onclick="agentToggleStatus(\\\'' + a.id + '\\\', \\\'' + toggleTarget + '\\\', \\\'' + esc((a.name || '').slice(0, 30)).replace(/\\\'/g, '') + '\\\')" style="padding:2px 6px; font-size:9px; background:rgba(' + (status === 'active' ? '245,166,35' : '22,224,169') + ',0.12); color:' + toggleColor + '; border:1px solid ' + toggleColor + '33; border-radius:4px; cursor:pointer; margin-right:3px;">' + toggleLabel + '</button>'
            : '';
          const riskBtn = '<button onclick="agentSetRiskLimit(\\\'' + a.id + '\\\', \\\'' + esc((a.name || '').slice(0, 30)).replace(/\\\'/g, '') + '\\\', ' + (Number(a.risk_limit) || 0) + ')" style="padding:2px 6px; font-size:9px; background:rgba(61,166,255,0.12); color:#3da6ff; border:1px solid rgba(61,166,255,0.3); border-radius:4px; cursor:pointer;">Risk</button>';
          return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<td style="padding:3px 6px; color:#e8e8e8;">' + esc((a.name || '').slice(0, 24)) + '</td>' +
            '<td style="padding:3px 6px; color:#888; font-family:monospace;" title="' + esc(a.user_id || '') + '">' + esc(userShort) + '</td>' +
            '<td style="padding:3px 6px; color:#3da6ff;">' + esc(a.type || '—') + '</td>' +
            '<td style="padding:3px 6px;"><span style="color:' + statusColor + ';">' + esc(status) + '</span></td>' +
            '<td style="padding:3px 6px; font-family:monospace; color:#aaa;" title="' + esc(a.wallet_address || '') + '">' + walletShort + '</td>' +
            '<td style="padding:3px 6px; color:#00bcd4;">$' + (Number(a.total_funded) || 0).toFixed(2) + '</td>' +
            '<td style="padding:3px 6px; color:' + profColor + ';">' + (profit >= 0 ? '+' : '') + '$' + profit.toFixed(2) + '</td>' +
            '<td style="padding:3px 6px; color:#aaa;">' + betCount + '</td>' +
            '<td style="padding:3px 6px; color:#aaa;">' + wlStr + '</td>' +
            '<td style="padding:3px 6px; white-space:nowrap;">' + toggleBtn + riskBtn + '</td>' +
            '</tr>';
        }).join('');
    }

    // Recent bets
    const betsBody = document.getElementById('agents-bets-tbody');
    if (betsBody) {
      const bets = d.recent_bets || [];
      betsBody.innerHTML = bets.length === 0
        ? '<tr><td colspan="7" class="empty-state">No bets yet (bots aren\\'t trading or CLOB_TRADES_ENABLED is off)</td></tr>'
        : bets.map((b) => {
          const status = b.status || 'pending';
          const statusColor = status === 'won' ? '#0d90ff' : status === 'lost' ? '#ff6b6b' : status === 'pending' ? '#f5a623' : '#888';
          const side = String(b.side || '').toLowerCase();
          const sideColor = side === 'yes' ? '#0d90ff' : side === 'no' ? '#ff6b6b' : '#888';
          const payout = Number(b.payout) || 0;
          return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<td style="padding:3px 6px; color:#aaa;">' + (b.created_at ? new Date(b.created_at).toLocaleString().split(',')[1]?.trim() : '—') + '</td>' +
            '<td style="padding:3px 6px; color:#e8e8e8;">' + esc((b.agent_name || '').slice(0, 20)) + '</td>' +
            '<td style="padding:3px 6px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#ccc;" title="' + esc(b.market_question || '') + '">' + esc((b.market_question || '').slice(0, 40)) + '</td>' +
            '<td style="padding:3px 6px; color:' + sideColor + '; font-weight:600;">' + esc(side.toUpperCase()) + '</td>' +
            '<td style="padding:3px 6px; color:#3da6ff;">$' + (Number(b.amount) || 0).toFixed(2) + '</td>' +
            '<td style="padding:3px 6px; color:' + statusColor + ';">' + esc(status) + '</td>' +
            '<td style="padding:3px 6px; color:#aaa;">' + (payout > 0 ? '$' + payout.toFixed(2) : '—') + '</td>' +
            '</tr>';
        }).join('');
    }
  } catch (err) {
    console.error('[agents-admin] load error:', err);
  }
}

// Session 27.Prediction market admin loader. Summary + top active +
// stuck-pending + creator-payout audit. Resolve button triggers manual
// admin resolution (confirms first).
async function loadMarketsAdmin() {
  try {
    const d = await api('/admin/api/markets');
    const s = d.summary || {};
    setStat('mkt-active', s.active || 0);
    setStat('mkt-resolved', s.resolved || 0);
    setStat('mkt-creators', s.creators_with_stake || 0);
    const vol = document.getElementById('mkt-volume');
    if (vol) vol.textContent = '$' + Math.round(s.active_volume_usd || 0).toLocaleString();
    const unref = document.getElementById('mkt-unrefunded');
    if (unref) unref.textContent = '$' + Math.round(s.unrefunded_creator_stake_usd || 0).toLocaleString();
    const meta = document.getElementById('markets-meta');
    if (meta) meta.textContent = (s.active || 0) + ' active · ' + (s.resolved || 0) + ' resolved';

    // Active top 20 table
    const activeBody = document.getElementById('markets-active-tbody');
    if (activeBody) {
      const rows = d.active_top_20 || [];
      activeBody.innerHTML = rows.length === 0
        ? '<tr><td colspan="7" class="empty-state">No active markets</td></tr>'
        : rows.map((m) => {
          const yesPool = Number(m.yes_pool) || 0;
          const noPool = Number(m.no_pool) || 0;
          const total = yesPool + noPool;
          const yesPct = total > 0 ? Math.round((yesPool / total) * 100) : 50;
          const resolution = m.resolution_date ? new Date(m.resolution_date).toLocaleDateString() : '—';
          const vol = Number(m.total_volume) || 0;
          const volStr = vol >= 1000 ? '$' + (vol / 1000).toFixed(1) + 'K' : '$' + vol.toFixed(0);
          return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<td style="padding:3px 6px; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(m.question) + '">' + esc((m.question || '').slice(0, 60)) + '</td>' +
            '<td style="padding:3px 6px; color:#888;">' + esc(m.category || '—') + '</td>' +
            '<td style="padding:3px 6px; color:#3da6ff;">' + volStr + '</td>' +
            '<td style="padding:3px 6px;"><span style="color:#0d90ff;">' + yesPct + '%</span>/<span style="color:#ff6b6b;">' + (100 - yesPct) + '%</span></td>' +
            '<td style="padding:3px 6px; color:#aaa;">' + (m.position_count || 0) + '</td>' +
            '<td style="padding:3px 6px; color:#aaa;">' + resolution + '</td>' +
            '<td style="padding:3px 6px;"><button onclick="resolveMarket(\\\'' + m.id + '\\\', \\\'' + esc(m.question).replace(/\\\'/g, '') + '\\\')" style="padding:2px 8px; font-size:9px; background:rgba(61,166,255,0.12); color:#3da6ff; border:1px solid rgba(61,166,255,0.3); border-radius:4px; cursor:pointer;">Resolve</button></td>' +
            '</tr>';
        }).join('');
    }

    // Stuck pending positions panel
    const stuckPanel = document.getElementById('markets-stuck-panel');
    const stuckBody = document.getElementById('markets-stuck-tbody');
    const stuck = d.stuck_pending_positions || [];
    if (stuckPanel && stuckBody) {
      if (stuck.length === 0) {
        stuckPanel.style.display = 'none';
      } else {
        stuckPanel.style.display = '';
        stuckBody.innerHTML = stuck.map((p) => {
          const ageMin = Math.round(p.age_sec / 60);
          return '<div style="padding:3px 0; color:#ccc;">' +
            '<span style="color:#ff6b6b;">' + ageMin + 'm</span> · ' +
            '<span style="color:#888;">user ' + String(p.user_id || '').slice(0, 8) + '…</span> · ' +
            '<span style="color:' + (p.side === 'yes' ? '#0d90ff' : '#ff6b6b') + ';">' + String(p.side || '').toUpperCase() + '</span> $' +
            Number(p.cost_basis).toFixed(2) + ' on <span style="color:#e8e8e8;">' + esc((p.question || '').slice(0, 50)) + '</span>' +
            '</div>';
        }).join('');
      }
    }

    // Creator payout audit panel
    const creatorPanel = document.getElementById('markets-creator-audit-panel');
    const creatorBody = document.getElementById('markets-creator-audit-tbody');
    const creatorAudit = d.creator_payout_audit || [];
    if (creatorPanel && creatorBody) {
      if (creatorAudit.length === 0) {
        creatorPanel.style.display = 'none';
      } else {
        creatorPanel.style.display = '';
        creatorBody.innerHTML = creatorAudit.map((m) => {
          const needsStake = !m.creator_stake_refund_tx_hash;
          const needsReward = !m.creator_reward_tx_hash;
          const missing = [needsStake ? 'stake refund' : null, needsReward ? 'reward' : null].filter(Boolean).join(' + ');
          return '<div style="padding:3px 0; color:#ccc;">' +
            '<span style="color:#f5a623;">' + missing + ' missing</span> · ' +
            '<span style="color:#888;">creator ' + String(m.creator_id || '').slice(0, 8) + '…</span> · stake: $' +
            Number(m.creator_stake).toFixed(2) + ' · reward: $' + Number(m.creator_reward_amount || 0).toFixed(2) +
            ' · <span style="color:#e8e8e8;">' + esc((m.question || '').slice(0, 60)) + '</span>' +
            '</div>';
        }).join('');
      }
    }
  } catch (err) {
    console.error('[markets-admin] load error:', err);
  }
}

// Session 27.agent manual controls. Pause/resume + risk-limit change
// with confirmation prompts + admin audit via execution_log.
async function agentToggleStatus(id, targetStatus, agentName) {
  const verb = targetStatus === 'paused' ? 'PAUSE' : 'RESUME';
  if (!confirm(verb + ' agent "' + agentName + '"?')) return;
  const reason = prompt('Optional reason (logged to audit trail):');
  try {
    const res = await fetch('/admin/api/agents/' + id + '/status?key=' + encodeURIComponent(new URLSearchParams(location.search).get('key') || ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus, reason: reason || null }),
    });
    const data = await res.json();
    if (!res.ok) { alert('Failed: ' + (data.error || res.status)); return; }
    loadAgentsAdmin();
  } catch (err) {
    alert('Network error: ' + (err.message || String(err)));
  }
}

async function agentSetRiskLimit(id, agentName, currentLimit) {
  const input = prompt('Set risk_limit for "' + agentName + '" (current: $' + currentLimit + ')\\n\\nMax bet size per position in USD (0-10000):', String(currentLimit));
  if (!input) return;
  const limit = parseFloat(input);
  if (!Number.isFinite(limit) || limit < 0 || limit > 10000) {
    alert('Invalid.must be 0-10000');
    return;
  }
  const reason = prompt('Optional reason (logged to audit trail):');
  try {
    const res = await fetch('/admin/api/agents/' + id + '/risk-limit?key=' + encodeURIComponent(new URLSearchParams(location.search).get('key') || ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riskLimit: limit, reason: reason || null }),
    });
    const data = await res.json();
    if (!res.ok) { alert('Failed: ' + (data.error || res.status)); return; }
    loadAgentsAdmin();
  } catch (err) {
    alert('Network error: ' + (err.message || String(err)));
  }
}

// Session 28 Task 6.Admin agent creation. Wires the form in the agents
// panel. Supports userId OR email lookup (convenience.admin rarely has
// UUIDs memorized). Resolves email → uuid client-side by hitting
// /admin/api/users/lookup?email=... before posting to /agents/create.
async function adminCreateAgent() {
  const resultEl = document.getElementById('agent-create-result');
  const setResult = (html, isError) => {
    if (!resultEl) return;
    resultEl.innerHTML = html;
    resultEl.style.color = isError ? '#ff6b6b' : '#0d90ff';
  };
  try {
    const userInput = String((document.getElementById('agent-create-user') || {}).value || '').trim();
    const name = String((document.getElementById('agent-create-name') || {}).value || '').trim();
    const type = String((document.getElementById('agent-create-type') || {}).value || 'polymarket');
    const riskRaw = Number((document.getElementById('agent-create-risk') || {}).value);
    const cardId = String((document.getElementById('agent-create-card') || {}).value || '').trim() || null;
    const strategyRaw = String((document.getElementById('agent-create-strategy') || {}).value || '').trim();

    if (!userInput) { setResult('User ID / email required', true); return; }
    if (!name) { setResult('Name required', true); return; }
    if (!Number.isFinite(riskRaw) || riskRaw < 0 || riskRaw > 10000) {
      setResult('Risk $ must be 0–10000', true); return;
    }
    let strategy = undefined;
    if (strategyRaw) {
      try { strategy = JSON.parse(strategyRaw); }
      catch (e) { setResult('Strategy must be valid JSON', true); return; }
    }

    // Resolve email → userId if input looks like an email
    const key = encodeURIComponent(new URLSearchParams(location.search).get('key') || '');
    let userId = userInput;
    if (userInput.includes('@')) {
      setResult('Resolving email → userId...', false);
      const lookup = await fetch('/admin/api/users/lookup?email=' + encodeURIComponent(userInput) + '&key=' + key);
      if (!lookup.ok) {
        setResult('User lookup failed: ' + lookup.status + '.provide UUID directly', true);
        return;
      }
      const uData = await lookup.json();
      if (!uData.id) {
        setResult('No user found for email ' + userInput, true);
        return;
      }
      userId = uData.id;
    }

    setResult('Creating agent...', false);
    const res = await fetch('/admin/api/agents/create?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId, name: name, type: type, riskLimit: riskRaw, cardId: cardId, strategy: strategy }),
    });
    const data = await res.json();
    if (!res.ok) { setResult('Failed: ' + (data.error || res.status), true); return; }

    const a = data.agent || {};
    const fi = data.fundingInstructions || {};
    setResult(
      '✓ Agent created · id=' + String(a.id).slice(0, 8) + '… · wallet=<code>' + String(a.wallet_address || '').slice(0, 10) + '…</code> · ' +
      'Fund with $' + (fi.recommendedUsd || 0) + '+ USDC on ' + (fi.chain || 'Polygon'),
      false
    );
    // Clear inputs for next create
    const nameEl = document.getElementById('agent-create-name'); if (nameEl) nameEl.value = '';
    const strategyEl = document.getElementById('agent-create-strategy'); if (strategyEl) strategyEl.value = '';
    loadAgentsAdmin();
  } catch (err) {
    setResult('Network error: ' + (err.message || String(err)), true);
  }
}

// Manual resolve handler.prompts + POSTs to /admin/api/markets/:id/resolve
async function resolveMarket(id, question) {
  const outcome = prompt('Resolve "' + question.slice(0, 80) + '"\\n\\nEnter outcome: yes / no / invalid');
  if (!outcome) return;
  if (!['yes', 'no', 'invalid'].includes(outcome.toLowerCase())) {
    alert('Invalid outcome. Must be: yes, no, or invalid');
    return;
  }
  const reason = prompt('Optional reason for audit trail (logged to execution_log):');
  try {
    const res = await fetch('/admin/api/markets/' + id + '/resolve?key=' + encodeURIComponent(new URLSearchParams(location.search).get('key') || ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: outcome.toLowerCase(), reason: reason || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Failed: ' + (data.error || res.status));
      return;
    }
    alert('Resolved: ' + (data.market?.question?.slice(0, 60) || id) + ' → ' + (data.market?.resolved_outcome || outcome));
    loadMarketsAdmin();
  } catch (err) {
    alert('Network error: ' + (err.message || String(err)));
  }
}

// Sprint 6.1 thin slice.UUID-to-clickable-chip for skip-row detail messages.
// Regex finds UUIDs in free-text and wraps them in a span that opens the
// transaction detail modal via /admin/api/transaction/:id. Non-UUID text
// stays unchanged. Text is HTML-escaped before regex so we don't break.
function linkifyTxUuids(rawText) {
  if (!rawText) return '';
  const escaped = esc(rawText);
  const uuidRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  return escaped.replace(uuidRe,
    '<span onclick="event.stopPropagation(); openTxDetail(\\\'$1\\\')" style="color:#0d90ff; cursor:pointer; border-bottom:1px dotted #0d90ff55; font-family:monospace;" title="Click to inspect transaction $1">$1</span>'
  );
}

// Sprint 6.1.transaction detail modal. Opens on click of a UUID chip
// in any skip detail / log detail. Reuses the log-modal-backdrop element
// so we don't duplicate modal infrastructure.
async function openTxDetail(id) {
  const backdrop = document.getElementById('log-modal-backdrop');
  const body = document.getElementById('log-modal-body');
  if (!backdrop || !body) return;
  body.innerHTML = '<div style="padding:20px; color:#888;">Loading transaction ' + esc(id) + '…</div>';
  backdrop.style.display = 'flex';
  try {
    const tx = await api('/admin/api/transaction/' + id);
    const pretty = JSON.stringify(tx, null, 2);
    const explorerLink = tx.tx_hash
      ? '<a href="https://basescan.org/tx/' + esc(tx.tx_hash) + '" target="_blank" rel="noopener noreferrer" style="color:#0d90ff;text-decoration:none;">View on Basescan ↗</a>'
      : '';
    body.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="display:flex;gap:10px;align-items:center;">' +
          '<span style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#0d90ff;font-weight:700;">transaction</span>' +
          '<span style="font-size:15px;color:#e0e0e0;font-weight:600;">' + esc(tx.id) + '</span>' +
          badge(tx.status) +
        '</div>' +
        '<button onclick="closeLogRow()" aria-label="Close" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#e0e0e0;padding:6px 12px;border-radius:8px;font-size:11px;cursor:pointer;">✕ Close</button>' +
      '</div>' +
      (explorerLink ? '<div style="margin-bottom:10px;font-size:12px;">' + explorerLink + '</div>' : '') +
      '<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom:14px;">' +
        '<div style="padding:8px 10px; background:rgba(10,10,20,0.5); border-radius:8px;"><div style="font-size:9px; color:#666; text-transform:uppercase;">User</div><div style="font-size:12px; color:#e8e8e8; margin-top:2px; font-family:monospace;" title="' + esc(tx.user_id || '') + '">' + esc((tx.email || tx.user_id || '—').toString().slice(0, 24)) + '</div></div>' +
        '<div style="padding:8px 10px; background:rgba(10,10,20,0.5); border-radius:8px;"><div style="font-size:9px; color:#666; text-transform:uppercase;">Route</div><div style="font-size:12px; color:#e8e8e8; margin-top:2px;">chain ' + (tx.source_chain || '—') + ' → ' + (tx.dest_chain || '—') + '</div></div>' +
        '<div style="padding:8px 10px; background:rgba(10,10,20,0.5); border-radius:8px;"><div style="font-size:9px; color:#666; text-transform:uppercase;">Amount</div><div style="font-size:12px; color:#0d90ff; margin-top:2px;">' + (tx.amount != null ? Number(tx.amount).toFixed(6) : '—') + ' ' + (tx.token || '') + '</div></div>' +
      '</div>' +
      '<pre style="background:rgba(10,10,20,0.7); padding:12px; border-radius:8px; overflow:auto; max-height:400px; font-size:11px; line-height:1.4; color:#aaa; margin:0;">' + esc(pretty) + '</pre>';
  } catch (err) {
    body.innerHTML = '<div style="padding:20px; color:#ff6b6b;">Failed to load transaction ' + esc(id) + ': ' + esc(err.message || String(err)) + '</div>';
  }
}

// Sprint 2.6.scheduled intents countdown panel. Hidden when empty.
async function loadScheduledIntents() {
  try {
    const d = await api('/admin/api/scheduled-intents');
    const panel = document.getElementById('scheduled-intents-panel');
    const countEl = document.getElementById('scheduled-count');
    const tbody = document.getElementById('scheduled-intents-tbody');
    const historyTbody = document.getElementById('scheduled-history-tbody');
    const historyCountEl = document.getElementById('scheduled-history-count');
    const historyDetails = document.getElementById('scheduled-history-details');
    if (!panel || !countEl || !tbody) return;

    const upcomingTotal = d.total || 0;
    const historyTotal = d.history?.total || 0;

    // Panel is visible if EITHER upcoming or history has rows.
    if (upcomingTotal === 0 && historyTotal === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    countEl.textContent = (d.transfers?.length || 0) + ' upcoming · ' + historyTotal + ' historic';

    const fmtCountdown = (sec) => {
      if (sec == null) return '—';
      if (sec < 0) return '<span style="color:#f5a623;">overdue ' + fmtDur(-sec) + '</span>';
      if (sec < 60) return '<span style="color:#0d90ff;">' + sec + 's</span>';
      return fmtDur(sec);
    };
    const fmtDur = (sec) => {
      if (sec < 3600) return Math.round(sec / 60) + 'm';
      if (sec < 86400) return Math.round(sec / 3600) + 'h';
      return Math.round(sec / 86400) + 'd';
    };

    // Upcoming rows
    const rows = []
      .concat((d.transfers || []).map((t) => ({ ...t, _type: 'transfer' })))
      .concat((d.withdrawals || []).map((w) => ({ ...w, _type: 'withdrawal' })));
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nothing scheduled right now</td></tr>';
    } else {
      tbody.innerHTML = rows.map((r) => {
        const userShort = String(r.user_id || '').slice(0, 8) + '…';
        const when = r.scheduled_at ? new Date(r.scheduled_at).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '—';
        const amt = r.amount != null ? Number(r.amount).toFixed(2) : '—';
        const dest = r._type === 'transfer'
          ? (r.destination || 'wallet') + (r.recipient_email ? ' · ' + r.recipient_email : '')
          : (r.destination_address ? r.destination_address.slice(0, 6) + '…' + r.destination_address.slice(-4) : '—');
        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
          '<td style="padding:4px 6px;"><span style="background:' + (r._type === 'transfer' ? 'rgba(13,144,255,0.1)' : 'rgba(245,166,35,0.1)') + '; padding:1px 6px; border-radius:4px; font-size:10px; color:' + (r._type === 'transfer' ? '#0d90ff' : '#f5a623') + ';">' + r._type + '</span></td>' +
          '<td style="padding:4px 6px; font-family:monospace;" title="' + (r.user_id || '') + '">' + userShort + '</td>' +
          '<td style="padding:4px 6px; text-align:right;">$' + amt + ' ' + (r.currency || r.token || 'USD') + '</td>' +
          '<td style="padding:4px 6px;">' + esc(dest) + '</td>' +
          '<td style="padding:4px 6px; font-size:10px; color:#aaa;">' + when + '</td>' +
          '<td style="padding:4px 6px; font-weight:600;">' + fmtCountdown(r.seconds_until) + '</td>' +
          '</tr>';
      }).join('');
    }

    // History rows (30-day lookback across completed/cancelled/failed)
    if (historyTbody) {
      if (historyCountEl) historyCountEl.textContent = '(' + historyTotal + ' in last 30 days)';
      const historyRows = []
        .concat((d.history?.transfers || []).map((t) => ({ ...t, _type: 'transfer' })))
        .concat((d.history?.withdrawals || []).map((w) => ({ ...w, _type: 'withdrawal' })));
      // Sort by completed_at or created_at, descending
      historyRows.sort((a, b) => {
        const at = new Date(a.completed_at || a.created_at || 0).getTime();
        const bt = new Date(b.completed_at || b.created_at || 0).getTime();
        return bt - at;
      });
      if (historyRows.length === 0) {
        historyTbody.innerHTML = '<tr><td colspan="7" class="empty-state">No scheduled intent history in last 30 days</td></tr>';
      } else {
        historyTbody.innerHTML = historyRows.map((r) => {
          const userShort = String(r.user_id || '').slice(0, 8) + '…';
          const scheduled = r.scheduled_at ? new Date(r.scheduled_at).toISOString().slice(0, 10) : '—';
          const amt = r.amount != null ? Number(r.amount).toFixed(2) : '—';
          const dest = r._type === 'transfer'
            ? (r.destination || 'wallet') + (r.recipient_email ? ' · ' + r.recipient_email : '')
            : (r.destination_address ? r.destination_address.slice(0, 6) + '…' + r.destination_address.slice(-4) : '—');
          const status = r.status || 'unknown';
          const statusColor = status === 'completed' || status === 'confirmed' ? '#0d90ff'
            : status === 'cancelled' ? '#888'
            : status === 'failed' || status === 'failed_restart' ? '#ff6b6b'
            : '#f5a623';
          const txHash = r.execution_tx_hash || r.tx_hash;
          const hashStr = txHash
            ? '<code style="font-size:9px; color:#aaa;">' + txHash.slice(0, 10) + '…</code>'
            : '—';
          return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
            '<td style="padding:3px 6px;"><span style="background:' + (r._type === 'transfer' ? 'rgba(13,144,255,0.1)' : 'rgba(245,166,35,0.1)') + '; padding:1px 6px; border-radius:4px; font-size:9px; color:' + (r._type === 'transfer' ? '#0d90ff' : '#f5a623') + ';">' + r._type + '</span></td>' +
            '<td style="padding:3px 6px; font-family:monospace;" title="' + (r.user_id || '') + '">' + userShort + '</td>' +
            '<td style="padding:3px 6px; text-align:right;">$' + amt + '</td>' +
            '<td style="padding:3px 6px; color:#aaa;">' + esc(dest) + '</td>' +
            '<td style="padding:3px 6px; color:#aaa; font-size:9px;">' + scheduled + '</td>' +
            '<td style="padding:3px 6px; color:' + statusColor + ';">' + esc(status) + '</td>' +
            '<td style="padding:3px 6px;">' + hashStr + '</td>' +
            '</tr>';
        }).join('');
      }
    }
  } catch (err) {
    console.error('[scheduled-intents] load error:', err);
  }
}

// Sprint 6.4.failed_restart panel. Hidden until count > 0.
async function loadFailedRestart() {
  try {
    const d = await api('/admin/api/failed-restart');
    const panel = document.getElementById('failed-restart-panel');
    const countEl = document.getElementById('failed-restart-count');
    const tbody = document.getElementById('failed-restart-tbody');
    if (!panel || !countEl || !tbody) return;
    const total = d.total || 0;
    if (total === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    countEl.textContent = String(total) + ' total · ' + (d.last_24h || 0) + ' last 24h';
    const rows = d.rows || [];
    tbody.innerHTML = rows.map((r) => {
      const when = r.timestamp ? new Date(parseInt(r.timestamp)).toISOString().replace('T', ' ').slice(0, 19) : '—';
      const userShort = String(r.user_id || '').slice(0, 8) + '…';
      const route = (r.source_chain || '—') + ' → ' + (r.dest_chain || '—');
      const amt = r.amount != null ? Number(r.amount).toFixed(4) : '—';
      const fwd = r.forwarded != null ? Number(r.forwarded).toFixed(4) : '—';
      const addr = r.base_deposit_address ? r.base_deposit_address.slice(0, 6) + '…' + r.base_deposit_address.slice(-4) : '—';
      const hash = r.tx_hash ? (r.tx_hash.slice(0, 10) + '…') : '—';
      return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
        '<td style="padding:4px 6px; color:#aaa;">' + when + '</td>' +
        '<td style="padding:4px 6px; font-family:monospace;" title="' + (r.user_id || '') + '">' + userShort + '</td>' +
        '<td style="padding:4px 6px;">' + route + '</td>' +
        '<td style="padding:4px 6px; text-align:right; color:#e8e8e8;">' + amt + ' ' + (r.token || '') + '</td>' +
        '<td style="padding:4px 6px; text-align:right; color:#0d90ff;">' + fwd + '</td>' +
        '<td style="padding:4px 6px; font-family:monospace; color:#888;" title="' + (r.base_deposit_address || '') + '">' + addr + '</td>' +
        '<td style="padding:4px 6px; font-family:monospace; color:#888;" title="' + (r.tx_hash || '') + '">' + hash + '</td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    console.error('[failed-restart] load error:', err);
  }
}

async function loadChainHealth() {
  try {
    const h = await api('/admin/api/chain-health');
    const strip = document.getElementById('chain-health-strip');
    if (!strip) return;
    // Phase 2 chunk 2: class-based pill rendering. The .chain-pill
    // base + .green/.yellow/.red state modifiers in CSS replace the
    // 4-branch hex-color innerHTML template.
    const classFor = (s) => s === 'green' ? 'chain-pill green'
                          : s === 'yellow' ? 'chain-pill yellow'
                          : s === 'red' ? 'chain-pill red'
                          : 'chain-pill';
    const fmtAge = (sec) => {
      if (sec == null) return 'never';
      if (sec < 60) return sec + 's';
      if (sec < 3600) return Math.round(sec / 60) + 'm';
      if (sec < 86400) return Math.round(sec / 3600) + 'h';
      return Math.round(sec / 86400) + 'd';
    };
    // Session 26 polish: when monitor is paused, prepend a small hint
    // pill explaining why age thresholds are relaxed.
    var pausedHint = '';
    if (h.monitor_paused) {
      var pollH = h.poll_interval_sec ? Math.round(h.poll_interval_sec / 3600) : '?';
      var pauseTitle = 'POLL_INTERVAL_MS is set to ' + (h.poll_interval_sec || 0) + 's. Monitor is intentionally paused, age thresholds relaxed (green <48h, yellow <7d).';
      pausedHint = '<div class="monitor-paused-pill" title="' + pauseTitle + '">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-xs"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
        + 'monitor paused (' + pollH + 'h poll)</div>';
    }
    if (!h.chains || h.chains.length === 0) {
      strip.innerHTML = pausedHint + '<div class="muted-text">No deposit activity in last 7 days</div>';
      return;
    }
    strip.innerHTML = pausedHint + h.chains.map((c) => {
      const issue = c.stuck_pending > 0 ? ' · ' + c.stuck_pending + ' stuck'
                  : c.recent_failures > 0 ? ' · ' + c.recent_failures + ' fail'
                  : '';
      return '<div class="' + classFor(c.status) + '" title="last confirmed ' + fmtAge(c.last_confirmed_age_sec) + ' ago' + issue + '">'
        + '<span class="chain-dot"></span>chain ' + c.chain_id
        + '</div>';
    }).join('');
  } catch (err) {
    console.error('[chain-health] load error:', err);
  }
}

async function loadSubProcessGrid() {
  try {
    const all = await api('/admin/api/execution-log?limit=200');
    const gridMap = {
      'grid-growth-agent': (r) => r.entity_type === 'growth_agent',
      'grid-oracle': (r) => r.entity_type === 'oracle',
      'grid-card-issuer': (r) => ['card_transaction','card_freeze','issuer_sync','issuer_card'].includes(r.entity_type),
      'grid-errors': (r) => (r.status === 'failed' && r.entity_type !== 'growth_agent' && r.entity_type !== 'client_error') || r.entity_type?.startsWith('error'),
      'grid-transfers': (r) => r.entity_type === 'transfer',
      'grid-markets': (r) => ['market_position','market_payout'].includes(r.entity_type),
      'grid-webhooks': (r) => r.entity_type === 'issuer_webhook',
      'grid-client': (r) => r.entity_type === 'client_error',
    };
    for (const [gridId, filterFn] of Object.entries(gridMap)) {
      const el = document.getElementById(gridId);
      if (!el) continue;
      const filtered = all.filter(filterFn).slice(0, 20);
      el.innerHTML = filtered.length > 0
        ? filtered.map(r =>
            '<tr><td>' + fmtTime(r.created_at).split(',').pop().trim() + '</td><td>' + esc(r.action?.slice(0,20)) +
            '</td><td>' + badge(r.status) + '</td><td title="' + esc(r.detail) + '">' + linkifyTxUuids(r.detail?.slice(0,40) || '') + '</td></tr>'
          ).join('')
        : '<tr><td colspan="4" class="empty-state">No activity yet</td></tr>';
    }
  } catch (err) { console.error('Grid load error:', err); }
  // Monitor Skips panel (Sprint 6.1 telemetry surfaced.separate endpoint
  // because it adds reason-code aggregation alongside raw rows).
  try {
    const skipData = await api('/admin/api/monitor-skips?limit=20');
    const byReasonEl = document.getElementById('monitor-skip-by-reason');
    const totalsEl = document.getElementById('monitor-skip-totals');
    const tbodyEl = document.getElementById('grid-monitor-skips');
    if (byReasonEl && tbodyEl) {
      const total24h = skipData.by_reason_24h.reduce((s, r) => s + r.count, 0);
      totalsEl.textContent = total24h + ' skips/24h';
      byReasonEl.innerHTML = skipData.by_reason_24h.length > 0
        ? skipData.by_reason_24h.map(r =>
            '<span style="display:inline-block; margin:2px 8px 2px 0; padding:2px 6px; background:#1a1a2e; border-radius:3px;"><span style="color:#888;">' +
            esc(r.reason) + '</span> <span style="color:#0d90ff; font-weight:bold;">' + r.count + '</span></span>'
          ).join('')
        : '<span style="color:#555;">No skips in last 24h</span>';
      tbodyEl.innerHTML = skipData.recent.length > 0
        ? skipData.recent.map(r =>
            '<tr><td>' + fmtTime(r.created_at).split(',').pop().trim() +
            '</td><td style="color:#f5a623;">' + esc(r.reason?.slice(0,28)) +
            '</td><td title="' + esc(r.detail) + '" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px;">' + linkifyTxUuids(r.detail || '') + '</td></tr>'
          ).join('')
        : '<tr><td colspan="3" style="color:#555">No recent skips</td></tr>';
    }
  } catch (err) { console.error('Monitor-skips load error:', err); }
  // Marathon 7 Swap Attempts panel.identical pattern to monitor-skips but
  // separates success vs failure counts and color-codes per-row status.
  try {
    const swapData = await api('/admin/api/swap-attempts?limit=20');
    const byActionEl = document.getElementById('swap-by-action');
    const totalsEl = document.getElementById('swap-totals');
    const tbodyEl = document.getElementById('grid-swaps');
    if (byActionEl && tbodyEl) {
      const total24h = swapData.by_action_24h.reduce((s, r) => s + r.count, 0);
      const success24h = swapData.by_action_24h.filter(r => r.status === 'success').reduce((s, r) => s + r.count, 0);
      totalsEl.textContent = total24h > 0
        ? success24h + '/' + total24h + ' ok · 24h'
        : '0 swaps · 24h';
      byActionEl.innerHTML = swapData.by_action_24h.length > 0
        ? swapData.by_action_24h.map(r => {
            const color = r.status === 'success' ? '#0d90ff' : '#f5a623';
            const label = r.action.replace(/^native_swap:?/, '') || 'success';
            return '<span style="display:inline-block; margin:2px 8px 2px 0; padding:2px 6px; background:#1a1a2e; border-radius:3px;"><span style="color:#888;">' +
              esc(label) + '</span> <span style="color:' + color + '; font-weight:bold;">' + r.count + '</span></span>';
          }).join('')
        : '<span style="color:#555;">No swap attempts in last 24h</span>';
      tbodyEl.innerHTML = swapData.recent.length > 0
        ? swapData.recent.map(r => {
            const color = r.status === 'success' ? '#0d90ff' : '#f5a623';
            const label = r.action.replace(/^native_swap:?/, '') || 'success';
            return '<tr><td>' + fmtTime(r.created_at).split(',').pop().trim() +
              '</td><td style="color:' + color + ';">' + esc(label.slice(0,20)) +
              '</td><td title="' + esc(r.detail) + '" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px;">' + linkifyTxUuids(r.detail || '') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="3" style="color:#555">No recent swaps</td></tr>';
    }
  } catch (err) { console.error('Swap-attempts load error:', err); }

  // Session 24.ERC-20 Allowlist admin panel. Live from DB, admin can
  // toggle enabled or add new tokens without a code redeploy. Every
  // write force-refreshes the in-memory snapshot on the backend side.
  try {
    const al = await api('/admin/api/erc20-allowlist');
    const summaryEl = document.getElementById('allowlist-summary');
    const tbodyEl = document.getElementById('grid-allowlist');
    if (tbodyEl && al && Array.isArray(al.rows)) {
      const enabled = al.rows.filter(r => r.enabled).length;
      const bluechip = al.rows.filter(r => r.category === 'bluechip' && r.enabled).length;
      const meme = al.rows.filter(r => r.category === 'memecoin' && r.enabled).length;
      if (summaryEl) summaryEl.textContent = al.rows.length + ' total · ' + enabled + ' enabled (' + bluechip + ' bluechip · ' + meme + ' memecoin)';
      tbodyEl.innerHTML = al.rows.length > 0
        ? al.rows.map(r => {
            const chainDisplay = chainName(r.chain_id);
            const catColor = r.category === 'memecoin' ? '#3da6ff' : '#5b8def';
            const shortContract = r.contract_address ? r.contract_address.slice(0, 8) + '…' + r.contract_address.slice(-4) : '—';
            const auditedShort = r.audited_at ? String(r.audited_at).slice(0, 10) : '—';
            const liquidityK = r.min_liquidity_usd ? '$' + (Number(r.min_liquidity_usd) / 1000).toFixed(0) + 'K' : '—';
            // Toggle button.calls the toggle endpoint then reloads the panel.
            const toggleBtn = '<button onclick="toggleAllowlistRow(\\\'' + esc(r.id) + '\\\')" style="padding:2px 10px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid ' +
              (r.enabled ? 'rgba(13,144,255,0.5)' : 'rgba(245,166,35,0.5)') + ';background:' +
              (r.enabled ? 'rgba(13,144,255,0.15)' : 'rgba(245,166,35,0.15)') + ';color:' +
              (r.enabled ? '#0d90ff' : '#f5a623') + ';cursor:pointer;">' +
              (r.enabled ? 'ON' : 'OFF') + '</button>';
            return '<tr style="' + (r.enabled ? '' : 'opacity:0.5;') + '">' +
              '<td style="font-weight:700;color:' + catColor + ';">' + esc(r.symbol) + '</td>' +
              '<td style="color:#aaa;">' + esc(r.display_name || '') + '</td>' +
              '<td style="color:#888;">' + esc(chainDisplay) + '</td>' +
              '<td style="color:' + catColor + ';font-size:10px;text-transform:uppercase;letter-spacing:1px;">' + esc(r.category) + '</td>' +
              '<td style="font-family:monospace;font-size:10px;color:#666;" title="' + esc(r.contract_address) + '">' + esc(shortContract) + '</td>' +
              '<td style="color:#666;font-size:10px;" title="' + esc(r.audit_notes || '') + '">' + esc(auditedShort) + '</td>' +
              '<td style="color:#888;font-size:10px;">' + esc(liquidityK) + '</td>' +
              '<td>' + toggleBtn + '</td></tr>';
          }).join('')
        : '<tr><td colspan="8" style="color:#555;text-align:center;padding:12px;">No allowlist entries yet. Use "+ Add Token" to seed.</td></tr>';
    }
  } catch (err) { console.error('Allowlist load error:', err); }

  // Session 30 Phase 2.5.Solana SPL Allowlist admin panel. DB-backed
  // via migration 030. Toggle flips enabled, force-refresh propagates
  // within 60s without redeploy.
  try {
    const sol = await api('/admin/api/solana-allowlist');
    const summaryEl = document.getElementById('sol-allowlist-summary');
    const tbodyEl = document.getElementById('grid-sol-allowlist');
    if (tbodyEl && sol && Array.isArray(sol.rows)) {
      const enabled = sol.rows.filter(r => r.enabled).length;
      const memes = sol.rows.filter(r => r.category === 'memecoin' && r.enabled).length;
      const stables = sol.rows.filter(r => r.category === 'stablecoin' && r.enabled).length;
      if (summaryEl) summaryEl.textContent = sol.rows.length + ' total · ' + enabled + ' enabled (' + memes + ' memes · ' + stables + ' stables)';
      const catColors = { memecoin: '#3da6ff', bluechip: '#5b8def', stablecoin: '#0d90ff', native: '#9945ff' };
      tbodyEl.innerHTML = sol.rows.length > 0
        ? sol.rows.map(r => {
            const catColor = catColors[r.category] || '#888';
            const shortMint = r.mint_address ? r.mint_address.slice(0, 8) + '…' + r.mint_address.slice(-4) : '—';
            const auditedShort = r.audited_at ? String(r.audited_at).slice(0, 10) : '—';
            const solscanUrl = r.mint_address ? 'https://solscan.io/token/' + r.mint_address : '#';
            const toggleBtn = '<button onclick="toggleSolAllowlistRow(\\\'' + esc(r.id) + '\\\')" style="padding:2px 10px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid ' +
              (r.enabled ? 'rgba(13,144,255,0.5)' : 'rgba(245,166,35,0.5)') + ';background:' +
              (r.enabled ? 'rgba(13,144,255,0.15)' : 'rgba(245,166,35,0.15)') + ';color:' +
              (r.enabled ? '#0d90ff' : '#f5a623') + ';cursor:pointer;">' +
              (r.enabled ? 'ON' : 'OFF') + '</button>';
            return '<tr style="' + (r.enabled ? '' : 'opacity:0.5;') + '">' +
              '<td style="font-weight:700;color:' + catColor + ';">' + esc(r.symbol) + '</td>' +
              '<td style="color:#aaa;">' + esc(r.display_name || '') + '</td>' +
              '<td style="color:' + catColor + ';font-size:10px;text-transform:uppercase;letter-spacing:1px;">' + esc(r.category) + '</td>' +
              '<td style="font-family:monospace;font-size:10px;color:#666;" title="' + esc(r.mint_address) + '">' +
                '<a href="' + solscanUrl + '" target="_blank" style="color:#666;text-decoration:none;" title="View on Solscan">' + esc(shortMint) + ' ↗</a>' +
              '</td>' +
              '<td style="color:#888;">' + r.decimals + '</td>' +
              '<td style="color:#666;font-size:10px;" title="' + esc(r.audit_notes || '') + '">' + esc(auditedShort) + '</td>' +
              '<td>' + toggleBtn + '</td></tr>';
          }).join('')
        : '<tr><td colspan="7" style="color:#555;text-align:center;padding:12px;">No Solana allowlist entries yet. Use "+ Add SPL Token".</td></tr>';
    }
  } catch (err) { console.error('Solana allowlist load error:', err); }
}

// ── ERC-20 ALLOWLIST ADMIN HANDLERS ───────────────────────────────
async function toggleAllowlistRow(id) {
  try {
    const res = await fetch('/admin/api/erc20-allowlist/' + encodeURIComponent(id) + '/toggle?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.ok) {
      // Re-render the main grid (which includes allowlist at the bottom)
      loadSubProcessGrid();
    } else {
      alert('Toggle failed: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    alert('Toggle error: ' + err.message);
  }
}

function toggleAllowlistAddForm() {
  const form = document.getElementById('allowlist-add-form');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// Session 26.GoPlus token audit. Reads chainId + contract address from
// the allowlist add form and renders the verdict + reasons + tax + key flags.
async function runTokenAudit() {
  const chainId = document.getElementById('al-chainId').value;
  const address = document.getElementById('al-contract').value.trim();
  const resultEl = document.getElementById('al-audit-result');
  if (!resultEl) return;
  if (!chainId || !address) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<span style="color:#f5a623;">Fill chainId + contract address first.</span>';
    return;
  }
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<span style="color:#888;">Running audit via GoPlus… ~1-2s</span>';
  try {
    const audit = await api('/admin/api/audit-token?chainId=' + encodeURIComponent(chainId) + '&address=' + encodeURIComponent(address));
    const verdictColor = audit.verdict === 'safe' ? '#0d90ff'
      : audit.verdict === 'caution' ? '#f5a623'
      : audit.verdict === 'high_risk' ? '#ff6b6b'
      : '#888';
    const verdictEmoji = audit.verdict === 'safe' ? '✅'
      : audit.verdict === 'caution' ? '⚠️'
      : audit.verdict === 'high_risk' ? '❌'
      : '❓';
    const flagChip = (label, val, bad) => {
      if (val === null || val === undefined) return '';
      const isBad = (bad === 'true' && val === true) || (bad === 'false' && val === false);
      const color = isBad ? '#ff6b6b' : '#0d90ff';
      return '<span style="display:inline-block; padding:2px 6px; margin:2px; background:rgba(10,10,20,0.5); border:1px solid ' + color + '33; border-radius:4px; font-size:10px; color:' + color + ';">' + label + ': ' + String(val) + '</span>';
    };
    const taxChip = (label, tax) => {
      if (tax === null || tax === undefined) return '';
      const n = parseFloat(tax);
      const pct = Number.isFinite(n) ? (n * 100).toFixed(2) + '%' : tax;
      const color = n > 0.05 ? '#ff6b6b' : n > 0 ? '#f5a623' : '#0d90ff';
      return '<span style="display:inline-block; padding:2px 6px; margin:2px; background:rgba(10,10,20,0.5); border:1px solid ' + color + '33; border-radius:4px; font-size:10px; color:' + color + ';">' + label + ': ' + pct + '</span>';
    };
    resultEl.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        '<div><span style="color:' + verdictColor + '; font-weight:700; font-size:12px;">' + verdictEmoji + ' ' + String(audit.verdict).toUpperCase() + '</span>' +
        (audit.token_symbol ? ' · <span style="color:#e8e8e8;">' + esc(audit.token_symbol) + (audit.token_name ? ' (' + esc(audit.token_name) + ')' : '') + '</span>' : '') +
        '</div>' +
        '<div style="font-size:9px; color:#666;">GoPlus · chain ' + audit.chain_id + '</div>' +
      '</div>' +
      (audit.verdict_reasons && audit.verdict_reasons.length > 0
        ? '<ul style="margin:4px 0; padding-left:16px; color:#f5a623; font-size:10px;">' + audit.verdict_reasons.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>'
        : '') +
      '<div style="margin-top:4px;">' +
        flagChip('honeypot', audit.is_honeypot, 'true') +
        flagChip('proxy', audit.is_proxy, 'true') +
        flagChip('mintable', audit.is_mintable, 'true') +
        flagChip('hidden_owner', audit.hidden_owner, 'true') +
        flagChip('pausable', audit.transfer_pausable, 'true') +
        flagChip('open_source', audit.is_open_source, 'false') +
        flagChip('in_dex', audit.is_in_dex, 'false') +
        taxChip('buy_tax', audit.buy_tax) +
        taxChip('sell_tax', audit.sell_tax) +
        (audit.holder_count ? '<span style="display:inline-block; padding:2px 6px; margin:2px; background:rgba(10,10,20,0.5); border:1px solid rgba(255,255,255,0.1); border-radius:4px; font-size:10px; color:#aaa;">holders: ' + audit.holder_count.toLocaleString() + '</span>' : '') +
      '</div>';
  } catch (err) {
    resultEl.innerHTML = '<span style="color:#ff6b6b;">Audit failed: ' + esc(err.message || String(err)) + '</span>';
  }
}

// ── SOLANA ALLOWLIST ADMIN HANDLERS (S30 Phase 2.5) ───────────────
async function toggleSolAllowlistRow(id) {
  try {
    const res = await fetch('/admin/api/solana-allowlist/' + encodeURIComponent(id) + '/toggle?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.ok) {
      loadSubProcessGrid();
    } else {
      alert('Toggle failed: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    alert('Toggle error: ' + err.message);
  }
}

function toggleSolAllowlistAddForm() {
  const form = document.getElementById('sol-allowlist-add-form');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitSolAllowlistAdd() {
  const symbol = document.getElementById('sol-symbol').value.trim();
  const displayName = document.getElementById('sol-name').value.trim();
  const mintAddress = document.getElementById('sol-mint').value.trim();
  const decimals = document.getElementById('sol-decimals').value;
  const category = document.getElementById('sol-category').value;
  const auditNotes = document.getElementById('sol-notes').value.trim();

  if (!symbol || !mintAddress || decimals === '' || decimals === null) {
    alert('Required: symbol, mintAddress, decimals');
    return;
  }
  // Base58 mint shape check (32-44 chars, no I/O/0/l ambiguity)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintAddress)) {
    alert('Mint address must be base58 (32-44 chars, no 0/O/I/l)');
    return;
  }
  if (category === 'memecoin' && !auditNotes) {
    if (!confirm('No audit notes for a memecoin.breaks the Allowlist Policy. Continue anyway?')) return;
  }

  try {
    const res = await fetch('/admin/api/solana-allowlist?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        displayName,
        mintAddress,
        decimals: Number(decimals),
        category,
        auditNotes,
        enabled: true
      })
    });
    const data = await res.json();
    if (data.ok) {
      ['sol-symbol','sol-name','sol-mint','sol-decimals','sol-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      toggleSolAllowlistAddForm();
      loadSubProcessGrid();
    } else {
      alert('Add failed: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    alert('Add error: ' + err.message);
  }
}

async function submitAllowlistAdd() {
  const chainId = document.getElementById('al-chainId').value;
  const symbol = document.getElementById('al-symbol').value.trim();
  const displayName = document.getElementById('al-name').value.trim();
  const contractAddress = document.getElementById('al-contract').value.trim();
  const decimals = document.getElementById('al-decimals').value;
  const category = document.getElementById('al-category').value;
  const auditNotes = document.getElementById('al-notes').value.trim();

  if (!chainId || !symbol || !contractAddress || !decimals) {
    alert('Required: chainId, symbol, contractAddress, decimals');
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    alert('Contract address must be 0x + 40 hex chars');
    return;
  }
  if (category === 'memecoin' && !auditNotes) {
    if (!confirm('No audit notes for a memecoin.this breaks the Memecoin Allowlist Policy. Continue anyway?')) return;
  }

  try {
    const res = await fetch('/admin/api/erc20-allowlist?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: Number(chainId),
        symbol,
        displayName,
        contractAddress,
        decimals: Number(decimals),
        category,
        auditNotes,
        enabled: true
      })
    });
    const data = await res.json();
    if (data.ok) {
      // Clear form + collapse
      ['al-chainId','al-symbol','al-name','al-contract','al-decimals','al-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      toggleAllowlistAddForm();
      loadSubProcessGrid();
    } else {
      alert('Add failed: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    alert('Add error: ' + err.message);
  }
}

// ── EXECUTION LAYER FUNCTIONS ──────────────────────────────────────
const CHAIN_NAMES = {0:'Solana',1:'Ethereum',8453:'Base',42161:'Arbitrum',10:'Optimism',137:'Polygon',43114:'Avalanche',56:'BSC',324:'zkSync',534352:'Scroll',59144:'Linea',146:'Sonic',130:'Unichain',480:'World Chain',999:'HyperEVM',42220:'Celo',100:'Gnosis',57073:'Ink',81224:'Codex',143:'Monad',50:'XDC',98866:'Plume',1329:'Sei'};
function chainName(id) { return CHAIN_NAMES[id] || ('Chain ' + id); }
function txLink(hash, sourceChain) {
  if (!hash) return '—';
  var explorer = 'https://basescan.org/tx/';
  if (sourceChain == 0) explorer = 'https://solscan.io/tx/';
  else if (sourceChain == 1) explorer = 'https://etherscan.io/tx/';
  else if (sourceChain == 42161) explorer = 'https://arbiscan.io/tx/';
  else if (sourceChain == 10) explorer = 'https://optimistic.etherscan.io/tx/';
  else if (sourceChain == 137) explorer = 'https://polygonscan.com/tx/';
  else if (sourceChain == 56) explorer = 'https://bscscan.com/tx/';
  else if (sourceChain == 999) explorer = 'https://hyperscan.xyz/tx/';
  else if (sourceChain == 324) explorer = 'https://explorer.zksync.io/tx/';
  else if (sourceChain == 534352) explorer = 'https://scrollscan.com/tx/';
  else if (sourceChain == 42220) explorer = 'https://celoscan.io/tx/';
  else if (sourceChain == 100) explorer = 'https://gnosisscan.io/tx/';
  else if (sourceChain == 43114) explorer = 'https://snowtrace.io/tx/';
  return '<a href="' + explorer + hash + '" target="_blank" style="color:#00bcd4;text-decoration:none;" title="' + hash + '">' + hash.slice(0,10) + '...</a>';
}

async function loadExecutionLayer() {
  try {
    const data = await api('/admin/api/execution-layer');

    // Summary stats
    const txs = data.transactions || [];
    const chainVol = data.chain_volume || [];
    document.getElementById('ex-total-txs').textContent = txs.length;
    const feeSummary = data.fee_summary || { totalVolume: 0, totalFees: 0 };
    document.getElementById('ex-total-vol').textContent = '$' + feeSummary.totalVolume.toLocaleString('en-US', {maximumFractionDigits: 2});
    document.getElementById('ex-total-fees').textContent = '$' + feeSummary.totalFees.toLocaleString('en-US', {maximumFractionDigits: 4});
    document.getElementById('ex-chains').textContent = chainVol.length;

    // All Transactions table
    document.getElementById('exec-txs-body').innerHTML = txs.length > 0
      ? txs.map(t => {
        var ts = t.timestamp;
        if (ts && typeof ts === 'string' && !isNaN(Number(ts))) ts = Number(ts);
        if (ts && typeof ts === 'number' && ts > 1e12) ts = new Date(ts);
        else if (ts && typeof ts === 'number' && ts > 0) ts = new Date(ts * 1000);
        var errorInfo = '';
        if (t.status === 'failed' && (t.error_reason || t.error_detail)) {
          var reason = esc(t.error_reason || t.error_detail || '').slice(0, 120);
          errorInfo = '<div style="color:#ff6b6b;font-size:9px;margin-top:2px;max-width:200px;word-break:break-all;" title="' + esc(t.error_reason || t.error_detail || '') + '">⚠️ ' + reason + '</div>';
        }
        var statusCell = badge(t.status || 'success') + errorInfo;
        return '<tr><td>' + fmtTime(ts || t.created_at) + '</td><td>' + esc(t.email || t.user_id?.slice(0,8)) +
        '</td><td>' + esc(t.route || '—') + '</td><td style="color:#0d90ff;font-weight:bold;">' + esc(t.token || 'USDC') +
        '</td><td>$' + parseFloat(t.amount || 0).toFixed(2) + '</td><td style="color:#f5a623;">$' + parseFloat(t.fee || 0).toFixed(4) +
        '</td><td>$' + parseFloat(t.forwarded || 0).toFixed(2) + '</td><td>' + chainName(t.source_chain) +
        ' → ' + chainName(t.dest_chain) + '</td><td>' + statusCell + '</td><td>' + txLink(t.tx_hash, t.source_chain) + '</td></tr>';
      }).join('')
      : '<tr><td colspan="10" style="color:#555;">No on-chain transactions yet</td></tr>';

    // Chain breakdown
    const maxVol = Math.max(...chainVol.map(c => parseFloat(c.total_volume || 0)), 1);
    document.getElementById('exec-chain-bars').innerHTML = chainVol.length > 0
      ? chainVol.map(c => {
        const vol = parseFloat(c.total_volume || 0);
        const pct = (vol / maxVol * 100).toFixed(0);
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a2a;">' +
          '<span style="color:#aaa;min-width:90px;">' + chainName(c.source_chain) + '</span>' +
          '<div style="flex:1;height:16px;background:#1a1a2a;border-radius:4px;overflow:hidden;">' +
          '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#00bcd4,#0d90ff);border-radius:4px;"></div></div>' +
          '<span style="color:#00bcd4;font-weight:bold;min-width:80px;text-align:right;">$' + vol.toLocaleString('en-US',{maximumFractionDigits:2}) + '</span></div>';
      }).join('')
      : '<div style="color:#555;">No chain data yet</div>';

    document.getElementById('exec-chain-counts').innerHTML = chainVol.length > 0
      ? chainVol.map(c =>
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a1a2a;">' +
        '<span style="color:#aaa;">' + chainName(c.source_chain) + '</span>' +
        '<span style="color:#5b8def;font-weight:bold;">' + c.tx_count + ' txs</span>' +
        '<span style="color:#f5a623;">$' + parseFloat(c.total_fees || 0).toFixed(4) + ' fees</span></div>'
      ).join('')
      : '<div style="color:#555;">No chain data yet</div>';

    // On-chain log (entries with tx hashes)
    const onchain = data.recent_onchain || [];
    document.getElementById('exec-onchain-body').innerHTML = onchain.length > 0
      ? onchain.map(r =>
        '<tr><td>' + fmtTime(r.created_at) + '</td><td>' + esc(r.entity_type) + '</td><td>' + esc(r.action) +
        '</td><td>' + badge(r.status) + '</td><td title="' + esc(r.detail) + '">' + linkifyTxUuids(r.detail?.slice(0,60) || '') +
        '</td><td>' + txLink(r.tx_hash) + '</td></tr>'
      ).join('')
      : '<tr><td colspan="6" style="color:#555;">No on-chain log entries yet</td></tr>';

    // Withdrawals
    const wds = data.withdrawals || [];
    document.getElementById('exec-withdrawals-body').innerHTML = wds.length > 0
      ? wds.map(r =>
        '<tr><td>' + fmtTime(r.created_at) + '</td><td>' + esc(r.email || r.user_id?.slice(0,8)) + '</td><td>' + esc(r.action) +
        '</td><td>' + badge(r.status) + '</td><td title="' + esc(r.detail) + '">' + linkifyTxUuids(r.detail?.slice(0,60) || '') +
        '</td><td>' + txLink(r.tx_hash) + '</td></tr>'
      ).join('')
      : '<tr><td colspan="6" style="color:#555;">No withdrawal records yet</td></tr>';

    // Deposits
    const deps = data.deposits || [];
    document.getElementById('exec-deposits-body').innerHTML = deps.length > 0
      ? deps.map(r =>
        '<tr><td>' + fmtTime(r.created_at) + '</td><td>' + esc(r.email || r.user_id?.slice(0,8)) + '</td><td>' + esc(r.action) +
        '</td><td>' + badge(r.status) + '</td><td title="' + esc(r.detail) + '">' + linkifyTxUuids(r.detail?.slice(0,60) || '') +
        '</td><td>' + txLink(r.tx_hash) + '</td></tr>'
      ).join('')
      : '<tr><td colspan="6" style="color:#555;">No deposit records yet</td></tr>';

  } catch (err) { console.error('Execution Layer load error:', err); }
}

function switchExecTab(name) {
  ['txs','chain-breakdown','onchain','withdrawals','deposits'].forEach(t => {
    const el = document.getElementById('exec-' + t);
    if (el) el.style.display = t === name ? 'block' : 'none';
    const tab = document.getElementById('et-' + t);
    if (tab) tab.classList.toggle('active', t === name);
  });
}

// ── MYTHOS PANEL FUNCTIONS ──────────────────────────────────────────
async function loadMythos() {
  try {
    const [identity, posts, approvals, knowledge, thoughts] = await Promise.allSettled([
      api('/admin/api/mythos/identity'),
      api('/admin/api/mythos/posts'),
      api('/admin/api/mythos/approvals'),
      api('/admin/api/mythos/knowledge'),
      api('/admin/api/mythos/thoughts'),
    ]);

    // Identity stats
    if (identity.status === 'fulfilled') {
      const id = identity.value;
      document.getElementById('m-name').textContent = id.identity?.name || 'Mythos';
      document.getElementById('m-version').textContent = 'v' + (id.identity?.version || '?');
      document.getElementById('m-cycles').textContent = id.cycles_30d || 0;
      document.getElementById('m-total-posts').textContent = id.identity?.stats?.totalPosts || 0;

      // Memory map
      const memMap = document.getElementById('mythos-memory-map');
      if (memMap && id.memory_breakdown) {
        memMap.innerHTML = id.memory_breakdown.map(r =>
          '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1a1a2a;"><span style="color:#aaa;">' +
          esc(r.category) + '</span><span style="color:#e040fb;font-weight:bold;">' + r.c + '</span></div>'
        ).join('');
      }

      // Recent thoughts
      const thoughtsDiv = document.getElementById('mythos-recent-thoughts');
      if (thoughtsDiv && id.recent_thoughts) {
        thoughtsDiv.innerHTML = id.recent_thoughts.map(t =>
          '<div style="padding:6px 0;border-bottom:1px solid #1a1a2a;"><div style="color:#888;font-size:10px;">' +
          fmtTime(t.created_at) + '</div><div style="color:#ccc;margin-top:2px;">' + esc(t.detail?.slice(0,200)) + '</div></div>'
        ).join('') || '<div style="color:#555;">No thoughts recorded yet</div>';
      }
    }

    // Posts feed
    if (posts.status === 'fulfilled') {
      const postsData = posts.value || [];
      document.getElementById('m-total-posts').textContent = postsData.length;
      document.getElementById('mythos-posts-body').innerHTML = postsData.length > 0
        ? postsData.map(p =>
          '<tr><td>' + fmtTime(p.posted_at) + '</td><td><span class="badge ' +
          (p.platform === 'moltbook' ? 'success' : p.platform === 'twitter' ? 'pending' : 'skipped') +
          '">' + esc(p.platform) + '</span></td><td>' + esc(p.content_type) +
          '</td><td title="' + esc(p.content) + '">' + esc(p.content?.slice(0,80)) +
          '</td><td>' + (p.hashtags ? (Array.isArray(p.hashtags) ? p.hashtags : []).map(h => '#' + h).join(' ') : '—') +
          '</td><td>' + (p.post_url ? '<a href="' + p.post_url + '" target="_blank" style="color:#5b8def;">Link</a>' : '—') + '</td></tr>'
        ).join('')
        : '<tr><td colspan="6" style="color:#555;">No posts yet.agent needs platform tokens to publish</td></tr>';
    }

    // Approval queue
    if (approvals.status === 'fulfilled') {
      const appData = approvals.value || [];
      const pendingCount = appData.filter(a => a.status === 'pending').length;
      document.getElementById('m-pending').textContent = pendingCount;
      document.getElementById('mythos-approvals-body').innerHTML = appData.length > 0
        ? appData.map(a => {
          const riskColor = a.riskLevel === 'high' ? 'failed' : a.riskLevel === 'medium' ? 'skipped' : 'success';
          const statusColor = a.status === 'approved' || a.status === 'auto_approved' ? 'success' : a.status === 'rejected' ? 'failed' : a.status === 'pending' ? 'pending' : 'skipped';
          const actionBtns = a.status === 'pending'
            ? '<button onclick="mythosApprove(\\'' + a.id + '\\',\\'approve\\')" style="background:#0d90ff;color:#000;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;margin-right:4px;">Approve</button>' +
              '<button onclick="mythosApprove(\\'' + a.id + '\\',\\'reject\\')" style="background:#ff5252;color:#fff;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;">Reject</button>'
            : '<span style="color:#555;">' + a.status + '</span>';
          return '<tr><td>' + fmtTime(a.createdAt) + '</td><td>' + esc(a.platform) +
            '</td><td><span class="badge ' + riskColor + '">' + (a.riskLevel || '?').toUpperCase() + '</span></td><td>' +
            '<span class="badge ' + statusColor + '">' + a.status + '</span></td><td title="' + esc(a.content) + '">' +
            esc(a.content?.slice(0,60)) + '</td><td>' + actionBtns + '</td></tr>';
        }).join('')
        : '<tr><td colspan="6" style="color:#555;">No posts in approval queue</td></tr>';
    }

    // Knowledge base
    if (knowledge.status === 'fulfilled') {
      const kData = knowledge.value || [];
      document.getElementById('m-knowledge-count').textContent = kData.length;
      document.getElementById('mythos-knowledge-body').innerHTML = kData.length > 0
        ? kData.map(k => {
          const conf = parseFloat(k.confidence || 0);
          const confColor = conf >= 0.7 ? '#0d90ff' : conf >= 0.4 ? '#f5a623' : '#ff5252';
          return '<tr><td><span class="badge pending">' + esc(k.category?.replace('knowledge_','')) + '</span></td><td title="' +
            esc(k.insight) + '">' + esc(k.insight?.slice(0,80)) + '</td><td style="color:' + confColor + ';font-weight:bold;">' +
            (conf * 100).toFixed(0) + '%</td><td title="' + esc(k.evidence) + '">' + esc(k.evidence?.slice(0,50)) +
            '</td><td>' + fmtTime(k._updated) + '</td></tr>';
        }).join('')
        : '<tr><td colspan="5" style="color:#555;">No knowledge entries yet.run a daily cycle first</td></tr>';
    }

    // Thought log
    if (thoughts.status === 'fulfilled') {
      const tData = thoughts.value || [];
      document.getElementById('mythos-thoughts-body').innerHTML = tData.length > 0
        ? tData.map(t =>
          '<tr><td>' + fmtTime(t.created_at) + '</td><td>' + esc(t.action) +
          '</td><td>' + badge(t.status) + '</td><td title="' + esc(t.detail) + '">' + esc(t.detail?.slice(0,80)) + '</td></tr>'
        ).join('')
        : '<tr><td colspan="4" style="color:#555;">No agent activity logged yet</td></tr>';
    }
  } catch (err) { console.error('Mythos panel error:', err); }
}

async function mythosApprove(postId, action) {
  try {
    await fetch('/admin/api/mythos/approvals/' + postId + '?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await loadMythos();
  } catch (err) { console.error('Approval action failed:', err); }
}

function switchMythosTab(name) {
  ['posts','approvals','socials','knowledge','thoughts','memory'].forEach(t => {
    const el = document.getElementById('mythos-' + t);
    if (el) el.style.display = t === name ? 'block' : 'none';
    const tab = document.getElementById('mt-' + t);
    if (tab) tab.classList.toggle('active', t === name);
  });
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tabs > .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  document.getElementById('tab-' + name).style.display = 'block';
  event.target.classList.add('active');
  if (name === 'pending' || name === 'cards') loadPending();
  if (name === 'feeds') loadFeeds();
  if (name === 'dashboard') { loadSubProcessGrid(); loadDepositFunnel(); loadChainHealth(); loadFailedRestart(); loadScheduledIntents(); loadMarketsAdmin(); loadAgentsAdmin(); loadIssuerWebhooksPanel(); }
  if (name === 'execution') loadExecutionLayer();
  if (name === 'mythos') loadMythos();
  if (name === 'heimdall') loadHelm();
  if (name === 'contracts') loadContracts();
}

// ── HELM PANEL (Session 30 H1) ─────────────────────────────────
function switchHelmTab(name) {
  ['rules','status','events','egress','mythos-pov'].forEach(t => {
    const el = document.getElementById('heim-sub-' + t);
    if (el) el.style.display = t === name ? 'block' : 'none';
    const tab = document.getElementById('ht-' + t);
    if (tab) tab.classList.toggle('active', t === name);
  });
  if (name === 'events') { loadHelmEvents(); loadHelmFpRates(); }
  if (name === 'mythos-pov') loadMythosPov();
  if (name === 'status') loadHelmStatus();
}

// S33 Tier 1 #16.load + render the self-test status data.
async function loadHelmStatus() {
  const tbody = document.getElementById('heim-status-tbody');
  const rollup = document.getElementById('heim-status-rollup');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="color:#555;text-align:center;padding:12px;">Loading…</td></tr>';
  try {
    const d = await api('/admin/api/helm/self-test');
    if (!d || !Array.isArray(d.rules)) {
      tbody.innerHTML = '<tr><td colspan="9" style="color:#ff6b6b;text-align:center;padding:12px;">Failed to load status</td></tr>';
      return;
    }
    if (rollup) {
      const armedPct = d.totalRules > 0 ? Math.round((d.armedCount / d.totalRules) * 100) : 0;
      const inTsPct = d.totalRules > 0 ? Math.round((d.enforcedInTsCount / d.totalRules) * 100) : 0;
      rollup.innerHTML =
        '<div style="background:#1a1a30; padding:8px 12px; border-radius:6px; min-width:120px;">' +
          '<div style="color:#888; font-size:9px;">CATALOG</div>' +
          '<div style="color:#e8e8e8; font-size:18px; font-weight:600;">' + d.totalRules + '</div>' +
          '<div style="color:#666; font-size:9px;">' + d.enforcedInTsCount + ' implemented in TS (' + inTsPct + '%)</div>' +
        '</div>' +
        '<div style="background:#1a1a30; padding:8px 12px; border-radius:6px; min-width:120px;">' +
          '<div style="color:#888; font-size:9px;">ARMED</div>' +
          '<div style="color:#0d90ff; font-size:18px; font-weight:600;">' + d.armedCount + ' / ' + d.totalRules + '</div>' +
          '<div style="color:#666; font-size:9px;">' + armedPct + '% live</div>' +
        '</div>' +
        '<div style="background:#1a1a30; padding:8px 12px; border-radius:6px; min-width:120px;">' +
          '<div style="color:#888; font-size:9px;">ENFORCE MODE</div>' +
          '<div style="color:' + (d.enforceCount > 0 ? '#5b8def' : '#888') + '; font-size:18px; font-weight:600;">' + d.enforceCount + '</div>' +
          '<div style="color:#666; font-size:9px;">' + (d.enforceCount === 0 ? 'all observe-mode' : d.enforceCount + ' rules blocking') + '</div>' +
        '</div>' +
        '<div style="background:#1a1a30; padding:8px 12px; border-radius:6px; min-width:120px;">' +
          '<div style="color:#888; font-size:9px;">ACTIVE 24H</div>' +
          '<div style="color:' + (d.active24hCount > 0 ? '#f5a623' : '#0d90ff') + '; font-size:18px; font-weight:600;">' + d.active24hCount + '</div>' +
          '<div style="color:#666; font-size:9px;">rules with events today</div>' +
        '</div>' +
        '<div style="background:#1a1a30; padding:8px 12px; border-radius:6px; min-width:120px; cursor:pointer;" onclick="loadHelmStatus()" title="Refresh">' +
          '<div style="color:#888; font-size:9px;">⟳ REFRESH</div>' +
          '<div style="color:#666; font-size:10px; margin-top:2px;">' + new Date(d.generatedAt).toLocaleTimeString() + '</div>' +
        '</div>';
    }
    const sevColor = (s) => s === 'critical' ? '#ff6b6b' : s === 'high' ? '#f5a623' : s === 'medium' ? '#5b8def' : '#888';
    const armedBadge = (a) => {
      if (a === 'yes')     return '<span style="color:#0d90ff;">●</span> yes';
      if (a === 'no')      return '<span style="color:#ff6b6b;">●</span> no';
      return '<span style="color:#666;">○</span> —';
    };
    const modeBadge = (m) => {
      if (m === 'enforce') return '<span style="color:#5b8def; font-weight:600;">ENFORCE</span>';
      if (m === 'observe') return '<span style="color:#888;">observe</span>';
      if (m === 'live')    return '<span style="color:#0d90ff;">live</span>';
      return '<span style="color:#444;">—</span>';
    };
    const fmtTime = (ts) => {
      if (!ts) return '<span style="color:#444;">never</span>';
      const dt = new Date(ts);
      const ms = Date.now() - dt.getTime();
      const m = Math.floor(ms / 60_000);
      if (m < 1)    return 'just now';
      if (m < 60)   return m + 'm ago';
      if (m < 1440) return Math.floor(m / 60) + 'h ago';
      return Math.floor(m / 1440) + 'd ago';
    };
    tbody.innerHTML = d.rules.map((r) =>
      '<tr style="border-bottom:1px solid #1a1a30;">' +
      '<td style="font-family:monospace; font-size:10px; padding:4px;">' + r.id + '</td>' +
      '<td style="color:#888; font-size:10px; padding:4px;">' + r.category + '</td>' +
      '<td style="color:' + sevColor(r.severity) + '; font-size:10px; padding:4px;">' + r.severity + '</td>' +
      '<td style="color:#888; font-size:10px; padding:4px;">' + r.action + '</td>' +
      '<td style="text-align:center; padding:4px;">' + armedBadge(r.armed) + '</td>' +
      '<td style="text-align:center; padding:4px;">' + modeBadge(r.mode) + '</td>' +
      '<td style="text-align:right; color:' + (r.count24h > 0 ? '#f5a623' : '#444') + '; padding:4px;">' + r.count24h + '</td>' +
      '<td style="text-align:right; color:#888; padding:4px;">' + r.countTotal + '</td>' +
      '<td style="font-size:10px; color:#666; padding:4px;">' + fmtTime(r.lastFired) + '</td>' +
      '</tr>'
    ).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" style="color:#ff6b6b;text-align:center;padding:12px;">Error: ' + (e?.message || 'unknown') + '</td></tr>';
  }
}

async function loadMythosPov() {
  try {
    const d = await api('/admin/api/mythos/pov?agentId=mythos');
    if (!d) return;

    // Reputation summary cards
    const rep = d.reputation;
    if (rep) {
      const tierColors = { novice:'#888', trusted:'#0d90ff', expert:'#5b8def', penalized:'#ff6b6b' };
      const tierEl = document.getElementById('m-pov-tier');
      if (tierEl) {
        tierEl.textContent = (rep.tier || '—').toUpperCase();
        tierEl.style.color = tierColors[rep.tier] || '#888';
      }
      document.getElementById('m-pov-mult').textContent = '×' + (Number(rep.riskLimitMultiplier) || 1).toFixed(2);
      document.getElementById('m-pov-pred-total').textContent = String(rep.predictionsCountTotal || 0);
      document.getElementById('m-pov-avg-score').textContent = (Number(rep.scoreAvgTotal) || 0).toFixed(2);
    } else {
      document.getElementById('m-pov-tier').textContent = 'NOVICE';
      document.getElementById('m-pov-mult').textContent = '×1.00';
      document.getElementById('m-pov-pred-total').textContent = '0';
      document.getElementById('m-pov-avg-score').textContent = '—';
    }

    // Budget summary
    const weekly = (d.budgets || []).find(b => b.period === 'weekly');
    if (weekly) {
      document.getElementById('m-pov-budget').textContent = '$' + (Number(weekly.usdAuthority) || 0).toFixed(0);
      const remaining = Number(weekly.usdRemaining) || 0;
      const remainingPct = weekly.usdAuthority > 0 ? (remaining / weekly.usdAuthority) * 100 : 0;
      const remEl = document.getElementById('m-pov-budget-remaining');
      remEl.textContent = '$' + remaining.toFixed(0) + ' (' + remainingPct.toFixed(0) + '%)';
      remEl.style.color = remainingPct < 5 ? '#ff6b6b' : remainingPct < 20 ? '#f5a623' : '#0d90ff';
    } else {
      document.getElementById('m-pov-budget').textContent = '— no budget set';
      document.getElementById('m-pov-budget-remaining').textContent = '—';
    }

    // Reputation arc.inline SVG sparkline. Fixed-axis [-1, +1] so the
    // arc is directly comparable across agents (Mythos, Huginn, future
    // Muninn). Out-of-band scores are clamped to the bounds with a
    // visible note rather than rescaling the axis.
    const arcEl = document.getElementById('m-pov-arc');
    const hist = d.reputationHistory || [];
    if (arcEl && hist.length >= 2) {
      const w = 800, h = 120, pad = 20;
      const rawScores = hist.map(p => Number(p.scoreAvgTotal) || 0);
      const clamped = rawScores.map(s => Math.max(-1, Math.min(1, s)));
      const outOfBand = rawScores.some(s => s > 1 || s < -1);
      const min = -1, max = 1, range = 2;
      const stepX = (w - 2 * pad) / (hist.length - 1);
      const points = clamped.map((s, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((s - min) / range) * (h - 2 * pad);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      const path = 'M' + points.join(' L');
      // Reference lines at -1, 0, +1 (top/zero/bottom of the fixed axis).
      const zeroY = h - pad - ((0 - min) / range) * (h - 2 * pad);
      const topY = pad;
      const botY = h - pad;
      const cur = rawScores[rawScores.length - 1] || 0;
      arcEl.innerHTML =
        '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%; height:auto; max-height:160px;">' +
        '<line x1="' + pad + '" y1="' + topY + '" x2="' + (w-pad) + '" y2="' + topY + '" stroke="#0d90ff" stroke-dasharray="2,4" stroke-width="0.6" opacity="0.4"/>' +
        '<line x1="' + pad + '" y1="' + zeroY.toFixed(1) + '" x2="' + (w-pad) + '" y2="' + zeroY.toFixed(1) + '" stroke="#666" stroke-dasharray="4,3" stroke-width="1"/>' +
        '<line x1="' + pad + '" y1="' + botY + '" x2="' + (w-pad) + '" y2="' + botY + '" stroke="#ff6b6b" stroke-dasharray="2,4" stroke-width="0.6" opacity="0.4"/>' +
        '<text x="' + (pad - 4) + '" y="' + (topY + 4) + '" fill="#0d90ff" font-size="9" text-anchor="end" opacity="0.7">+1</text>' +
        '<text x="' + (pad - 4) + '" y="' + (zeroY + 3).toFixed(1) + '" fill="#888" font-size="9" text-anchor="end">0</text>' +
        '<text x="' + (pad - 4) + '" y="' + (botY + 3) + '" fill="#ff6b6b" font-size="9" text-anchor="end" opacity="0.7">-1</text>' +
        '<path d="' + path + '" stroke="#c05aff" stroke-width="2" fill="none" stroke-linejoin="round"/>' +
        '</svg>' +
        '<div style="margin-top:6px; color:#666; font-size:10px; text-align:center;">' +
        hist.length + ' snapshots · axis [-1, +1] · current ' + cur.toFixed(2) +
        (outOfBand ? ' · <span style="color:#f5a623;">⚠ out-of-band score(s) clamped</span>' : '') +
        '</div>';
    } else if (arcEl) {
      arcEl.innerHTML = '<div style="color:#666; padding:20px; text-align:center;">No history yet.reputation cron will populate after first cycle (every 6h).</div>';
    }

    // Counsel rows
    const counselTbody = document.getElementById('m-pov-counsel-tbody');
    const counsels = d.recentCounsel || [];
    if (counselTbody) {
      if (counsels.length === 0) {
        counselTbody.innerHTML = '<tr><td colspan="4" style="color:#555;text-align:center;padding:12px;">No counsel events yet.Huginn will surface them as Mythos proposes high-stakes actions.</td></tr>';
      } else {
        const verdictColors = { endorse:'#0d90ff', caution:'#f5a623', dissent:'#ff6b6b', 'block-recommend':'#ff4040' };
        counselTbody.innerHTML = counsels.map(c => {
          const ctx = c.context || {};
          const verdict = ctx.verdict || '?';
          const conf = typeof ctx.confidence === 'number' ? ctx.confidence : 0;
          const time = new Date(c.occurredAt).toLocaleString();
          return '<tr>' +
            '<td style="color:#888;">' + esc(time) + '</td>' +
            '<td><span style="padding:2px 8px; border-radius:6px; background:rgba(0,0,0,0.4); color:' + (verdictColors[verdict] || '#888') + '; font-weight:700; text-transform:uppercase;">' + esc(verdict) + '</span></td>' +
            '<td style="color:#ddd;">' + esc((c.subject || '').slice(0, 80)) + '</td>' +
            '<td style="text-align:right; color:#888;">' + (conf * 100).toFixed(0) + '%</td>' +
          '</tr>';
        }).join('');
      }
    }

    // Predictions
    const predTbody = document.getElementById('m-pov-preds-tbody');
    const preds = d.recentPredictions || [];
    if (predTbody) {
      if (preds.length === 0) {
        predTbody.innerHTML = '<tr><td colspan="6" style="color:#555;text-align:center;padding:12px;">No predictions recorded yet.</td></tr>';
      } else {
        predTbody.innerHTML = preds.map(p => {
          const time = new Date(p.predictedAt).toLocaleString();
          let status = '<span style="color:#888;">pending</span>';
          if (p.outcomeObservedAt) {
            const score = p.score != null ? Number(p.score) : null;
            const color = p.correct ? '#0d90ff' : '#ff6b6b';
            const label = p.correct ? '✓' : '✗';
            status = '<span style="color:' + color + ';">' + label + ' ' + (score != null ? score.toFixed(2) : '') + '</span>';
          }
          return '<tr>' +
            '<td style="color:#888;">' + esc(time) + '</td>' +
            '<td style="color:#ddd; font-family:monospace;">' + esc(p.type) + '</td>' +
            '<td style="color:#aaa;">' + esc((p.subject || '').slice(0, 60)) + '</td>' +
            '<td style="text-align:right; color:#888;">' + (Number(p.confidence) * 100).toFixed(0) + '%</td>' +
            '<td style="text-align:right; color:#888;">' + p.horizonDays + 'd</td>' +
            '<td style="text-align:center;">' + status + '</td>' +
          '</tr>';
        }).join('');
      }
    }

    // Ledger
    const ledgerTbody = document.getElementById('m-pov-ledger-tbody');
    const ledger = d.recentLedger || [];
    if (ledgerTbody) {
      if (ledger.length === 0) {
        ledgerTbody.innerHTML = '<tr><td colspan="4" style="color:#555;text-align:center;padding:12px;">No ledger entries yet.spends will record as Mythos uses budget.</td></tr>';
      } else {
        ledgerTbody.innerHTML = ledger.map(l => {
          const time = new Date(l.occurredAt).toLocaleString();
          const delta = Number(l.delta) || 0;
          const color = delta < 0 ? '#ff6b6b' : '#0d90ff';
          const sign = delta >= 0 ? '+' : '';
          return '<tr>' +
            '<td style="color:#888;">' + esc(time) + '</td>' +
            '<td style="color:#ddd; font-family:monospace;">' + esc(l.action) + '</td>' +
            '<td style="text-align:right; color:' + color + ';">' + sign + delta.toFixed(2) + ' ' + esc(l.currency) + '</td>' +
            '<td style="color:#aaa;">' + esc((l.description || '').slice(0, 80)) + '</td>' +
          '</tr>';
        }).join('');
      }
    }

    // x402 calls (S33.Programmatic Agent Treasury)
    const x402Tbody = document.getElementById('m-pov-x402-tbody');
    const x402Calls = d.x402Calls || [];
    // Resolve agent address inline (cheap; piggybacks off existing admin auth)
    try {
      const key = encodeURIComponent(new URLSearchParams(location.search).get('key') || '');
      const ar = await fetch('/api/x402/agent-address?agentId=' + encodeURIComponent(d.agentId || 'mythos') + '&adminKey=' + key);
      if (ar.ok) {
        const ad = await ar.json();
        const addrEl = document.getElementById('m-pov-x402-addr');
        if (addrEl && ad.address) {
          addrEl.textContent = ad.address;
          addrEl.title = 'Fund this address with USDC on Base to enable agent x402 payments';
        }
      }
    } catch { /* ignore.non-blocking */ }
    if (x402Tbody) {
      if (x402Calls.length === 0) {
        x402Tbody.innerHTML = '<tr><td colspan="6" style="color:#555;text-align:center;padding:12px;">No x402 calls yet.Phase 1 awaits funded agent vault. Use POST /api/x402/test-payment to drive a test.</td></tr>';
      } else {
        const verdictColors = { endorse:'#0d90ff', caution:'#f5a623', dissent:'#ff6b6b', 'block-recommend':'#ff4040' };
        x402Tbody.innerHTML = x402Calls.map(c => {
          const time = new Date(c.occurredAt).toLocaleString();
          const statusColor = c.status === 'success' ? '#0d90ff' : c.status === 'no_payment' ? '#888' : '#ff6b6b';
          const verdictColor = verdictColors[c.counselVerdict] || '#666';
          const cost = c.amountDebitedUsd > 0 ? '$' + c.amountDebitedUsd.toFixed(4) : '—';
          const txCell = c.txHash
            ? '<a href="https://basescan.org/tx/' + esc(c.txHash) + '" target="_blank" rel="noopener noreferrer" style="color:#0d90ff; font-family:monospace; font-size:10px;">' + esc(c.txHash.slice(0, 10)) + '…</a>'
            : '<span style="color:#555;">—</span>';
          const sandboxBadge = c.sandboxed ? ' <span style="background:rgba(13,144,255,0.15); color:#0d90ff; padding:1px 5px; border-radius:4px; font-size:9px;">SBX</span>' : '';
          return '<tr>' +
            '<td style="color:#888; font-size:10px;">' + esc(time) + '</td>' +
            '<td><span style="color:' + statusColor + '; font-weight:700;">' + esc(c.status) + '</span>' + sandboxBadge + '</td>' +
            '<td style="color:#ddd; font-family:monospace; font-size:10px;">' + esc(c.hostname || c.url || '—') + '</td>' +
            '<td style="text-align:right; color:#0d90ff; font-variant-numeric:tabular-nums;">' + cost + '</td>' +
            '<td><span style="color:' + verdictColor + '; font-size:10px; text-transform:uppercase;">' + esc(c.counselVerdict || '—') + '</span></td>' +
            '<td>' + txCell + '</td>' +
          '</tr>';
        }).join('');
      }
    }
  } catch (err) { console.error('Mythos POV load error:', err); }
}

// ── PUBLIC CONTRACTS PANEL (S35 Marathon 11) ─────────────────────────────────
//
// Mirrors the public /contracts.html page but inside the admin console with
// optional live-balance fetches. Pulls from /admin/api/contracts which returns
// a static manifest sourced from src/contracts-manifest.ts (single source of
// truth for the address list).
async function loadContracts() {
  try {
    const d = await api('/admin/api/contracts');
    if (!d) return;
    const fetchedAt = document.getElementById('contracts-fetched-at');
    if (fetchedAt) fetchedAt.textContent = 'Fetched ' + new Date().toLocaleTimeString();

    // ── MyOFTAdapter rows ──
    const adapterTbody = document.getElementById('contracts-oft-adapter-tbody');
    if (adapterTbody) {
      adapterTbody.innerHTML = (d.oftAdapter || []).map(c =>
        '<tr>' +
        '<td style="color:#ddd;font-weight:600;">' + esc(c.chain) + '</td>' +
        '<td style="color:#888;font-family:Menlo,monospace;font-size:10px;">' + esc(c.chainId) + '</td>' +
        '<td style="font-family:Menlo,monospace;color:#3da6ff;font-size:10px;">' + esc(c.address) + '</td>' +
        '<td style="text-align:right;color:#888;font-family:Menlo,monospace;font-size:10px;">' + esc(c.block || '—') + '</td>' +
        '<td><a href="' + esc(c.explorer) + '" target="_blank" style="color:#0d90ff;font-size:10px;">↗ explorer</a></td>' +
        '</tr>'
      ).join('');
    }

    // ── MyOFT rows ──
    const oftTbody = document.getElementById('contracts-oft-token-tbody');
    if (oftTbody) {
      oftTbody.innerHTML = (d.oftToken || []).map(c =>
        '<tr>' +
        '<td style="color:#ddd;font-weight:600;">' + esc(c.chain) + '</td>' +
        '<td style="font-family:Menlo,monospace;color:#3da6ff;font-size:10px;">' + esc(c.address) + '</td>' +
        '<td style="text-align:right;color:#888;font-family:Menlo,monospace;font-size:10px;">' + esc(c.block || '—') + '</td>' +
        '<td><a href="' + esc(c.explorer) + '" target="_blank" style="color:#0d90ff;font-size:10px;">↗ explorer</a></td>' +
        '</tr>'
      ).join('');
    }

    // ── Fee Vaults rows ──
    const feeTbody = document.getElementById('contracts-fee-vaults-tbody');
    if (feeTbody) {
      feeTbody.innerHTML = (d.feeVaults || []).map(c =>
        '<tr>' +
        '<td style="color:#ddd;font-weight:600;">' + esc(c.label) + '</td>' +
        '<td style="color:#aaa;">' + esc(c.chain) + '</td>' +
        '<td style="font-family:Menlo,monospace;color:#3da6ff;font-size:10px;">' + esc(c.address) + '</td>' +
        '<td><a href="' + esc(c.explorer) + '" target="_blank" style="color:#0d90ff;font-size:10px;">↗ explorer</a></td>' +
        '</tr>'
      ).join('');
    }

    // ── x402 + Mythos vault rows ──
    const x402Tbody = document.getElementById('contracts-x402-tbody');
    if (x402Tbody) {
      x402Tbody.innerHTML = (d.x402Vaults || []).map(c =>
        '<tr>' +
        '<td style="color:#ddd;font-weight:600;">' + esc(c.label) + '</td>' +
        '<td style="color:#aaa;">' + esc(c.chain) + '</td>' +
        '<td style="font-family:Menlo,monospace;color:#3da6ff;font-size:10px;">' + esc(c.address) + '</td>' +
        '<td><a href="' + esc(c.explorer) + '" target="_blank" style="color:#0d90ff;font-size:10px;">↗ explorer</a></td>' +
        '</tr>'
      ).join('');
    }
  } catch (err) {
    console.error('loadContracts error:', err);
  }
}

async function loadHelm() {
  try {
    const d = await api('/admin/api/helm');
    if (!d) return;
    // Header stats
    document.getElementById('heim-total-rules').textContent = String(d.rules.length);
    const live = d.rules.filter(r => r.enforcedInTs).length;
    document.getElementById('heim-live-rules').textContent = live + ' of ' + d.rules.length;
    document.getElementById('heim-events-24h').textContent = d.summary.total.toLocaleString();
    document.getElementById('heim-critical-24h').textContent = (d.summary.bySeverity.critical || 0).toLocaleString();
    document.getElementById('heim-egress-mode').textContent = d.env.egressEnforce ? 'ENFORCE' : 'observe';
    document.getElementById('heim-log-scanner').textContent = d.env.logScanEnabled ? 'ARMED' : 'OFF';
    // Operator-bar mirrors of the same state
    const curEl = document.getElementById('heim-egress-current');
    const srcEl = document.getElementById('heim-egress-source');
    if (curEl) {
      curEl.textContent = d.env.egressEnforce ? 'ENFORCE' : 'OBSERVE';
      curEl.style.color = d.env.egressEnforce ? '#ff6b6b' : '#5b8def';
    }
    if (srcEl) srcEl.textContent = '(' + (d.env.egressSource || 'env') + ')';

    // HELM-105 tx-cap operator bar
    const txCurEl = document.getElementById('heim-txcap-current');
    const txCapEl = document.getElementById('heim-txcap-cap');
    const txSrcEl = document.getElementById('heim-txcap-source');
    if (txCurEl) {
      txCurEl.textContent = d.env.txcapEnforce ? 'ENFORCE' : 'OBSERVE';
      txCurEl.style.color = d.env.txcapEnforce ? '#ff6b6b' : '#5b8def';
    }
    if (txCapEl) {
      const cap = Number(d.env.txcapUsd || 0);
      txCapEl.textContent = cap > 0 ? '· cap = $' + cap.toLocaleString() : '';
    }
    if (txSrcEl) {
      const enf = d.env.txcapSource || 'env';
      const cap = d.env.txcapCapSource || 'default';
      txSrcEl.textContent = '(' + enf + ' / cap:' + cap + ')';
    }

    // HELM-201/202/203 fs-guard operator bar
    const fsCurEl = document.getElementById('heim-fsguard-current');
    const fsSrcEl = document.getElementById('heim-fsguard-source');
    if (fsCurEl) {
      fsCurEl.textContent = d.env.fsGuardEnforce ? 'ENFORCE' : 'OBSERVE';
      fsCurEl.style.color = d.env.fsGuardEnforce ? '#ff6b6b' : '#5b8def';
    }
    if (fsSrcEl) fsSrcEl.textContent = '(' + (d.env.fsGuardSource || 'env') + ')';

    // Rule catalog.grouped by category
    const catOrder = ['ingress','egress','integrity','credentials','reasoning','gjallarhorn'];
    const catIcons = { ingress:'🚪', egress:'📤', integrity:'🧠', credentials:'🔑', reasoning:'🌀', gjallarhorn:'📯' };
    const catColors = { ingress:'#5b8def', egress:'#3da6ff', integrity:'#0d90ff', credentials:'#f5a623', reasoning:'#e040fb', gjallarhorn:'#ff6b6b' };
    const sevColors = { critical:'#ff6b6b', high:'#f5a623', medium:'#5b8def', low:'#888' };
    const listEl = document.getElementById('heim-rules-list');
    if (listEl) {
      listEl.innerHTML = catOrder.map(cat => {
        const rules = d.rules.filter(r => r.category === cat);
        if (rules.length === 0) return '';
        const categoryCount = (d.summary.byCategory && d.summary.byCategory[cat]) || 0;
        return '<div class="stat-card" style="margin-bottom:10px;">' +
          '<div style="font-size:13px; font-weight:bold; color:' + catColors[cat] + '; padding-bottom:6px; border-bottom:1px solid #2a2a4a; margin-bottom:8px; display:flex; justify-content:space-between;">' +
            '<span>' + catIcons[cat] + ' ' + cat.toUpperCase() + ' · ' + rules.length + ' rules</span>' +
            '<span style="font-size:10px; color:#888; font-weight:normal;">' + categoryCount + ' events · 24h</span>' +
          '</div>' +
          '<table style="width:100%; font-size:11px;"><tbody>' +
            rules.map(r => {
              const liveBadge = r.enforcedInTs ? '<span style="padding:1px 6px; background:rgba(13,144,255,0.15); color:#0d90ff; border-radius:8px; font-size:9px; font-weight:700; margin-left:6px;">LIVE</span>' : '';
              return '<tr>' +
                '<td style="font-family:monospace; color:#3da6ff; font-weight:700; width:80px;">' + esc(r.id) + '</td>' +
                '<td style="color:' + sevColors[r.severity] + '; font-size:10px; text-transform:uppercase; letter-spacing:1px; width:70px;">' + esc(r.severity) + '</td>' +
                '<td style="color:#888; font-size:10px; width:90px;">' + esc(r.action) + liveBadge + '</td>' +
                '<td style="color:#ddd; padding:3px 0;">' + esc(r.trigger) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody></table>' +
        '</div>';
      }).join('');
    }

    // Egress allowlist
    const egressEl = document.getElementById('heim-egress-list');
    if (egressEl) {
      egressEl.innerHTML = (d.egressAllowlist || []).map(h => '<div>• ' + esc(h) + '</div>').join('');
    }
  } catch (err) { console.error('Helm load error:', err); }
}

async function setHelmEgressMode(mode) {
  if (mode === 'enforce' && !confirm('Flip HELM-101 to ENFORCE? Non-allowlisted outbound HTTP will be hard-blocked. Continue?')) return;
  try {
    const res = await fetch('/admin/api/helm/egress-mode?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (data.ok) {
      loadHelm();
    } else {
      alert('Egress mode change failed: ' + (data.error || 'unknown'));
    }
  } catch (err) {
    alert('Egress mode error: ' + err.message);
  }
}

async function setHelmTxCapMode(mode) {
  if (mode === 'enforce' && !confirm('Flip HELM-105 to ENFORCE? On-chain transactions over the cap will be HARD-BLOCKED before signing. Continue?')) return;
  try {
    const res = await fetch('/admin/api/helm/txcap-mode?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (data.ok) {
      loadHelm();
    } else {
      alert('TxCap mode change failed: ' + (data.error || 'unknown'));
    }
  } catch (err) {
    alert('TxCap mode error: ' + err.message);
  }
}

async function setHelmTxCapPrompt() {
  const input = prompt('Enter HELM-105 tx cap in USD (positive number, or empty to revert to env/default):');
  if (input === null) return; // user cancelled
  let body;
  if (input.trim() === '') {
    body = { capUsd: null };
  } else {
    const n = Number(input);
    if (!isFinite(n) || n <= 0) {
      alert('Cap must be a positive number');
      return;
    }
    body = { capUsd: n };
  }
  try {
    const res = await fetch('/admin/api/helm/txcap-mode?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      loadHelm();
    } else {
      alert('TxCap update failed: ' + (data.error || 'unknown'));
    }
  } catch (err) {
    alert('TxCap update error: ' + err.message);
  }
}

async function setHelmFsGuardMode(mode) {
  if (mode === 'enforce' && !confirm('Flip HELM-201/202/203 to ENFORCE? Writes to Neural Net + .claude/skills/ guarded paths will be HARD-BLOCKED. Continue?')) return;
  try {
    const res = await fetch('/admin/api/helm/fs-guard-mode?key=' + KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (data.ok) {
      loadHelm();
    } else {
      alert('FsGuard mode change failed: ' + (data.error || 'unknown'));
    }
  } catch (err) {
    alert('FsGuard mode error: ' + err.message);
  }
}

async function loadHelmEvents() {
  try {
    const d = await api('/admin/api/helm/events?limit=100');
    const tbody = document.getElementById('heim-events-tbody');
    if (!tbody) return;
    if (!d || !d.events || d.events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#555;text-align:center;padding:12px;">No events yet.Helm is quiet 🌅</td></tr>';
      return;
    }
    const sevColors = { critical:'#ff6b6b', high:'#f5a623', medium:'#5b8def', low:'#888' };
    tbody.innerHTML = d.events.map(e => {
      const time = new Date(e.occurred_at).toLocaleTimeString();
      // FP label state.three modes: null (unlabeled), true (FP), false (TP).
      const fp = e.false_positive;
      let labelCell;
      // S33 emergency fix: \' inside the outer template literal is treated
      // as an unrecognized escape and the backslash is dropped.producing
      // '' (empty single-quote pair) in the rendered HTML, which makes the
      // browser's JS parser see '<button...>('' + esc(...) + '', null)'
      // as three adjacent string literals → SyntaxError → all admin JS
      // halts → stat cards stay empty. \\' produces \' in the output,
      // which is the correctly-escaped single quote inside a JS single-
      // quoted string.
      if (fp === true) {
        labelCell = '<span style="padding:2px 6px;border-radius:4px;background:rgba(245,166,35,0.2);color:#f5a623;font-size:9px;font-weight:700;" title="Marked false-positive by ' + esc(e.fp_marked_by || '?') + '">FP</span>' +
                    ' <button onclick="markEventFp(\\'' + esc(e.id) + '\\', null)" style="margin-left:4px;font-size:9px;padding:1px 4px;background:rgba(255,255,255,0.05);border:1px solid #333;color:#888;border-radius:3px;cursor:pointer;" title="Clear label">×</button>';
      } else if (fp === false) {
        labelCell = '<span style="padding:2px 6px;border-radius:4px;background:rgba(13,144,255,0.15);color:#0d90ff;font-size:9px;font-weight:700;" title="Confirmed true-positive by ' + esc(e.fp_marked_by || '?') + '">TP</span>' +
                    ' <button onclick="markEventFp(\\'' + esc(e.id) + '\\', null)" style="margin-left:4px;font-size:9px;padding:1px 4px;background:rgba(255,255,255,0.05);border:1px solid #333;color:#888;border-radius:3px;cursor:pointer;" title="Clear label">×</button>';
      } else {
        labelCell = '<button onclick="markEventFp(\\'' + esc(e.id) + '\\', true)" style="font-size:9px;padding:1px 5px;background:rgba(245,166,35,0.08);border:1px solid #4a3a1a;color:#f5a623;border-radius:3px;cursor:pointer;" title="Mark as false-positive">FP?</button>' +
                    ' <button onclick="markEventFp(\\'' + esc(e.id) + '\\', false)" style="margin-left:3px;font-size:9px;padding:1px 5px;background:rgba(13,144,255,0.08);border:1px solid #1a4a3a;color:#0d90ff;border-radius:3px;cursor:pointer;" title="Confirm true-positive">TP</button>';
      }
      return '<tr>' +
        '<td style="color:#888; font-size:10px;">' + esc(time) + '</td>' +
        '<td style="font-family:monospace; color:#3da6ff; font-weight:700;">' + esc(e.rule_id) + '</td>' +
        '<td style="color:' + (sevColors[e.severity] || '#888') + '; font-size:10px; text-transform:uppercase;">' + esc(e.severity) + '</td>' +
        '<td style="color:#aaa; font-size:10px;">' + esc(e.action) + '</td>' +
        '<td style="color:#888; font-size:10px;">' + esc(e.agent_id || '—') + '</td>' +
        '<td style="color:#ddd;">' + esc(e.subject || '') + '</td>' +
        '<td style="text-align:center;">' + labelCell + '</td>' +
      '</tr>';
    }).join('');
  } catch (err) { console.error('Helm events load error:', err); }
}

// Toggle false-positive / true-positive / unlabeled on a heimdall event.
// Optimistic UI: re-fetches the events list after the POST settles.
async function markEventFp(eventId, value) {
  try {
    const key = encodeURIComponent(new URLSearchParams(location.search).get('key') || '');
    const res = await fetch('/admin/api/helm/events/' + eventId + '/fp?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, by: 'admin' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('FP mark failed:', err);
      alert('Failed to mark: ' + (err.error || res.status));
      return;
    }
    // Refresh the events table + the FP-rate summary in parallel.
    await Promise.all([loadHelmEvents(), loadHelmFpRates()]);
  } catch (err) {
    console.error('FP mark error:', err);
  }
}

// Per-rule false-positive rate panel. Powers the "is this rule ready to
// enforce?" decision. Renders a compact table of (rule, total events,
// labeled events, FP%, TP count). Operator looks for high-volume rules
// with low FP rates as candidates for enforce-mode flips.
// Format an FP rate (0..1 or null) as a colored percentage cell.
// Color thresholds match the readyToEnforce gate (<5% green, <20% yellow, else red).
function fmtFpRateCell(rate) {
  if (rate === null || rate === undefined) {
    return '<span style="color:#666;">—</span>';
  }
  const pct = (rate * 100).toFixed(1) + '%';
  const color = rate < 0.05 ? '#0d90ff' : rate < 0.20 ? '#f5a623' : '#ff6b6b';
  return '<span style="color:' + color + ';font-weight:700;">' + pct + '</span>';
}

// Render an inline-SVG sparkline of per-day FP rate over the trend window.
// Skips days with no labeled events. Returns a small dash if there's
// nothing meaningful to plot (1 or fewer plottable days).
function renderFpTrendSparkline(trend) {
  if (!trend || trend.length === 0) return '<span style="color:#444;">—</span>';
  const W = 60, H = 16;
  const span = Math.max(1, trend.length - 1);
  const points = [];
  for (let i = 0; i < trend.length; i++) {
    const t = trend[i];
    if (t.fpRate === null || t.fpRate === undefined) continue;
    const x = (i / span) * W;
    const y = H - (Math.min(1, t.fpRate) * H);
    points.push([x, y]);
  }
  if (points.length < 2) return '<span style="color:#666; font-size:9px;" title="Not enough labeled days to plot">·</span>';
  const path = points
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ');
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="vertical-align:middle;" title="30d FP rate trend">' +
         '<path d="' + path + '" fill="none" stroke="#3da6ff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

async function loadHelmFpRates() {
  try {
    const d = await api('/admin/api/helm/fp-rates?days=30');
    const tbody = document.getElementById('heim-fp-rates-tbody');
    const readyBadge = document.getElementById('heim-fp-ready-count');
    if (!tbody) return;
    if (!d || !d.rules || d.rules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="color:#555;text-align:center;padding:12px;">No events labeled yet.start by marking events FP/TP above.</td></tr>';
      if (readyBadge) readyBadge.textContent = '';
      return;
    }
    if (readyBadge) {
      const n = d.readyToEnforceCount || 0;
      readyBadge.textContent = n + ' rule' + (n === 1 ? '' : 's') + ' ready to enforce';
      readyBadge.style.opacity = n > 0 ? '1' : '0.45';
    }
    tbody.innerHTML = d.rules.map(r => {
      const readyTitle = r.readyToEnforce
        ? 'Ready: 30d FP ' + ((r.fpRate || 0) * 100).toFixed(1) + '% on ' + r.labeledEvents + ' labeled, 7d also stable'
        : 'Not ready (need ≥' + (d.thresholds && d.thresholds.minLabeled || 20) + ' labeled @ ≤' + (((d.thresholds && d.thresholds.maxFp) || 0.05) * 100) + '% FP, 30d + 7d both)';
      const readyCell = r.readyToEnforce
        ? '<span title="' + readyTitle + '" style="color:#0d90ff;font-size:14px;">●</span>'
        : '<span title="' + readyTitle + '" style="color:#3a3a55;font-size:14px;">○</span>';
      return '<tr>' +
        '<td style="font-family:monospace;color:#3da6ff;font-weight:700;">' + esc(r.ruleId) + '</td>' +
        '<td style="text-align:right;color:#aaa;">' + r.totalEvents + '</td>' +
        '<td style="text-align:right;color:#aaa;">' + r.labeledEvents + '</td>' +
        '<td style="text-align:right;color:#f5a623;">' + r.fpCount + '</td>' +
        '<td style="text-align:right;">' + fmtFpRateCell(r.fpRate) + '</td>' +
        '<td style="text-align:right;">' + fmtFpRateCell(r.fpRate7d) + '</td>' +
        '<td style="text-align:center;">' + renderFpTrendSparkline(r.trend) + '</td>' +
        '<td style="text-align:center;">' + readyCell + '</td>' +
      '</tr>';
    }).join('');
  } catch (err) { console.error('Helm FP rates load error:', err); }
}

async function refreshAll() {
  // Phase 2 admin.CSS-driven spinner instead of textContent rewrites,
  // so the animation survives re-renders and the label stays stable.
  const btn = document.getElementById('refreshBtn') || document.querySelector('.refresh-btn');
  if (btn) btn.classList.add('refreshing');
  try {
    await Promise.allSettled([loadSummary(), loadLog(), loadPending(), loadFeeds(), loadSubProcessGrid(), loadMythos(), loadDepositFunnel(), loadChainHealth(), loadFailedRestart(), loadScheduledIntents(), loadMarketsAdmin(), loadAgentsAdmin(), loadIssuerWebhooksPanel()]);
    document.getElementById('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Refresh error:', err);
    document.getElementById('lastRefresh').textContent = 'Error.' + new Date().toLocaleTimeString();
  } finally {
    if (btn) btn.classList.remove('refreshing');
  }
}

// Initial load.load every panel in isolation + publish a visible status
// strip showing each loader's state. Session 28.live incident response:
// when a loader fails silently, operator should SEE that without dev-tools.
let activeTab = 'dashboard';
(function bootstrapAdminLoaders() {
  // Inject a diagnostic bar at the top of <body>. Visible, compact, each
  // loader gets a pill: grey (pending) → green (ok) → red (fail).
  const bar = document.createElement('div');
  bar.id = 'admin-boot-status';
  bar.style.cssText = 'position:sticky;top:0;z-index:1000;background:rgba(10,10,20,0.92);backdrop-filter:blur(6px);border-bottom:1px solid rgba(255,255,255,0.05);padding:6px 14px;font:10px/1.2 Menlo,monospace;color:#666;display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
  bar.innerHTML = '<span style="color:#0d90ff;font-weight:700;">BOOT</span>';
  if (document.body) document.body.insertBefore(bar, document.body.firstChild);

  function pill(name, state, detail) {
    var color = state === 'ok' ? '#0d90ff' : state === 'fail' ? '#ff6b6b' : '#888';
    var bg = state === 'ok' ? 'rgba(13,144,255,0.12)' : state === 'fail' ? 'rgba(255,107,107,0.12)' : 'rgba(255,255,255,0.04)';
    var mark = state === 'ok' ? '✓' : state === 'fail' ? '✗' : '•';
    var el = document.getElementById('boot-' + name);
    if (!el) {
      el = document.createElement('span');
      el.id = 'boot-' + name;
      el.style.cssText = 'padding:2px 7px;border-radius:4px;';
      bar.appendChild(el);
    }
    el.style.background = bg;
    el.style.color = color;
    el.textContent = mark + ' ' + name + (detail ? ' (' + detail + ')' : '');
    if (detail) el.title = detail;
  }

  const loaders = [
    ['summary',            loadSummary],
    ['subProcessGrid',     loadSubProcessGrid],
    ['depositFunnel',      loadDepositFunnel],
    ['chainHealth',        loadChainHealth],
    ['failedRestart',      loadFailedRestart],
    ['scheduledIntents',   loadScheduledIntents],
    ['marketsAdmin',       loadMarketsAdmin],
    ['agentsAdmin',        loadAgentsAdmin],
    ['issuerWebhooksPanel',loadIssuerWebhooksPanel],
  ];
  for (const [name, fn] of loaders) pill(name, 'pending');

  for (const [name, fn] of loaders) {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') {
        r.then(function() { pill(name, 'ok'); })
         .catch(function(err) {
           const msg = String((err && err.message) || err || 'error').slice(0, 60);
           pill(name, 'fail', msg);
           console.error('[admin-init] ' + name + ' rejected:', err);
         });
      } else {
        pill(name, 'ok');
      }
    } catch (err) {
      const msg = String((err && err.message) || err || 'sync-throw').slice(0, 60);
      pill(name, 'fail', msg);
      console.error('[admin-init] ' + name + ' threw synchronously:', err);
    }
  }
})();

// Smart refresh: only refresh summary + active tab, not ALL tabs
function smartRefresh() {
  const btn = document.querySelector('.refresh-btn');
  if (btn) { btn.textContent = '↻ ...'; }
  const tasks = [loadSummary()];
  if (activeTab === 'dashboard') tasks.push(loadSubProcessGrid(), loadDepositFunnel(), loadChainHealth(), loadFailedRestart(), loadScheduledIntents(), loadMarketsAdmin(), loadAgentsAdmin(), loadIssuerWebhooksPanel());
  else if (activeTab === 'log') tasks.push(loadLog());
  else if (activeTab === 'pending' || activeTab === 'cards') tasks.push(loadPending());
  else if (activeTab === 'feeds') tasks.push(loadFeeds());
  else if (activeTab === 'execution') tasks.push(loadExecutionLayer());
  else if (activeTab === 'mythos') tasks.push(loadMythos());
  Promise.allSettled(tasks).then(() => {
    document.getElementById('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
    if (btn) { btn.textContent = '↻ Refresh'; }
  });
}

// Refresh every 30s.but only the active tab
setInterval(smartRefresh, 30000);

// Full refresh button still does everything
function refreshAll() {
  const btn = document.querySelector('.refresh-btn');
  if (btn) { btn.textContent = '↻ Loading...'; btn.disabled = true; }
  Promise.allSettled([loadSummary(), loadSubProcessGrid(), loadLog()])
    .then(() => {
      document.getElementById('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
      if (btn) { btn.textContent = '↻ Refresh'; btn.disabled = false; }
    });
}

// Close log-row modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLogRow();
});
// Click outside the modal body closes too
document.addEventListener('click', (e) => {
  if ((e.target || {}).id === 'log-modal-backdrop') closeLogRow();
});
</script>

<!-- Phase 2 admin.Log row drill-down modal -->
<div class="log-modal-backdrop" id="log-modal-backdrop">
  <div class="log-modal-body" id="log-modal-body"></div>
</div>
</body>
</html>`
}

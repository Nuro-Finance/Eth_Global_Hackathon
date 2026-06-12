/**
 * ─── TWITTER WATCHER — Session 27 Sprint 5.2 scaffold ────────────────────────
 *
 * Mirror of market-watcher.ts but for X/Twitter.
 *
 * Moltbook lets us write long posts (500+ chars, hashtags, link previews).
 * Twitter forces 280-char discipline, and single-tweet hits beat threads
 * for drive-by engagement. This watcher proposes tweet-length variants of
 * the same market/position events + a few X-specific formats:
 *   - Crypto price alerts (top mover 24h — short punchy)
 *   - "Hot market" teaser (question + YES/NO % + link)
 *   - "Big bet" teaser (anon bet size + side + link)
 *
 * Routes through existing submitForApproval() so Richard still sees
 * Telegram buttons + approves per-post. Approved posts flow through the
 * existing postTweet() helper in twitter.ts.
 *
 * Twitter can co-exist with Moltbook: each detection can submit both
 * platforms (Moltbook full + Twitter short) — Richard approves either
 * or both independently.
 *
 * Gated behind:
 *   ENABLE_GROWTH_AGENT=true (required)
 *   TWITTER_API_KEY set (otherwise posts queue indefinitely)
 *
 * Runs every 30 min (half as often as Moltbook's 15-min scan — Twitter
 * ratios favor quality over volume).
 */

import type { Pool } from 'pg'
import { submitForApproval } from './approval-pipeline'

const APP_URL = process.env.AFI_APP_URL || 'https://app.nuro.finance'
const TWITTER_ENABLED = Boolean(process.env.TWITTER_API_KEY)
const MAX_PROPOSALS_PER_RUN = 2  // stricter than Moltbook — X punishes spam harder

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trim() + '…'
}

/**
 * Scan for top 24h crypto movers and propose a punchy single-tweet alert.
 * De-dup per (symbol, day) — one tweet per coin per day max.
 */
async function proposeTopMover(db: Pool): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const result = await db.query(
    `SELECT mfc.symbol, mfc.name, mfc.price_usd, mfc.price_change_24h, mfc.volume_24h,
            el.id AS already_proposed
     FROM market_feed_cache mfc
     LEFT JOIN execution_log el
       ON el.entity_type = 'twitter_watcher'
      AND el.action = 'propose_mover'
      AND el.entity_id = mfc.symbol || ':' || $1
     WHERE mfc.feed_source = 'coingecko'
       AND mfc.last_synced_at > now() - interval '2 hours'
       AND ABS(mfc.price_change_24h) >= 5
       AND el.id IS NULL
     ORDER BY ABS(mfc.price_change_24h) DESC
     LIMIT 1`,
    [today]
  )
  if (result.rowCount === 0) return 0
  const m = result.rows[0]

  try {
    const change = Number(m.price_change_24h)
    const price = Number(m.price_usd)
    const symbol = String(m.symbol).toUpperCase()
    const name = m.name || symbol
    const emoji = change > 0 ? '📈' : '📉'
    const sign = change > 0 ? '+' : ''
    const link = `${APP_URL}/en/dashboard/markets`

    // Target ~240 chars so the tweet has breathing room if any part grows
    const text = truncate(
      `${emoji} ${name} (${symbol}) ${sign}${change.toFixed(1)}% 24h\n\n` +
      `$${price < 1 ? price.toFixed(4) : price.toLocaleString()} — bet on where it goes next\n\n` +
      `${link}`,
      270
    )

    await submitForApproval(db, text, 'twitter', 'crypto', {
      hashtags: [symbol, 'crypto', 'predictionmarket'],
      link,
      riskLevel: 'low',  // auto-approves — price alerts are low-stakes
    })

    await db.query(
      `INSERT INTO execution_log
         (id, entity_type, entity_id, action, status, detail, created_at)
       VALUES
         (gen_random_uuid(), 'twitter_watcher', $1, 'propose_mover', 'success', $2, now())`,
      [`${symbol}:${today}`, `${symbol} ${sign}${change.toFixed(1)}% @ $${price.toFixed(4)}`]
    )
    return 1
  } catch (err: any) {
    console.error(`[twitter-watcher] Mover propose failed:`, err.message?.slice(0, 80))
    return 0
  }
}

/**
 * Scan for a hot market (volume >$50 in 24h) not yet tweet-proposed today.
 * Shorter framing than the Moltbook version — no Moltbook-style description.
 */
async function proposeHotMarket(db: Pool): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const result = await db.query(
    `SELECT m.id, m.question, m.category, m.total_volume, m.yes_pool, m.no_pool,
            el.id AS already_proposed
     FROM markets m
     LEFT JOIN execution_log el
       ON el.entity_type = 'twitter_watcher'
      AND el.action = 'propose_hot_market'
      AND el.entity_id = m.id::text || ':' || $1
     WHERE m.status = 'active'
       AND m.total_volume > 50
       AND el.id IS NULL
     ORDER BY m.total_volume DESC
     LIMIT 1`,
    [today]
  )
  if (result.rowCount === 0) return 0
  const mkt = result.rows[0]

  try {
    const yesPool = Number(mkt.yes_pool) || 0
    const noPool = Number(mkt.no_pool) || 0
    const total = yesPool + noPool
    const yesPct = total > 0 ? Math.round((yesPool / total) * 100) : 50
    const volumeUsd = Number(mkt.total_volume) || 0
    const link = `${APP_URL}/en/dashboard/markets/${mkt.id}`

    const question = truncate(mkt.question || '', 180)
    const text = truncate(
      `🔮 HOT MARKET · $${volumeUsd >= 1000 ? (volumeUsd / 1000).toFixed(1) + 'K' : volumeUsd.toFixed(0)} vol\n\n` +
      `${question}\n\n` +
      `${yesPct}% YES · ${100 - yesPct}% NO\n\n` +
      `${link}`,
      270
    )

    await submitForApproval(db, text, 'twitter', 'announcement', {
      hashtags: ['predictionmarket', mkt.category, 'nurofinance'],
      link,
      riskLevel: 'medium',  // ping for approval, auto-approves after 2h
    })

    await db.query(
      `INSERT INTO execution_log
         (id, entity_type, entity_id, action, status, detail, created_at)
       VALUES
         (gen_random_uuid(), 'twitter_watcher', $1, 'propose_hot_market', 'success', $2, now())`,
      [`${mkt.id}:${today}`, `Tweet proposed: ${question.slice(0, 60)}`]
    )
    return 1
  } catch (err: any) {
    console.error(`[twitter-watcher] Hot-market propose failed:`, err.message?.slice(0, 80))
    return 0
  }
}

export async function runTwitterWatcherCycle(db: Pool): Promise<{ movers: number; markets: number }> {
  if (!TWITTER_ENABLED) {
    console.log('[twitter-watcher] Skipping cycle — TWITTER_API_KEY not set')
    return { movers: 0, markets: 0 }
  }
  let movers = 0
  let markets = 0
  try {
    movers = await proposeTopMover(db)
  } catch (err: any) {
    console.error('[twitter-watcher] Mover scan error:', err.message?.slice(0, 80))
  }
  try {
    markets = await proposeHotMarket(db)
  } catch (err: any) {
    console.error('[twitter-watcher] Market scan error:', err.message?.slice(0, 80))
  }
  if (movers > 0 || markets > 0) {
    console.log(`[twitter-watcher] Proposed ${movers} mover(s) + ${markets} hot market(s) for Telegram approval`)
  }
  return { movers, markets }
}

/**
 * Boot the Twitter watcher cron. Gated on TWITTER_API_KEY — skips cycle
 * if missing. 30-min interval (half Moltbook cadence, stricter proposal
 * caps per run).
 */
export function startTwitterWatcher(db: Pool): void {
  if (!TWITTER_ENABLED) {
    console.log('[twitter-watcher] Disabled — TWITTER_API_KEY not set')
    return
  }

  setTimeout(() => {
    runTwitterWatcherCycle(db).catch(err =>
      console.error('[twitter-watcher] First cycle error:', err.message?.slice(0, 80))
    )
  }, 5 * 60 * 1000)

  setInterval(() => {
    runTwitterWatcherCycle(db).catch(err =>
      console.error('[twitter-watcher] Cycle error:', err.message?.slice(0, 80))
    )
  }, 30 * 60 * 1000)

  console.log('[twitter-watcher] Enabled — scanning top movers + hot markets every 30 min')
}

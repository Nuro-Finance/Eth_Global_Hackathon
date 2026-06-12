/**
 * ─── MARKET WATCHER — Auto-propose Moltbook posts ───────────────────────────
 *
 * Session 26 — Richard wants the growth agent to be smarter:
 *   1. Detect new prediction markets + big user positions
 *   2. Compose a Moltbook-ready preview
 *   3. Ship through the existing approval pipeline so Richard sees an
 *      Approve/Reject button on Telegram — approved content flows to
 *      Moltbook via processApprovedPosts() in the hourly cycle.
 *
 * This is the *input* side of the pipeline. All posting, approval UI,
 * and de-dup-by-content is handled downstream. Our job here is:
 *   - Pick signal out of noise (most seed-feed markets aren't worth a post)
 *   - Compose concise, scroll-stopping copy
 *   - Stamp execution_log so we never re-propose the same market/position
 *
 * Filters:
 *   - NEW MARKETS: created in last hour, crypto/politics/culture only
 *     (sports/general skipped — too high volume, not differentiated)
 *   - BIG POSITIONS: cost_basis >= $50, created in last hour
 *
 * De-dup key: entity_type='market_watcher',
 *             action IN ('propose_market','propose_position'),
 *             entity_id=<market_id|position_id>
 */

import type { Pool } from 'pg'
import { submitForApproval } from './approval-pipeline'
import { perceiveMarket, detectTrends } from './thought-engine'

const APP_URL = process.env.AFI_APP_URL || 'https://app.nuro.finance'
const POSITION_USD_THRESHOLD = Number(process.env.POST_POSITION_USD_MIN || 50)
const MAX_PROPOSALS_PER_RUN = 3  // rate-limit: never spam Richard with 10 alerts

/**
 * Scan for interesting new markets and compose approval requests.
 */
async function proposeNewMarkets(db: Pool): Promise<number> {
  const result = await db.query(
    `SELECT m.id, m.question, m.category, m.total_volume, m.yes_pool, m.no_pool,
            m.resolution_date, m.created_at,
            el.id AS already_proposed
     FROM markets m
     LEFT JOIN execution_log el
       ON el.entity_type = 'market_watcher'
      AND el.action = 'propose_market'
      AND el.entity_id = m.id::text
     WHERE m.status = 'active'
       AND m.created_at > now() - interval '2 hours'
       AND m.category IN ('crypto', 'politics', 'culture')
       AND el.id IS NULL
     ORDER BY m.created_at DESC
     LIMIT $1`,
    [MAX_PROPOSALS_PER_RUN]
  )

  let proposed = 0
  for (const m of result.rows) {
    try {
      const yesPool = Number(m.yes_pool) || 0
      const noPool = Number(m.no_pool) || 0
      const total = yesPool + noPool
      const yesPct = total > 0 ? Math.round((yesPool / total) * 100) : 50

      const categoryEmoji =
        m.category === 'crypto' ? '💰' :
        m.category === 'politics' ? '🗳️' :
        m.category === 'culture' ? '🎭' : '🔮'

      const resolutionLine = m.resolution_date
        ? `Resolves: ${new Date(m.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Resolves on real-world outcome'

      const link = `${APP_URL}/en/dashboard/markets/${m.id}`

      const text =
        `${categoryEmoji} NEW MARKET\n\n` +
        `${m.question}\n\n` +
        `Current: ${yesPct}% YES · ${100 - yesPct}% NO\n` +
        `${resolutionLine}\n\n` +
        `Bet on it → ${link}`

      await submitForApproval(db, text, 'moltbook', 'announcement', {
        hashtags: ['predictionmarket', m.category, 'nurofinance'],
        link,
        riskLevel: 'medium', // auto-approves after 2hr, pings Richard for fast-track
      })

      await db.query(
        `INSERT INTO execution_log
           (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES
           (gen_random_uuid(), 'market_watcher', $1, 'propose_market', 'success', $2, now())`,
        [m.id, `Proposed: [${m.category}] ${m.question?.slice(0, 80)}`]
      )
      proposed++
    } catch (err: any) {
      console.error(`[market-watcher] Propose market ${m.id} failed:`, err.message?.slice(0, 80))
    }
  }

  return proposed
}

/**
 * Scan for big positions (≥$50) that haven't been broadcast yet.
 */
async function proposeBigPositions(db: Pool): Promise<number> {
  const result = await db.query(
    `SELECT mp.id, mp.market_id, mp.user_id, mp.side, mp.shares, mp.cost_basis,
            mp.created_at,
            m.question, m.category, m.yes_pool, m.no_pool,
            el.id AS already_proposed
     FROM market_positions mp
     JOIN markets m ON m.id = mp.market_id
     LEFT JOIN execution_log el
       ON el.entity_type = 'market_watcher'
      AND el.action = 'propose_position'
      AND el.entity_id = mp.id::text
     WHERE mp.cost_basis >= $1
       AND mp.created_at > now() - interval '2 hours'
       AND mp.status IN ('confirmed', 'pending')
       AND m.status = 'active'
       AND el.id IS NULL
     ORDER BY mp.cost_basis DESC
     LIMIT $2`,
    [POSITION_USD_THRESHOLD, MAX_PROPOSALS_PER_RUN]
  )

  let proposed = 0
  for (const p of result.rows) {
    try {
      const costUsd = Number(p.cost_basis) || 0
      const sideLabel = p.side === 'yes' ? 'YES' : 'NO'
      const sideEmoji = p.side === 'yes' ? '🟢' : '🔴'
      const link = `${APP_URL}/en/dashboard/markets/${p.market_id}`

      // Anonymise user — show short hash, not full id
      const userShort = String(p.user_id || 'anon').slice(0, 6)

      const text =
        `${sideEmoji} BIG BET — $${costUsd.toFixed(0)} on ${sideLabel}\n\n` +
        `${p.question}\n\n` +
        `User <${userShort}…> just bet $${costUsd.toFixed(0)} ${sideLabel}.\n\n` +
        `Think they're right? → ${link}`

      await submitForApproval(db, text, 'moltbook', 'announcement', {
        hashtags: ['bigbet', 'predictionmarket', p.category, 'nurofinance'],
        link,
        riskLevel: 'medium',
      })

      await db.query(
        `INSERT INTO execution_log
           (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES
           (gen_random_uuid(), 'market_watcher', $1, 'propose_position', 'success', $2, now())`,
        [p.id, `Proposed: $${costUsd.toFixed(0)} ${sideLabel} on ${p.question?.slice(0, 60)}`]
      )
      proposed++
    } catch (err: any) {
      console.error(`[market-watcher] Propose position ${p.id} failed:`, err.message?.slice(0, 80))
    }
  }

  return proposed
}

/**
 * Session 26 Phase 2 — thought-engine-driven commentary on the top market.
 *
 * Differs from proposeNewMarkets() in three ways:
 *   1. Targets the SINGLE highest-volume active market (not new ones)
 *   2. Threads in a trend signal from thought-engine (`detectTrends()`)
 *      so the post references real market context — "BTC momentum is
 *      surging while this market pegs 65% YES..."
 *   3. Runs less frequently (every 2h, max 1 proposal per run)
 *
 * De-dup key: entity_type='market_watcher', action='propose_top_market',
 * entity_id=<market_id> — same market ID never re-proposed within 48h.
 *
 * Why a separate fn + dedup window: the templated proposeNewMarkets
 * fires once per new market ever. This one fires a richer take on the
 * same hot markets over multiple days as the context evolves, but at
 * most once per 48h per market so we don't spam the same question.
 */
async function proposeTopMarketWithThought(db: Pool): Promise<number> {
  // Pull top market by volume, active, not already thought-posted in 48h
  const result = await db.query(
    `SELECT m.id, m.question, m.category, m.total_volume, m.yes_pool, m.no_pool,
            m.resolution_date,
            el.id AS already_proposed
     FROM markets m
     LEFT JOIN execution_log el
       ON el.entity_type = 'market_watcher'
      AND el.action = 'propose_top_market'
      AND el.entity_id = m.id::text
      AND el.created_at > now() - interval '48 hours'
     WHERE m.status = 'active'
       AND m.total_volume > 0
       AND el.id IS NULL
     ORDER BY m.total_volume DESC
     LIMIT 1`
  )

  if (result.rowCount === 0) return 0
  const m = result.rows[0]

  try {
    // Pull market context via the thought-engine
    const snapshot = await perceiveMarket(db)
    const trends = await detectTrends(db, snapshot)
    const strongestTrend = trends.length > 0
      ? trends.sort((a, b) => b.strength - a.strength)[0]
      : null

    const yesPool = Number(m.yes_pool) || 0
    const noPool = Number(m.no_pool) || 0
    const total = yesPool + noPool
    const yesPct = total > 0 ? Math.round((yesPool / total) * 100) : 50
    const volumeUsd = Number(m.total_volume) || 0

    const categoryEmoji =
      m.category === 'crypto' ? '💰' :
      m.category === 'politics' ? '🗳️' :
      m.category === 'culture' ? '🎭' :
      m.category === 'sports' ? '🏆' : '🔮'

    const sentimentEmoji =
      snapshot.overallSentiment === 'bullish' ? '📈' :
      snapshot.overallSentiment === 'bearish' ? '📉' :
      snapshot.overallSentiment === 'volatile' ? '⚡' : '➖'

    // Compose the take — adapts to whatever trend signal is strongest
    let trendContext = ''
    if (strongestTrend && strongestTrend.strength > 0.4) {
      trendContext = `\n${sentimentEmoji} Context: ${strongestTrend.description}\n`
    } else if (snapshot.overallSentiment === 'volatile') {
      trendContext = `\n${sentimentEmoji} Markets are volatile right now. Good time to take a position.\n`
    }

    const resolutionLine = m.resolution_date
      ? `Resolves ${new Date(m.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : 'Resolves on real-world outcome'

    const link = `${APP_URL}/en/dashboard/markets/${m.id}`

    // The "hook line" — drawn from current yes% to create a POV
    let hookLine: string
    if (yesPct >= 70) {
      hookLine = `Crowd is ${yesPct}% YES. Contrarian play if you disagree — the less-popular side pays more.`
    } else if (yesPct <= 30) {
      hookLine = `Crowd is only ${yesPct}% YES. Underdog bet — big payoff if you see something they don't.`
    } else {
      hookLine = `Split ${yesPct}/${100 - yesPct}. Toss-up — comes down to conviction.`
    }

    const text =
      `${categoryEmoji} TOP MARKET · $${volumeUsd >= 1000 ? (volumeUsd / 1000).toFixed(1) + 'K' : volumeUsd.toFixed(0)} volume\n\n` +
      `${m.question}\n\n` +
      `${hookLine}` +
      `${trendContext}\n` +
      `${resolutionLine}\n\n` +
      `Bet on it → ${link}`

    await submitForApproval(db, text, 'moltbook', 'announcement', {
      hashtags: ['predictionmarket', 'topmarket', m.category, 'nurofinance'],
      link,
      riskLevel: 'medium',
    })

    await db.query(
      `INSERT INTO execution_log
         (id, entity_type, entity_id, action, status, detail, created_at)
       VALUES
         (gen_random_uuid(), 'market_watcher', $1, 'propose_top_market', 'success', $2, now())`,
      [m.id, `Proposed top market ($${volumeUsd.toFixed(0)} vol, ${yesPct}% YES, trend=${strongestTrend?.type || 'none'}): ${m.question?.slice(0, 80)}`]
    )

    return 1
  } catch (err: any) {
    console.error(`[market-watcher] Propose top market ${m.id} failed:`, err.message?.slice(0, 80))
    return 0
  }
}

/**
 * Combined scan. Called every 15 min from the mythos scheduler.
 */
export async function runMarketWatcherCycle(db: Pool): Promise<{
  markets: number
  positions: number
}> {
  let markets = 0
  let positions = 0
  try {
    markets = await proposeNewMarkets(db)
  } catch (err: any) {
    console.error('[market-watcher] Market scan error:', err.message?.slice(0, 80))
  }
  try {
    positions = await proposeBigPositions(db)
  } catch (err: any) {
    console.error('[market-watcher] Position scan error:', err.message?.slice(0, 80))
  }
  if (markets > 0 || positions > 0) {
    console.log(`[market-watcher] Proposed ${markets} market(s) + ${positions} position(s) for approval`)
  }
  return { markets, positions }
}

/**
 * Boot the market-watcher crons. Two cadences:
 *   - 15 min: scan for NEW markets + BIG positions (templated posts)
 *   - 2 hours: propose 1 top-volume market with thought-engine commentary
 *
 * Both route through submitForApproval() so Richard sees Telegram
 * buttons for each. Gated by ENABLE_GROWTH_AGENT via caller.
 */
export function startMarketWatcher(db: Pool): void {
  // First run 3 min after boot (let system settle), then every 15 min.
  setTimeout(() => {
    runMarketWatcherCycle(db).catch(err =>
      console.error('[market-watcher] First cycle error:', err.message?.slice(0, 80))
    )
  }, 3 * 60 * 1000)

  setInterval(() => {
    runMarketWatcherCycle(db).catch(err =>
      console.error('[market-watcher] Cycle error:', err.message?.slice(0, 80))
    )
  }, 15 * 60 * 1000)

  // Thought-engine top-market post — runs slower (every 2h) since each
  // post is richer + we don't want to spam the same high-volume market.
  // First run 10 min after boot.
  setTimeout(() => {
    proposeTopMarketWithThought(db).catch(err =>
      console.error('[market-watcher] First thought cycle error:', err.message?.slice(0, 80))
    )
  }, 10 * 60 * 1000)

  setInterval(() => {
    proposeTopMarketWithThought(db).catch(err =>
      console.error('[market-watcher] Thought cycle error:', err.message?.slice(0, 80))
    )
  }, 2 * 60 * 60 * 1000)

  console.log('[market-watcher] Enabled — new-market scan every 15 min, top-market thought every 2h')
}

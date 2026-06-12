/**
 * ─── OMNICHAIN MARKET FEEDS ──────────────────────────────────────────────────
 *
 * Sprint 2.2: Real-time data feeds for prediction market resolution + auto-creation.
 *
 * Feeds:
 *   1. CoinGecko — crypto price feeds (BTC, ETH, SOL, etc.)
 *   2. Sports — live scores, schedules, results (via API-Sports / TheSportsDB)
 *   3. Polymarket Trending — auto-seed markets from Polymarket's hottest
 *   4. News/Events — placeholder for political/event markets (manual Phase 1)
 *
 * Architecture:
 *   Feeds store to market_feed_cache table → Oracle reads cache → resolves markets
 *   Intent Layer: store data. Execution Layer: resolve with real data.
 *
 * Rate limits respected:
 *   CoinGecko free: 10-30 calls/min → poll every 60s
 *   TheSportsDB free: 15 calls/15min → poll every 300s
 *   Polymarket Gamma: no documented limit → poll every 120s
 */

import axios from 'axios'
import { Pool } from 'pg'
import { reportError, reportWarning } from './error-reporter'
import { sweepCryptoOracle, sweepSportsOracle, sweepExpiredMarkets } from './market-oracle'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface CryptoPrice {
  id: string           // coingecko id: 'bitcoin', 'ethereum', etc.
  symbol: string       // 'btc', 'eth', etc.
  name: string
  current_price: number
  price_change_24h: number
  price_change_percentage_24h: number
  market_cap: number
  total_volume: number
  high_24h: number
  low_24h: number
  last_updated: string
}

export interface SportEvent {
  id: string
  sport: string        // 'soccer', 'basketball', 'mma', etc.
  league: string       // 'NBA', 'Premier League', etc.
  home_team: string
  away_team: string
  date: string         // ISO timestamp
  status: string       // 'scheduled', 'live', 'finished'
  home_score: number | null
  away_score: number | null
  winner: string | null // 'home', 'away', 'draw', null
}

export interface TrendingMarket {
  question: string
  description: string
  category: string
  source: string       // 'polymarket', 'coingecko', 'sports'
  source_id: string    // external ID for tracking
  image_url: string | null
  resolution_date: string | null
  volume_24h: number
  yes_price: number    // 0-1
  no_price: number     // 0-1
}

// ─── COINGECKO FEED ──────────────────────────────────────────────────────────

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

// Top coins we track for market creation + resolution
const TRACKED_COINS = [
  'bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'chainlink',
  'avalanche-2', 'polygon-ecosystem-token', 'near', 'sui', 'aptos',
  'arbitrum', 'optimism', 'celestia', 'injective-protocol', 'render-token',
  'dogecoin', 'shiba-inu', 'pepe', 'bonk',
]

export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  try {
    const ids = TRACKED_COINS.join(',')
    const response = await axios.get(`${COINGECKO_BASE}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        ids,
        order: 'market_cap_desc',
        per_page: 50,
        sparkline: false,
        price_change_percentage: '24h',
      },
      timeout: 10000,
      headers: { 'Accept': 'application/json' },
    })
    return response.data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      current_price: coin.current_price,
      price_change_24h: coin.price_change_24h,
      price_change_percentage_24h: coin.price_change_percentage_24h,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      high_24h: coin.high_24h,
      low_24h: coin.low_24h,
      last_updated: coin.last_updated,
    }))
  } catch (err: any) {
    if (err.response?.status === 429) {
      reportWarning('execution', 'coingecko_fetch', 'rate_limit', 'CoinGecko rate limited — will retry next cycle')
    } else {
      reportError('execution', 'coingecko_fetch', 'coingecko', 'CoinGecko API error', err)
    }
    return []
  }
}

// Fetch single coin price (for market resolution)
export async function fetchCoinPrice(coinId: string): Promise<number | null> {
  try {
    const response = await axios.get(`${COINGECKO_BASE}/simple/price`, {
      params: { ids: coinId, vs_currencies: 'usd' },
      timeout: 10000,
    })
    return response.data[coinId]?.usd ?? null
  } catch (err: any) {
    reportError('execution', 'coingecko_price', coinId, 'Failed to fetch coin price', err)
    return null
  }
}

// Fetch historical price at a specific date (for market resolution verification)
export async function fetchCoinHistoricalPrice(coinId: string, date: string): Promise<number | null> {
  // date format: dd-mm-yyyy
  try {
    const response = await axios.get(`${COINGECKO_BASE}/coins/${coinId}/history`, {
      params: { date, localization: false },
      timeout: 10000,
    })
    return response.data?.market_data?.current_price?.usd ?? null
  } catch {
    return null
  }
}

// ─── SPORTS FEED ─────────────────────────────────────────────────────────────

// Using TheSportsDB (free tier) — covers major leagues
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'

export async function fetchUpcomingSports(sport: string = 'Soccer'): Promise<SportEvent[]> {
  try {
    // Fetch next 15 events for major leagues
    const leagueIds: Record<string, string[]> = {
      Soccer: ['4328', '4331', '4332', '4334', '4335'],  // EPL, Bundesliga, Serie A, Ligue 1, La Liga
      Basketball: ['4387'],  // NBA
      'Ice Hockey': ['4380'],  // NHL
      'American Football': ['4391'],  // NFL
      Baseball: ['4424'],  // MLB
      'Mixed Martial Arts': ['4443'],  // UFC
    }

    const ids = leagueIds[sport] || leagueIds['Soccer']
    const events: SportEvent[] = []

    for (const leagueId of ids.slice(0, 3)) {  // Limit to 3 leagues per call to stay under rate limit
      try {
        const response = await axios.get(`${SPORTSDB_BASE}/eventsnextleague.php`, {
          params: { id: leagueId },
          timeout: 10000,
        })
        const rawEvents = response.data?.events || []
        for (const e of rawEvents.slice(0, 5)) {  // Top 5 per league
          events.push({
            id: e.idEvent,
            sport: e.strSport || sport,
            league: e.strLeague,
            home_team: e.strHomeTeam,
            away_team: e.strAwayTeam,
            date: e.strTimestamp || e.dateEvent,
            status: e.strStatus || 'scheduled',
            home_score: e.intHomeScore != null ? parseInt(e.intHomeScore) : null,
            away_score: e.intAwayScore != null ? parseInt(e.intAwayScore) : null,
            winner: e.intHomeScore != null && e.intAwayScore != null
              ? (parseInt(e.intHomeScore) > parseInt(e.intAwayScore) ? 'home' : parseInt(e.intHomeScore) < parseInt(e.intAwayScore) ? 'away' : 'draw')
              : null,
          })
        }
      } catch {
        // Skip individual league failures
      }
    }
    return events
  } catch (err: any) {
    reportError('execution', 'sports_fetch', sport, 'Sports API error', err)
    return []
  }
}

// Fetch results for resolved games (for market resolution)
export async function fetchSportsResults(leagueId: string): Promise<SportEvent[]> {
  try {
    const response = await axios.get(`${SPORTSDB_BASE}/eventspastleague.php`, {
      params: { id: leagueId },
      timeout: 10000,
    })
    const rawEvents = response.data?.events || []
    return rawEvents.map((e: any) => ({
      id: e.idEvent,
      sport: e.strSport,
      league: e.strLeague,
      home_team: e.strHomeTeam,
      away_team: e.strAwayTeam,
      date: e.strTimestamp || e.dateEvent,
      status: 'finished',
      home_score: parseInt(e.intHomeScore || '0'),
      away_score: parseInt(e.intAwayScore || '0'),
      winner: parseInt(e.intHomeScore) > parseInt(e.intAwayScore) ? 'home'
        : parseInt(e.intHomeScore) < parseInt(e.intAwayScore) ? 'away' : 'draw',
    }))
  } catch {
    return []
  }
}

// ─── POLYMARKET TRENDING → AUTO-CREATE MARKETS ───────────────────────────────

export async function fetchPolymarketTrending(limit: number = 20): Promise<TrendingMarket[]> {
  try {
    const response = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: {
        limit, active: 'true', closed: 'false',
        order: 'volume24hr', ascending: 'false',
      },
      timeout: 10000,
    })
    return (response.data || []).map((m: any) => {
      const prices = parseOutcomePrices(m.outcomePrices)
      return {
        question: m.question,
        description: m.description || '',
        category: mapPolymarketTag(m.tags?.[0] || ''),
        source: 'polymarket',
        source_id: m.conditionId || m.slug || m.id,
        image_url: m.image || null,
        resolution_date: m.endDate || null,
        volume_24h: parseFloat(m.volume24hr || '0'),
        yes_price: prices.yes,
        no_price: prices.no,
      }
    })
  } catch (err: any) {
    reportError('execution', 'polymarket_trending', 'feed', 'Polymarket trending fetch failed', err)
    return []
  }
}

function parseOutcomePrices(raw: string | undefined): { yes: number; no: number } {
  try {
    if (!raw) return { yes: 0.5, no: 0.5 }
    const parsed = JSON.parse(raw)
    return {
      yes: parseFloat(parsed[0] || '0.5'),
      no: parseFloat(parsed[1] || '0.5'),
    }
  } catch {
    return { yes: 0.5, no: 0.5 }
  }
}

function mapPolymarketTag(tag: string): string {
  const map: Record<string, string> = {
    politics: 'politics', crypto: 'crypto', sports: 'sports',
    science: 'science', entertainment: 'entertainment', business: 'business',
    technology: 'technology', finance: 'finance',
  }
  return map[tag.toLowerCase()] || 'general'
}

// ─── AUTO-CREATE MARKETS FROM TRENDING ───────────────────────────────────────

export async function autoCreateMarketsFromPolymarket(
  db: Pool,
  adminUserId: string,
  maxNew: number = 5,
): Promise<number> {
  let created = 0
  try {
    const trending = await fetchPolymarketTrending(30)
    if (!trending.length) return 0

    // Get existing markets to avoid duplicates (match by source_id or similar question)
    const existing = await db.query('SELECT question, polymarket_id FROM markets WHERE status != $1', ['resolved'])
    const existingQuestions = new Set(existing.rows.map((r: any) => r.question.toLowerCase().trim()))
    const existingPolyIds = new Set(existing.rows.map((r: any) => r.polymarket_id).filter(Boolean))

    for (const market of trending) {
      if (created >= maxNew) break
      if (existingPolyIds.has(market.source_id)) continue
      if (existingQuestions.has(market.question.toLowerCase().trim())) continue
      if (market.volume_24h < 10000) continue  // Only import high-volume markets

      try {
        await db.query(
          `INSERT INTO markets (id, question, description, category, resolution_source, resolution_date,
             image_url, creator_id, yes_pool, no_pool, total_volume, status, polymarket_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'active', $10)`,
          [
            market.question,
            market.description.slice(0, 500),
            market.category,
            'polymarket',  // resolution source
            market.resolution_date,
            market.image_url,
            adminUserId,
            100 * market.yes_price,  // Initialize AMM pools based on Polymarket odds
            100 * market.no_price,
            market.source_id,
          ]
        )
        created++
      } catch (insertErr: any) {
        // Duplicate or constraint violation — skip
        if (!insertErr.message?.includes('duplicate')) {
          reportWarning('intent', 'auto_create_market', market.source_id, 'Failed to auto-create market', insertErr)
        }
      }
    }

    if (created > 0) {
      console.log(`[market-feeds] Auto-created ${created} markets from Polymarket trending`)
    }
  } catch (err: any) {
    reportError('intent', 'auto_create_markets', 'polymarket', 'Auto-create markets failed', err)
  }
  return created
}

// ─── CRYPTO PRICE MARKET AUTO-CREATION ───────────────────────────────────────

export async function autoCreateCryptoMarkets(
  db: Pool,
  adminUserId: string,
): Promise<number> {
  let created = 0
  const prices = await fetchCryptoPrices()
  if (!prices.length) return 0

  // Create price prediction markets for top movers
  const topMovers = prices
    .filter(p => Math.abs(p.price_change_percentage_24h) > 3)  // >3% move = interesting
    .sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h))
    .slice(0, 5)

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  for (const coin of topMovers) {
    const direction = coin.price_change_percentage_24h > 0 ? 'up' : 'down'
    const targetPrice = direction === 'up'
      ? Math.round(coin.current_price * 1.05)  // Will it go 5% higher?
      : Math.round(coin.current_price * 0.95)  // Will it drop 5% more?

    const question = `Will ${coin.name} (${coin.symbol.toUpperCase()}) reach $${targetPrice.toLocaleString()} by ${nextWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}?`

    // Check if similar market exists
    const exists = await db.query(
      `SELECT id FROM markets WHERE question ILIKE $1 AND status = 'active'`,
      [`%${coin.name}%$${targetPrice}%`]
    )
    if (exists.rows.length > 0) continue

    try {
      await db.query(
        `INSERT INTO markets (id, question, description, category, resolution_source, resolution_date,
           image_url, creator_id, yes_pool, no_pool, total_volume, status)
         VALUES (gen_random_uuid(), $1, $2, 'crypto', 'coingecko', $3, $4, $5, 50, 50, 0, 'active')`,
        [
          question,
          `${coin.name} is currently at $${coin.current_price.toLocaleString()} (${coin.price_change_percentage_24h > 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(1)}% 24h). Will it reach $${targetPrice.toLocaleString()} within a week?`,
          nextWeek.toISOString(),
          `https://assets.coingecko.com/coins/images/${coin.id}/small`,  // May not work but best effort
          adminUserId,
        ]
      )
      created++
    } catch {
      // Skip duplicates
    }
  }

  if (created > 0) {
    console.log(`[market-feeds] Auto-created ${created} crypto price markets`)
  }
  return created
}

// ─── SPORTS MARKET AUTO-CREATION ─────────────────────────────────────────────

export async function autoCreateSportsMarkets(
  db: Pool,
  adminUserId: string,
): Promise<number> {
  let created = 0

  for (const sport of ['Soccer', 'Basketball', 'Mixed Martial Arts']) {
    const events = await fetchUpcomingSports(sport)

    for (const event of events.slice(0, 3)) {
      const question = `Will ${event.home_team} beat ${event.away_team}?`
      const description = `${event.league} — ${event.home_team} vs ${event.away_team}. ${event.date ? `Scheduled: ${new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`

      // Check duplicate
      const exists = await db.query(
        `SELECT id FROM markets WHERE question = $1 AND status = 'active'`,
        [question]
      )
      if (exists.rows.length > 0) continue

      try {
        await db.query(
          `INSERT INTO markets (id, question, description, category, resolution_source, resolution_date,
             creator_id, yes_pool, no_pool, total_volume, status)
           VALUES (gen_random_uuid(), $1, $2, 'sports', 'sports_api', $3, $4, 50, 50, 0, 'active')`,
          [question, description, event.date || null, adminUserId]
        )
        created++
      } catch {
        // Skip duplicates
      }
    }
  }

  if (created > 0) {
    console.log(`[market-feeds] Auto-created ${created} sports markets`)
  }
  return created
}

// ─── FEED CACHE + DB STORAGE ─────────────────────────────────────────────────

export async function cacheCryptoPrices(db: Pool): Promise<void> {
  const prices = await fetchCryptoPrices()
  if (!prices.length) return

  for (const coin of prices) {
    await db.query(
      `INSERT INTO market_feed_cache (id, feed_source, external_id, symbol, name, price_usd,
         price_change_24h, volume_24h, metadata, last_synced_at)
       VALUES (gen_random_uuid(), 'coingecko', $1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (feed_source, external_id) DO UPDATE SET
         price_usd = $4, price_change_24h = $5, volume_24h = $6, metadata = $7, last_synced_at = now()`,
      [
        coin.id, coin.symbol, coin.name, coin.current_price,
        coin.price_change_percentage_24h, coin.total_volume,
        JSON.stringify({ high_24h: coin.high_24h, low_24h: coin.low_24h, market_cap: coin.market_cap }),
      ]
    ).catch(() => {})  // Ignore individual cache errors
  }
}

export async function cacheSportsEvents(db: Pool): Promise<void> {
  for (const sport of ['Soccer', 'Basketball']) {
    const events = await fetchUpcomingSports(sport)
    for (const event of events) {
      await db.query(
        `INSERT INTO market_feed_cache (id, feed_source, external_id, symbol, name, metadata, last_synced_at)
         VALUES (gen_random_uuid(), 'sports', $1, $2, $3, $4, now())
         ON CONFLICT (feed_source, external_id) DO UPDATE SET
           metadata = $4, last_synced_at = now()`,
        [
          event.id, event.sport,
          `${event.home_team} vs ${event.away_team}`,
          JSON.stringify(event),
        ]
      ).catch(() => {})
    }
  }
}

// ─── FEED RUNNER (call from index.ts) ────────────────────────────────────────

let feedInterval: NodeJS.Timeout | null = null

export function startMarketFeeds(db: Pool, adminUserId: string): void {
  console.log('[market-feeds] Starting market feed engine (crypto: 60s, sports: 300s, trending: 120s)')

  // Initial fetch
  runFeedCycle(db, adminUserId)

  // Crypto prices every 60s
  feedInterval = setInterval(() => runFeedCycle(db, adminUserId), 60_000)
}

export function stopMarketFeeds(): void {
  if (feedInterval) {
    clearInterval(feedInterval)
    feedInterval = null
  }
}

let cycleCount = 0

async function runFeedCycle(db: Pool, adminUserId: string): Promise<void> {
  cycleCount++
  try {
    // Every cycle: cache crypto prices (60s)
    await cacheCryptoPrices(db)

    // Every 2nd cycle (~120s): fetch Polymarket trending
    if (cycleCount % 2 === 0) {
      await autoCreateMarketsFromPolymarket(db, adminUserId, 3)
    }

    // Every 5th cycle (~300s): cache sports + create sports markets
    if (cycleCount % 5 === 0) {
      await cacheSportsEvents(db)
      await autoCreateSportsMarkets(db, adminUserId)
    }

    // Every 10th cycle (~600s): create crypto price markets from top movers
    if (cycleCount % 10 === 0) {
      await autoCreateCryptoMarkets(db, adminUserId)
    }

    // Every 5th cycle (~300s): run oracle auto-resolution
    if (cycleCount % 5 === 0) {
      const [cryptoResolved, sportsResolved, expired] = await Promise.allSettled([
        sweepCryptoOracle(db),
        sweepSportsOracle(db),
        sweepExpiredMarkets(db),
      ])
      const cr = cryptoResolved.status === 'fulfilled' ? cryptoResolved.value : 0
      const sr = sportsResolved.status === 'fulfilled' ? sportsResolved.value : 0
      if (cr > 0 || sr > 0) {
        console.log(`[oracle] Resolved: ${cr} crypto, ${sr} sports markets`)
      }
    }
    // Every 60th cycle (~60 min): CLEANUP — prune stale data to prevent memory bloat
    if (cycleCount % 60 === 0) {
      await Promise.allSettled([
        // Remove feed cache entries older than 48 hours (they get replaced by ON CONFLICT anyway)
        db.query(`DELETE FROM market_feed_cache WHERE last_synced_at < now() - interval '48 hours'`),
        // Prune execution_log entries older than 30 days (keep recent for admin console)
        db.query(`DELETE FROM execution_log WHERE created_at < now() - interval '30 days'`),
        // Prune old processed approval entries (approved/rejected/expired older than 7 days)
        db.query(`DELETE FROM growth_agent_memory WHERE key LIKE 'pending_post_%' AND category = 'approval'
                  AND updated_at < now() - interval '7 days'`),
        // Prune old rejection learning entries older than 30 days
        db.query(`DELETE FROM growth_agent_memory WHERE key LIKE 'rejection_%' AND category = 'learning'
                  AND updated_at < now() - interval '30 days'`),
      ]).then(results => {
        const cleaned = results.filter(r => r.status === 'fulfilled').length
        console.log(`[cleanup] Hourly prune: ${cleaned}/4 cleanup tasks succeeded`)
      })
    }
  } catch (err: any) {
    console.error('[market-feeds] Feed cycle error:', err.message?.slice(0, 100))
  }
}

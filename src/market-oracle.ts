/**
 * ─── MARKET ORACLE — Auto-Resolution Engine ──────────────────────────────────
 *
 * Phase 1: Automated resolution for markets with known resolution sources.
 * Phase 2: Chainlink, UMA Optimistic Oracle (future)
 *
 * Resolution Sources:
 *   - coingecko: Crypto price markets — resolve based on CoinGecko price data
 *   - sports_api: Sports markets — resolve based on game results
 *   - polymarket: Mirror Polymarket resolution (follow their oracle)
 *   - manual: Admin resolves via POST /markets/:id/resolve
 *
 * Architecture:
 *   Oracle reads from market_feed_cache (populated by market-feeds.ts)
 *   Compares against market resolution criteria
 *   Calls internal resolve logic (same as POST /markets/:id/resolve)
 *   Logs all decisions to execution_log
 *
 * Runs every 5 minutes via the feed cycle.
 */

import { Pool } from 'pg'
import { reportError } from './error-reporter'

// ─── CRYPTO ORACLE ───────────────────────────────────────────────────────────
// Resolves markets like "Will BTC reach $X by DATE?"
// Parses the question to extract: coin name, target price, direction

interface CryptoParsed {
  coinId: string
  targetPrice: number
  direction: 'above' | 'below'
}

function parseCryptoMarketQuestion(question: string): CryptoParsed | null {
  // Match patterns like:
  // "Will Bitcoin (BTC) reach $100,000 by Dec 31?"
  // "Will Ethereum hit $5,000 by next week?"
  // "Will Solana drop below $50 by April?"
  const coinMap: Record<string, string> = {
    bitcoin: 'bitcoin', btc: 'bitcoin',
    ethereum: 'ethereum', eth: 'ethereum',
    solana: 'solana', sol: 'solana',
    cardano: 'cardano', ada: 'cardano',
    polkadot: 'polkadot', dot: 'polkadot',
    chainlink: 'chainlink', link: 'chainlink',
    avalanche: 'avalanche-2', avax: 'avalanche-2',
    polygon: 'polygon-ecosystem-token', matic: 'polygon-ecosystem-token', pol: 'polygon-ecosystem-token',
    near: 'near', sui: 'sui', aptos: 'aptos',
    arbitrum: 'arbitrum', arb: 'arbitrum',
    optimism: 'optimism', op: 'optimism',
    celestia: 'celestia', tia: 'celestia',
    injective: 'injective-protocol', inj: 'injective-protocol',
    render: 'render-token', rndr: 'render-token',
    dogecoin: 'dogecoin', doge: 'dogecoin',
    'shiba inu': 'shiba-inu', shib: 'shiba-inu',
    pepe: 'pepe', bonk: 'bonk',
  }

  const lowerQ = question.toLowerCase()

  // Find the coin
  let coinId: string | null = null
  for (const [keyword, id] of Object.entries(coinMap)) {
    if (lowerQ.includes(keyword)) {
      coinId = id
      break
    }
  }
  if (!coinId) return null

  // Find target price — look for $X,XXX or $X.XX patterns
  const priceMatch = question.match(/\$([0-9,]+\.?\d*)/)?.[1]
  if (!priceMatch) return null
  const targetPrice = parseFloat(priceMatch.replace(/,/g, ''))
  if (isNaN(targetPrice)) return null

  // Determine direction
  const isBelow = lowerQ.includes('drop below') || lowerQ.includes('fall below') || lowerQ.includes('go below')
  const direction = isBelow ? 'below' : 'above'

  return { coinId, targetPrice, direction }
}

// ─── RESOLVE MARKET (shared logic) ───────────────────────────────────────────

async function resolveMarket(db: Pool, marketId: string, outcome: 'yes' | 'no', reason: string): Promise<boolean> {
  try {
    const market = await db.query('SELECT * FROM markets WHERE id = $1', [marketId])
    if (!market.rows.length || market.rows[0].status === 'resolved') return false

    // Mark as resolved
    await db.query(
      "UPDATE markets SET status = 'resolved', resolved_outcome = $1, resolved_at = now() WHERE id = $2",
      [outcome, marketId]
    )

    // Pay out winners
    const winningPositions = await db.query(
      "SELECT * FROM market_positions WHERE market_id = $1 AND side = $2 AND status = 'open'",
      [marketId, outcome]
    )
    for (const pos of winningPositions.rows) {
      const payout = parseFloat(pos.shares)
      await db.query(
        "UPDATE market_positions SET status = 'won', payout = $1 WHERE id = $2",
        [payout, pos.id]
      )
    }

    // Mark losers
    await db.query(
      "UPDATE market_positions SET status = 'lost', payout = 0 WHERE market_id = $1 AND side != $2 AND status = 'open'",
      [marketId, outcome]
    )

    // Log to execution_log
    await db.query(
      `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
       VALUES (gen_random_uuid(), 'oracle', $1, 'auto_resolve', 'success', $2, now())`,
      [marketId, `Market resolved: ${outcome.toUpperCase()} — ${reason}`]
    )

    console.log(`[oracle] Resolved market ${marketId}: ${outcome} — ${reason}`)
    return true
  } catch (err: any) {
    reportError('execution', 'oracle_resolve', marketId, 'Market resolution failed', err)
    return false
  }
}

// ─── CRYPTO ORACLE SWEEP ─────────────────────────────────────────────────────

export async function sweepCryptoOracle(db: Pool): Promise<number> {
  let resolved = 0
  try {
    // Get all active crypto markets with resolution_source = 'coingecko'
    const markets = await db.query(
      `SELECT id, question, resolution_date FROM markets
       WHERE status = 'active' AND resolution_source = 'coingecko'
       ORDER BY created_at ASC LIMIT 50`
    )

    for (const market of markets.rows) {
      const parsed = parseCryptoMarketQuestion(market.question)
      if (!parsed) continue

      // Check if resolution date has passed
      const resDate = market.resolution_date ? new Date(market.resolution_date) : null
      const now = new Date()

      // Read price from cache (populated by market-feeds.ts every 60s) — NO extra API call
      const cachedPrice = await db.query(
        `SELECT price_usd FROM market_feed_cache WHERE feed_source = 'coingecko' AND external_id = $1`,
        [parsed.coinId]
      )
      const currentPrice = cachedPrice.rows[0]?.price_usd ? parseFloat(cachedPrice.rows[0].price_usd) : null
      if (currentPrice === null) continue

      if (parsed.direction === 'above') {
        if (currentPrice >= parsed.targetPrice) {
          // Price hit target — resolve YES
          const success = await resolveMarket(db, market.id, 'yes',
            `${parsed.coinId} reached $${currentPrice.toLocaleString()} (target: $${parsed.targetPrice.toLocaleString()}) via CoinGecko`)
          if (success) resolved++
        } else if (resDate && now > resDate) {
          // Deadline passed without hitting target — resolve NO
          const success = await resolveMarket(db, market.id, 'no',
            `Deadline passed. ${parsed.coinId} at $${currentPrice.toLocaleString()}, target was $${parsed.targetPrice.toLocaleString()}`)
          if (success) resolved++
        }
      } else {
        // 'below' direction
        if (currentPrice <= parsed.targetPrice) {
          const success = await resolveMarket(db, market.id, 'yes',
            `${parsed.coinId} dropped to $${currentPrice.toLocaleString()} (target: below $${parsed.targetPrice.toLocaleString()})`)
          if (success) resolved++
        } else if (resDate && now > resDate) {
          const success = await resolveMarket(db, market.id, 'no',
            `Deadline passed. ${parsed.coinId} at $${currentPrice.toLocaleString()}, needed below $${parsed.targetPrice.toLocaleString()}`)
          if (success) resolved++
        }
      }
    }
  } catch (err: any) {
    reportError('execution', 'crypto_oracle_sweep', 'oracle', 'Crypto oracle sweep failed', err)
  }
  return resolved
}

// ─── SPORTS ORACLE SWEEP ─────────────────────────────────────────────────────

export async function sweepSportsOracle(db: Pool): Promise<number> {
  let resolved = 0
  try {
    const markets = await db.query(
      `SELECT id, question FROM markets
       WHERE status = 'active' AND resolution_source = 'sports_api'
       ORDER BY created_at ASC LIMIT 50`
    )

    // Parse "Will X beat Y?" format
    for (const market of markets.rows) {
      const match = market.question.match(/Will (.+?) beat (.+?)\?/)
      if (!match) continue
      const homeTeam = match[1].trim()
      const awayTeam = match[2].trim()

      // Check cached sports results
      const cached = await db.query(
        `SELECT metadata FROM market_feed_cache
         WHERE feed_source = 'sports' AND name ILIKE $1
         AND last_synced_at > now() - interval '1 hour'`,
        [`%${homeTeam}%${awayTeam}%`]
      )

      if (!cached.rows.length) continue
      const event = cached.rows[0].metadata
      if (!event || event.status !== 'finished') continue

      // Game finished — resolve
      if (event.winner === 'home') {
        await resolveMarket(db, market.id, 'yes',
          `${homeTeam} won ${event.home_score}-${event.away_score} vs ${awayTeam}`)
        resolved++
      } else {
        await resolveMarket(db, market.id, 'no',
          `${homeTeam} ${event.winner === 'draw' ? 'drew' : 'lost'} ${event.home_score}-${event.away_score} vs ${awayTeam}`)
        resolved++
      }
    }
  } catch (err: any) {
    reportError('execution', 'sports_oracle_sweep', 'oracle', 'Sports oracle sweep failed', err)
  }
  return resolved
}

// ─── EXPIRED MARKET SWEEP ────────────────────────────────────────────────────
// Markets past their resolution date with no oracle resolution get flagged

export async function sweepExpiredMarkets(db: Pool): Promise<number> {
  let flagged = 0
  try {
    const expired = await db.query(
      `SELECT id, question, resolution_date, resolution_source FROM markets
       WHERE status = 'active' AND resolution_date IS NOT NULL AND resolution_date < now()
       AND resolution_source NOT IN ('coingecko', 'sports_api')
       LIMIT 20`
    )

    for (const market of expired.rows) {
      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'oracle', $1, 'expired_flagged', 'skipped', $2, now())
         ON CONFLICT DO NOTHING`,
        [market.id, `Market "${market.question.slice(0, 60)}" expired — needs manual resolution`]
      ).catch(() => {})
      flagged++
    }
  } catch {
    // Silent
  }
  return flagged
}

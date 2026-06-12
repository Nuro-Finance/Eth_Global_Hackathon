/**
 * ─── CONTENT BRAIN ───────────────────────────────────────────────────────────
 *
 * Generates social media content from market feed data.
 * Reads from market_feed_cache + execution_log to create engaging posts.
 *
 * Content Types:
 *   - Price alerts (crypto movers >3%)
 *   - Market predictions (trending Polymarket events)
 *   - Sports previews (upcoming matches with bet links)
 *   - Resolution announcements (oracle resolved a market)
 *   - Agent performance (bot earnings)
 *   - Educational (how to use AFI)
 */

import { Pool } from 'pg'

export interface PostContent {
  text: string
  hashtags: string[]
  media_url?: string
  link?: string
  platform_hint: 'short' | 'medium' | 'long' | 'video'
  category: 'crypto' | 'sports' | 'politics' | 'education' | 'announcement'
  priority: number  // 1-10, higher = more important
}

const APP_URL = process.env.AFI_APP_URL || 'https://app.nuro.finance'

export async function generateDailyContent(db: Pool): Promise<PostContent[]> {
  const posts: PostContent[] = []

  // ── Crypto Price Movers ──────────────────────────────────────────────────
  const movers = await db.query(
    `SELECT symbol, name, price_usd, price_change_24h FROM market_feed_cache
     WHERE feed_source = 'coingecko' AND ABS(price_change_24h) > 3
     ORDER BY ABS(price_change_24h) DESC LIMIT 5`
  ).catch(() => ({ rows: [] }))

  for (const coin of movers.rows) {
    const direction = parseFloat(coin.price_change_24h) > 0 ? '📈' : '📉'
    const change = parseFloat(coin.price_change_24h).toFixed(1)
    const price = parseFloat(coin.price_usd).toLocaleString('en-US', { maximumFractionDigits: 2 })
    posts.push({
      text: `${direction} ${coin.name} (${coin.symbol.toUpperCase()}) is ${change > '0' ? 'up' : 'down'} ${Math.abs(parseFloat(change))}% → $${price}\n\nThink it keeps going? Bet on it.\n\n${APP_URL}/en/dashboard/markets`,
      hashtags: ['crypto', coin.symbol.toLowerCase(), 'prediction', 'nurofinance'],
      link: `${APP_URL}/en/dashboard/markets`,
      platform_hint: 'short',
      category: 'crypto',
      priority: Math.min(10, Math.abs(parseFloat(change))),
    })
  }

  // ── Recently Resolved Markets ────────────────────────────────────────────
  const resolved = await db.query(
    `SELECT detail FROM execution_log
     WHERE entity_type = 'oracle' AND action = 'auto_resolve' AND status = 'success'
     AND created_at > now() - interval '24 hours'
     ORDER BY created_at DESC LIMIT 3`
  ).catch(() => ({ rows: [] }))

  for (const r of resolved.rows) {
    posts.push({
      text: `🏆 Market Resolved!\n\n${r.detail}\n\nWinners get paid to their vault → cash out to Visa card.\n\n${APP_URL}/en/dashboard/markets`,
      hashtags: ['prediction', 'winners', 'nurofinance'],
      link: `${APP_URL}/en/dashboard/markets`,
      platform_hint: 'medium',
      category: 'announcement',
      priority: 8,
    })
  }

  // ── Trending Polymarket Events ───────────────────────────────────────────
  const trending = await db.query(
    `SELECT question, category, total_volume, yes_pool, no_pool FROM markets
     WHERE status = 'active' AND polymarket_id IS NOT NULL
     ORDER BY total_volume DESC LIMIT 3`
  ).catch(() => ({ rows: [] }))

  for (const m of trending.rows) {
    const yesPool = parseFloat(m.yes_pool) || 1
    const noPool = parseFloat(m.no_pool) || 1
    const total = yesPool + noPool
    const yesPercent = Math.round((noPool / total) * 100)
    posts.push({
      text: `🔮 "${m.question}"\n\nYES: ${yesPercent}% | NO: ${100 - yesPercent}%\n\nBet from any of 23 chains → win → cash out to Visa.\n\n${APP_URL}/en/dashboard/markets`,
      hashtags: ['polymarket', 'prediction', m.category, 'nurofinance'],
      link: `${APP_URL}/en/dashboard/markets`,
      platform_hint: 'medium',
      category: m.category === 'sports' ? 'sports' : m.category === 'politics' ? 'politics' : 'crypto',
      priority: 7,
    })
  }

  // ── Educational Content ──────────────────────────────────────────────────
  const eduTemplates = [
    {
      text: `💡 Did you know? With AFI you can bet on predictions from ANY blockchain and cash out winnings to a real Visa card.\n\nNo other platform does this.\n\n${APP_URL}`,
      category: 'education' as const,
    },
    {
      text: `🌐 23 chains supported. 1 Visa card.\n\nDeposit USDC from Ethereum, Solana, Arbitrum, Base, Polygon — or any of 23 chains.\n\nWin a prediction → cash out to your Visa instantly.\n\n${APP_URL}`,
      category: 'education' as const,
    },
    {
      text: `🤖 Deploy an AI trading agent on Polymarket.\n\nYour bot finds high-confidence markets, places REAL trades, and sweeps profits to your Visa card.\n\nAll autonomous. All on-chain.\n\n${APP_URL}/en/dashboard/yield-agents`,
      category: 'education' as const,
    },
  ]

  // Pick one random edu post per day
  const eduIdx = new Date().getDate() % eduTemplates.length
  posts.push({
    ...eduTemplates[eduIdx],
    hashtags: ['defi', 'web3', 'nurofinance', 'omnichain'],
    link: APP_URL,
    platform_hint: 'medium',
    priority: 5,
  })

  // Sort by priority (highest first)
  posts.sort((a, b) => b.priority - a.priority)

  return posts
}

// ── Video Script Generator (for TikTok/YouTube) ───────────────────────────

export async function generateVideoScript(db: Pool): Promise<string> {
  const movers = await db.query(
    `SELECT symbol, name, price_usd, price_change_24h FROM market_feed_cache
     WHERE feed_source = 'coingecko'
     ORDER BY ABS(price_change_24h) DESC LIMIT 3`
  ).catch(() => ({ rows: [] }))

  const markets = await db.query(
    `SELECT question FROM markets WHERE status = 'active' ORDER BY total_volume DESC LIMIT 3`
  ).catch(() => ({ rows: [] }))

  let script = `[INTRO - 3 seconds]\n"Here's what's moving in crypto today."\n\n`

  for (const coin of movers.rows) {
    const dir = parseFloat(coin.price_change_24h) > 0 ? 'UP' : 'DOWN'
    script += `[SLIDE - ${coin.name}]\n"${coin.name} is ${dir} ${Math.abs(parseFloat(coin.price_change_24h)).toFixed(1)} percent, now at $${parseFloat(coin.price_usd).toLocaleString()}."\n\n`
  }

  script += `[TRANSITION]\n"Want to bet on where these are going?"\n\n`

  for (const m of markets.rows) {
    script += `[MARKET]\n"Hot market: ${m.question}"\n\n`
  }

  script += `[CTA - 3 seconds]\n"Bet from any chain. Win. Cash out to Visa. Link in bio."\n\n`
  script += `[END CARD]\napp.nuro.finance\n`

  return script
}

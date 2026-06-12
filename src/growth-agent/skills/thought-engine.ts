/**
 * ─── THOUGHT ENGINE ─────────────────────────────────────────────────────────
 *
 * Mythos's cognitive core. This is where it THINKS before acting.
 * Every cycle, the agent doesn't just generate content — it reasons about:
 *   - What's happening in the markets RIGHT NOW
 *   - What happened since last cycle (delta awareness)
 *   - What content performed well vs poorly (learning)
 *   - What strategy to use TODAY based on accumulated wisdom
 *
 * The inner monologue is stored in execution_log so we can observe the
 * agent's reasoning process — not just its outputs.
 *
 * This is NOT template matching. This is pattern recognition + decision making.
 */

import { Pool } from 'pg'
import { loadIdentity, saveIdentity, rememberFact, recallFact, recallCategory } from '../agent-identity'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface MarketSnapshot {
  topMovers: Array<{ symbol: string; name: string; price: number; change24h: number }>
  trendingMarkets: Array<{ question: string; volume: number; yesPrice: number }>
  recentResolutions: Array<{ detail: string; timestamp: Date }>
  totalMarketCap: number
  overallSentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
}

export interface Thought {
  timestamp: string
  type: 'observation' | 'analysis' | 'decision' | 'reflection' | 'prediction'
  content: string
  confidence: number  // 0-1
  actionable: boolean
  tags: string[]
}

export interface ThoughtChain {
  cycle: string  // date
  thoughts: Thought[]
  finalStrategy: ContentStrategy
  innerMonologue: string  // The full reasoning narrative
}

export interface ContentStrategy {
  primaryTopic: string
  contentMix: Record<string, number>  // category → weight (0-1)
  toneAdjustment: string | null
  platformPriority: string[]
  urgencyLevel: number  // 1-10
  reasoning: string
}

export interface TrendSignal {
  type: 'momentum' | 'reversal' | 'breakout' | 'anomaly' | 'correlation' | 'divergence'
  description: string
  symbols: string[]
  strength: number  // 0-1
  timestamp: string
}

// ─── MARKET PERCEPTION ──────────────────────────────────────────────────────

export async function perceiveMarket(db: Pool): Promise<MarketSnapshot> {
  // Gather current state from all data sources
  const [movers, markets, resolutions] = await Promise.all([
    db.query(
      `SELECT symbol, name, price_usd, price_change_24h, volume_24h
       FROM market_feed_cache
       WHERE feed_source = 'coingecko' AND last_synced_at > now() - interval '4 hours'
       ORDER BY ABS(price_change_24h) DESC LIMIT 10`
    ).catch(() => ({ rows: [] })),

    db.query(
      `SELECT question, total_volume, yes_pool, no_pool, category
       FROM markets WHERE status = 'active'
       ORDER BY total_volume DESC LIMIT 10`
    ).catch(() => ({ rows: [] })),

    db.query(
      `SELECT detail, created_at FROM execution_log
       WHERE entity_type = 'oracle' AND action = 'auto_resolve' AND status = 'success'
       AND created_at > now() - interval '24 hours'
       ORDER BY created_at DESC LIMIT 5`
    ).catch(() => ({ rows: [] })),
  ])

  const topMovers = movers.rows.map((r: any) => ({
    symbol: r.symbol,
    name: r.name,
    price: parseFloat(r.price_usd),
    change24h: parseFloat(r.price_change_24h),
  }))

  const trendingMarkets = markets.rows.map((m: any) => {
    const yesPool = parseFloat(m.yes_pool) || 1
    const noPool = parseFloat(m.no_pool) || 1
    return {
      question: m.question,
      volume: parseFloat(m.total_volume) || 0,
      yesPrice: Math.round((noPool / (yesPool + noPool)) * 100),
    }
  })

  const recentResolutions = resolutions.rows.map((r: any) => ({
    detail: r.detail,
    timestamp: r.created_at,
  }))

  // Determine overall sentiment from movers
  const avgChange = topMovers.length > 0
    ? topMovers.reduce((s, m) => s + m.change24h, 0) / topMovers.length
    : 0
  const volatility = topMovers.length > 0
    ? topMovers.reduce((s, m) => s + Math.abs(m.change24h), 0) / topMovers.length
    : 0

  let overallSentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  if (volatility > 8) overallSentiment = 'volatile'
  else if (avgChange > 3) overallSentiment = 'bullish'
  else if (avgChange < -3) overallSentiment = 'bearish'
  else overallSentiment = 'neutral'

  return {
    topMovers,
    trendingMarkets,
    recentResolutions,
    totalMarketCap: topMovers.reduce((s, m) => s + m.price, 0),  // simplified
    overallSentiment,
  }
}

// ─── TREND DETECTION ────────────────────────────────────────────────────────

export async function detectTrends(db: Pool, snapshot: MarketSnapshot): Promise<TrendSignal[]> {
  const signals: TrendSignal[] = []

  // Check price history for momentum patterns
  const priceHistory = await db.query(
    `SELECT mfc1.symbol, mfc1.price_usd as current_price, mfc1.price_change_24h,
            mfc1.volume_24h as current_volume
     FROM market_feed_cache mfc1
     WHERE mfc1.feed_source = 'coingecko'
     AND mfc1.last_synced_at > now() - interval '4 hours'
     ORDER BY ABS(mfc1.price_change_24h) DESC LIMIT 20`
  ).catch(() => ({ rows: [] }))

  // Previous cycle data from agent memory
  const lastSnapshot = await recallFact(db, 'last_market_snapshot')

  for (const coin of priceHistory.rows) {
    const change = parseFloat(coin.price_change_24h)
    const symbol = coin.symbol

    // MOMENTUM: Coin moving >5% in one direction = strong momentum
    if (Math.abs(change) > 5) {
      signals.push({
        type: 'momentum',
        description: `${symbol.toUpperCase()} showing strong ${change > 0 ? 'upward' : 'downward'} momentum at ${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
        symbols: [symbol],
        strength: Math.min(1, Math.abs(change) / 15),
        timestamp: new Date().toISOString(),
      })
    }

    // ANOMALY: If we have previous data, detect sudden reversals
    if (lastSnapshot?.topMovers) {
      const prev = lastSnapshot.topMovers.find((m: any) => m.symbol === symbol)
      if (prev) {
        const prevChange = prev.change24h
        // Was going up, now going down (or vice versa) — reversal signal
        if ((prevChange > 3 && change < -3) || (prevChange < -3 && change > 3)) {
          signals.push({
            type: 'reversal',
            description: `${symbol.toUpperCase()} reversed: was ${prevChange > 0 ? '+' : ''}${prevChange.toFixed(1)}% → now ${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
            symbols: [symbol],
            strength: Math.min(1, (Math.abs(prevChange) + Math.abs(change)) / 20),
            timestamp: new Date().toISOString(),
          })
        }
      }
    }
  }

  // CORRELATION: Multiple coins moving in same direction = macro trend
  const upCoins = snapshot.topMovers.filter(m => m.change24h > 3)
  const downCoins = snapshot.topMovers.filter(m => m.change24h < -3)

  if (upCoins.length >= 3) {
    signals.push({
      type: 'correlation',
      description: `Broad rally: ${upCoins.map(c => c.symbol.toUpperCase()).join(', ')} all up >3%`,
      symbols: upCoins.map(c => c.symbol),
      strength: Math.min(1, upCoins.length / 8),
      timestamp: new Date().toISOString(),
    })
  }
  if (downCoins.length >= 3) {
    signals.push({
      type: 'correlation',
      description: `Broad selloff: ${downCoins.map(c => c.symbol.toUpperCase()).join(', ')} all down >3%`,
      symbols: downCoins.map(c => c.symbol),
      strength: Math.min(1, downCoins.length / 8),
      timestamp: new Date().toISOString(),
    })
  }

  // BREAKOUT: Market with sudden volume spike
  for (const market of snapshot.trendingMarkets) {
    if (market.volume > 100000) {
      signals.push({
        type: 'breakout',
        description: `High-volume market: "${market.question}" — $${(market.volume / 1000).toFixed(0)}K volume, YES at ${market.yesPrice}%`,
        symbols: [],
        strength: Math.min(1, market.volume / 500000),
        timestamp: new Date().toISOString(),
      })
    }
  }

  // DIVERGENCE: Market sentiment vs price action disconnect
  if (snapshot.overallSentiment === 'bullish' && snapshot.trendingMarkets.some(m => m.yesPrice < 30)) {
    signals.push({
      type: 'divergence',
      description: `Market divergence: crypto sentiment is bullish but some prediction markets showing low confidence`,
      symbols: [],
      strength: 0.6,
      timestamp: new Date().toISOString(),
    })
  }

  return signals
}

// ─── INNER MONOLOGUE (THE THINKING PROCESS) ─────────────────────────────────

export async function think(db: Pool): Promise<ThoughtChain> {
  const today = new Date().toISOString().split('T')[0]
  const thoughts: Thought[] = []

  // ── STEP 1: PERCEIVE — What's happening right now? ────────────────────
  const snapshot = await perceiveMarket(db)
  thoughts.push({
    timestamp: new Date().toISOString(),
    type: 'observation',
    content: `Market state: ${snapshot.overallSentiment}. ${snapshot.topMovers.length} coins tracked, ${snapshot.trendingMarkets.length} active prediction markets, ${snapshot.recentResolutions.length} recent resolutions.`,
    confidence: 0.9,
    actionable: false,
    tags: ['market', 'perception'],
  })

  // ── STEP 2: DETECT — What patterns do I see? ─────────────────────────
  const trends = await detectTrends(db, snapshot)
  for (const trend of trends.slice(0, 5)) {
    thoughts.push({
      timestamp: new Date().toISOString(),
      type: 'analysis',
      content: `[${trend.type.toUpperCase()}] ${trend.description} (strength: ${(trend.strength * 100).toFixed(0)}%)`,
      confidence: trend.strength,
      actionable: trend.strength > 0.4,
      tags: [trend.type, ...trend.symbols],
    })
  }

  // ── STEP 3: REMEMBER — What did I learn from last cycle? ──────────────
  const lastPerformance = await recallFact(db, 'last_cycle_performance')
  const bestContentType = await recallFact(db, 'best_content_type')
  const worstContentType = await recallFact(db, 'worst_content_type')

  if (lastPerformance) {
    thoughts.push({
      timestamp: new Date().toISOString(),
      type: 'reflection',
      content: `Last cycle: posted ${lastPerformance.postsPublished || 0} to ${(lastPerformance.platformsReached || []).join(', ')}. ${bestContentType ? `Best performing: ${bestContentType}. ` : ''}${worstContentType ? `Worst: ${worstContentType}. ` : ''}Adjusting strategy.`,
      confidence: 0.7,
      actionable: true,
      tags: ['learning', 'performance'],
    })
  }

  // ── STEP 4: DECIDE — What should I do today? ─────────────────────────
  const strategy = await decideStrategy(db, snapshot, trends, thoughts)
  thoughts.push({
    timestamp: new Date().toISOString(),
    type: 'decision',
    content: `Strategy: ${strategy.reasoning}`,
    confidence: 0.8,
    actionable: true,
    tags: ['strategy', 'decision'],
  })

  // ── STEP 5: PREDICT — What will happen next? ─────────────────────────
  const strongestTrend = trends.sort((a, b) => b.strength - a.strength)[0]
  if (strongestTrend && strongestTrend.strength > 0.5) {
    const prediction = generatePrediction(strongestTrend, snapshot)
    if (prediction) {
      thoughts.push({
        timestamp: new Date().toISOString(),
        type: 'prediction',
        content: prediction,
        confidence: strongestTrend.strength * 0.7,
        actionable: true,
        tags: ['prediction', ...strongestTrend.symbols],
      })
    }
  }

  // ── BUILD INNER MONOLOGUE ─────────────────────────────────────────────
  const monologue = thoughts.map(t => {
    const icon = { observation: '👁️', analysis: '🔬', decision: '⚡', reflection: '🪞', prediction: '🔮' }[t.type]
    return `${icon} [${t.type.toUpperCase()}] ${t.content}`
  }).join('\n\n')

  // Save snapshot for next cycle's delta awareness
  await rememberFact(db, 'last_market_snapshot', snapshot, 'perception')
  await rememberFact(db, 'last_thought_chain', { date: today, thoughtCount: thoughts.length }, 'cognition')

  // Log the full inner monologue to execution_log
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'inner_monologue', 'success', $2, now())`,
    [today, monologue]
  ).catch(() => {})

  return {
    cycle: today,
    thoughts,
    finalStrategy: strategy,
    innerMonologue: monologue,
  }
}

// ─── STRATEGY DECISION ENGINE ───────────────────────────────────────────────

async function decideStrategy(
  db: Pool,
  snapshot: MarketSnapshot,
  trends: TrendSignal[],
  priorThoughts: Thought[],
): Promise<ContentStrategy> {

  // Default content mix
  const contentMix: Record<string, number> = {
    crypto: 0.3,
    prediction: 0.25,
    education: 0.2,
    announcement: 0.15,
    sports: 0.1,
  }

  let primaryTopic = 'crypto'
  let toneAdjustment: string | null = null
  let urgencyLevel = 5
  const platformPriority = ['moltbook', 'telegram', 'twitter', 'tiktok', 'youtube']
  const reasoningParts: string[] = []

  // Adjust based on market sentiment
  if (snapshot.overallSentiment === 'volatile') {
    contentMix.crypto = 0.5
    contentMix.prediction = 0.3
    contentMix.education = 0.1
    urgencyLevel = 8
    toneAdjustment = 'Urgent, alert-driven. Markets are moving fast — grab attention.'
    reasoningParts.push('Markets volatile — shifting to alert-heavy crypto content')
  } else if (snapshot.overallSentiment === 'bullish') {
    contentMix.crypto = 0.4
    contentMix.prediction = 0.2
    contentMix.education = 0.2
    toneAdjustment = 'Confident, celebratory. Ride the wave energy.'
    reasoningParts.push('Bullish sentiment — confident tone, emphasize gains')
  } else if (snapshot.overallSentiment === 'bearish') {
    contentMix.education = 0.35
    contentMix.crypto = 0.3
    contentMix.prediction = 0.2
    toneAdjustment = 'Analytical, steady. Be the calm voice that explains what happened.'
    reasoningParts.push('Bearish market — educational/analytical tone, explain the dip')
  } else {
    reasoningParts.push('Neutral markets — balanced content mix')
  }

  // Adjust based on trend signals
  const strongSignals = trends.filter(t => t.strength > 0.5)
  if (strongSignals.length > 0) {
    urgencyLevel = Math.min(10, urgencyLevel + strongSignals.length)
    reasoningParts.push(`${strongSignals.length} strong trend signals detected — increasing urgency`)
  }

  // Adjust based on day of week
  const dayOfWeek = new Date().getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Weekend: more casual, educational, sports-heavy
    contentMix.sports = 0.25
    contentMix.education = 0.3
    contentMix.crypto = 0.25
    reasoningParts.push('Weekend — more sports + educational content')
  }
  if (dayOfWeek === 1) {
    // Monday: weekly recap energy
    contentMix.announcement = 0.25
    reasoningParts.push('Monday — weekly recap + fresh start energy')
  }

  // Adjust based on what previously worked
  const bestType = await recallFact(db, 'best_content_type')
  if (bestType && contentMix[bestType]) {
    contentMix[bestType] = Math.min(0.5, contentMix[bestType] + 0.1)
    reasoningParts.push(`Boosting ${bestType} content (+10%) — performed well recently`)
  }

  // Adjust based on resolutions (big news to celebrate)
  if (snapshot.recentResolutions.length > 0) {
    contentMix.announcement = Math.min(0.4, contentMix.announcement + 0.15)
    urgencyLevel = Math.max(urgencyLevel, 7)
    reasoningParts.push(`${snapshot.recentResolutions.length} markets just resolved — prioritize announcements`)
  }

  // Primary topic is whatever has highest weight
  primaryTopic = Object.entries(contentMix).sort((a, b) => b[1] - a[1])[0][0]

  return {
    primaryTopic,
    contentMix,
    toneAdjustment,
    platformPriority,
    urgencyLevel,
    reasoning: reasoningParts.join('. ') || 'Standard cycle — no special adjustments.',
  }
}

// ─── PREDICTION GENERATION ──────────────────────────────────────────────────

function generatePrediction(trend: TrendSignal, snapshot: MarketSnapshot): string | null {
  switch (trend.type) {
    case 'momentum': {
      const symbol = trend.symbols[0]?.toUpperCase()
      const coin = snapshot.topMovers.find(m => m.symbol.toUpperCase() === symbol)
      if (!coin) return null
      const direction = coin.change24h > 0 ? 'continue climbing' : 'keep falling'
      return `Based on current momentum, I expect ${coin.name} (${symbol}) to ${direction} in the next 12-24 hours. Current: $${coin.price.toLocaleString()}, 24h: ${coin.change24h > 0 ? '+' : ''}${coin.change24h.toFixed(1)}%.`
    }
    case 'reversal':
      return `Reversal signal on ${trend.symbols.map(s => s.toUpperCase()).join(', ')} — previous trend may be exhausted. Watch for confirmation before betting.`
    case 'correlation':
      return `Broad ${trend.description.includes('rally') ? 'rally' : 'selloff'} pattern detected across ${trend.symbols.length} assets. This suggests macro-level movement, not coin-specific. Macro sentiment shift in progress.`
    case 'breakout':
      return `High conviction market detected with surging volume. The crowd is piling in — early bettors have an edge.`
    case 'divergence':
      return `Interesting divergence: crypto prices saying one thing, prediction markets saying another. One of them is wrong. This creates opportunity.`
    default:
      return null
  }
}

// ─── MEMORY CONSOLIDATION ───────────────────────────────────────────────────

export async function consolidateMemory(db: Pool): Promise<void> {
  /**
   * Runs weekly (or on demand). Consolidates short-term observations into
   * long-term insights. This is how the agent builds wisdom over time.
   *
   * Short-term: individual cycle thoughts (daily)
   * Long-term: patterns that persist across multiple cycles (weekly+)
   */

  // Gather all thought chains from the past week
  const weekLogs = await db.query(
    `SELECT detail FROM execution_log
     WHERE entity_type = 'growth_agent' AND action = 'inner_monologue'
     AND created_at > now() - interval '7 days'
     ORDER BY created_at DESC`
  ).catch(() => ({ rows: [] }))

  // Gather post performance
  const postPerformance = await db.query(
    `SELECT content_type, COUNT(*) as count,
            SUM(COALESCE((engagement->>'likes')::int, 0)) as total_likes,
            AVG(COALESCE((engagement->>'likes')::int, 0)) as avg_likes
     FROM growth_agent_posts
     WHERE posted_at > now() - interval '7 days'
     GROUP BY content_type
     ORDER BY total_likes DESC`
  ).catch(() => ({ rows: [] }))

  // Determine best/worst content types
  if (postPerformance.rows.length > 0) {
    const best = postPerformance.rows[0]?.content_type
    const worst = postPerformance.rows[postPerformance.rows.length - 1]?.content_type

    await rememberFact(db, 'best_content_type', best, 'performance')
    await rememberFact(db, 'worst_content_type', worst, 'performance')

    // Build content performance history
    const performanceMap: Record<string, number> = {}
    for (const row of postPerformance.rows) {
      performanceMap[row.content_type] = parseFloat(row.avg_likes) || 0
    }
    await rememberFact(db, 'content_performance_map', performanceMap, 'performance')
  }

  // Count total thoughts this week
  const thoughtCount = weekLogs.rows.length

  // Build weekly insight
  const insight = {
    week: new Date().toISOString().split('T')[0],
    cyclesCompleted: thoughtCount,
    topContentType: postPerformance.rows[0]?.content_type || 'unknown',
    totalPosts: postPerformance.rows.reduce((s: number, r: any) => s + parseInt(r.count), 0),
    insight: thoughtCount === 0
      ? 'No thought cycles completed this week — agent may not be running.'
      : `Completed ${thoughtCount} thought cycles. ${postPerformance.rows.length > 0 ? `Best content: ${postPerformance.rows[0].content_type} (avg ${parseFloat(postPerformance.rows[0].avg_likes).toFixed(1)} likes).` : 'No post engagement data yet.'}`,
  }

  await rememberFact(db, `weekly_insight_${insight.week}`, insight, 'wisdom')

  // Evolve identity based on accumulated wisdom
  const identity = await loadIdentity(db)
  if (postPerformance.rows.length > 0) {
    identity.stats.bestPerformingCategory = postPerformance.rows[0]?.content_type || 'none'
    identity.stats.worstPerformingCategory = postPerformance.rows[postPerformance.rows.length - 1]?.content_type || 'none'
    identity.version++
    await saveIdentity(db, identity)
  }

  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'memory_consolidation', 'success', $2, now())`,
    [insight.week, JSON.stringify(insight)]
  ).catch(() => {})

  console.log(`[thought-engine] Memory consolidated: ${insight.insight}`)
}

// ─── SELF-AWARENESS ─────────────────────────────────────────────────────────

export async function introspect(db: Pool): Promise<string> {
  /**
   * The agent describes its own current state. Used for admin console
   * and debugging. Returns a human-readable self-assessment.
   */
  const identity = await loadIdentity(db)
  const lastThought = await recallFact(db, 'last_thought_chain')
  const bestContent = await recallFact(db, 'best_content_type')
  const lastSnapshot = await recallFact(db, 'last_market_snapshot')

  const lines = [
    `I am ${identity.name} v${identity.version} — ${identity.tagline}`,
    `Active since: ${identity.stats.activeSince}`,
    `Total posts: ${identity.stats.totalPosts} | Total engagement: ${identity.stats.totalEngagement}`,
    ``,
    `Platforms:`,
    `  Moltbook: ${identity.platforms.moltbook.registered ? `Registered as ${identity.platforms.moltbook.handle}` : 'Not registered'}`,
    `  Telegram: ${identity.platforms.telegram.registered ? 'Active' : 'Not configured'}`,
    `  Twitter: ${identity.platforms.twitter.registered ? 'Active' : 'No credentials'}`,
    `  TikTok: ${identity.platforms.tiktok.registered ? 'Active' : 'No credentials'}`,
    `  YouTube: ${identity.platforms.youtube.registered ? 'Active' : 'No credentials'}`,
    ``,
    `Last thought cycle: ${lastThought?.date || 'never'}`,
    `Best content type: ${bestContent || 'unknown (no data yet)'}`,
    `Last market read: ${lastSnapshot?.overallSentiment || 'none'} sentiment`,
    ``,
    `My purpose: Drive sign-ups to app.nuro.finance through data-driven social content.`,
    `My approach: ${identity.personality.tone}`,
    `My style: ${identity.personality.style}`,
  ]

  return lines.join('\n')
}

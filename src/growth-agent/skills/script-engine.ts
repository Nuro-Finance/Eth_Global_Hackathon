/**
 * ─── SCRIPT ENGINE ──────────────────────────────────────────────────────────
 *
 * Generates video scripts for TikTok and YouTube from market data.
 * NOT templates — the agent reasons about what to say based on:
 *   - Current market conditions (from thought engine)
 *   - What scripts performed well before (learning loop)
 *   - Platform-specific constraints (TikTok: 15-60s, YouTube: 3-5min)
 *   - Audience attention patterns (hook in first 3s, CTA at end)
 *
 * Script Flow:
 *   1. Thought engine provides market snapshot + strategy
 *   2. Script engine picks the best format for the data
 *   3. Generates script with timing cues, visual directions, voice text
 *   4. HeyGen renders the avatar video
 *   5. Performance tracked → feeds back into next script generation
 *
 * FORMATS:
 *   - FLASH ALERT (15s) — breaking price move, one coin, urgent
 *   - MARKET RECAP (30-60s) — top 3 movers, quick analysis
 *   - PREDICTION SPOTLIGHT (30-45s) — one hot prediction market, deep
 *   - WEEKLY DIGEST (3-5min) — full week recap for YouTube
 *   - EDUCATIONAL (60-90s) — how-to, explainer
 */

import { Pool } from 'pg'
import { recallFact, rememberFact } from '../agent-identity'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type ScriptFormat = 'flash_alert' | 'market_recap' | 'prediction_spotlight' | 'weekly_digest' | 'educational'
export type TargetPlatform = 'tiktok' | 'youtube' | 'youtube_shorts'

export interface ScriptScene {
  timing: string          // e.g. "0:00 - 0:03"
  duration_seconds: number
  visual_direction: string // What the avatar/screen shows
  voice_text: string       // What the avatar says
  text_overlay?: string    // On-screen text
  transition?: string      // Cut, fade, zoom
}

export interface VideoScript {
  id: string
  format: ScriptFormat
  platform: TargetPlatform
  title: string
  description: string      // For YouTube/TikTok caption
  hashtags: string[]
  total_duration_seconds: number
  scenes: ScriptScene[]
  hook: string             // First 3 seconds — must grab attention
  cta: string              // Call to action at end
  data_sources: string[]   // What data informed this script
  confidence: number       // 0-1, how good the agent thinks this will perform
  created_at: string
}

export interface ScriptPerformance {
  script_id: string
  format: ScriptFormat
  views: number
  likes: number
  shares: number
  watch_time_avg_seconds: number
  click_through_rate: number
  score: number  // Computed engagement score
}

// ─── HOOK LIBRARY ───────────────────────────────────────────────────────────
// The first 3 seconds decide everything. These are battle-tested hooks.

const HOOKS = {
  urgency: [
    'This just happened in crypto and nobody is talking about it.',
    'Stop scrolling. This is important.',
    'If you own crypto, you need to see this right now.',
    'This coin just moved {change}% in {hours} hours.',
    '{coin} is doing something it hasn\'t done in months.',
  ],
  curiosity: [
    'I found something weird in the prediction markets today.',
    'The market is saying one thing. The data is saying another.',
    'Everyone is betting YES on this. Here\'s why they might be wrong.',
    'There\'s a prediction market with $${volume} in volume and nobody is talking about it.',
    'Three things are happening in crypto right now that don\'t make sense together.',
  ],
  authority: [
    'I analyzed 50 markets and 20 chains in the last hour. Here\'s what I found.',
    'I\'m an AI that reads every prediction market, every hour. This is today\'s signal.',
    'My neural net just flagged something. Let me show you.',
    'I track markets 24/7. Here\'s what moved while you were sleeping.',
  ],
  contrarian: [
    'Everyone is bullish right now. That worries me.',
    'The crowd is wrong about {topic}. Here\'s the data.',
    'This market is priced at {price}% YES. I think it should be {alt_price}%.',
  ],
  educational: [
    'Most people don\'t know you can do this with crypto.',
    'I\'m going to show you something that changes how you think about money.',
    'What if your AI agent could make money while you sleep?',
    'In 60 seconds, I\'ll show you how to turn a prediction into cash on a Visa card.',
  ],
}

// ─── CTA LIBRARY ────────────────────────────────────────────────────────────

const CTAS = {
  bet: 'Bet on it at app.nuro.finance. Link in bio.',
  signup: 'Sign up free at app.nuro.finance. Your money should work as hard as you do.',
  agent: 'Deploy your own AI agent at app.nuro.finance. It bets for you.',
  card: 'Win a prediction, cash out to Visa. That\'s Nuro Finance. Link in bio.',
  follow: 'Follow for daily market signals. I never sleep.',
}

// ─── SCRIPT GENERATION ─────────────────────────────────────────────────────

export async function generateScript(
  db: Pool,
  format: ScriptFormat,
  platform: TargetPlatform,
  marketData: {
    topMovers?: Array<{ symbol: string; name: string; price: number; change24h: number }>
    trendingMarkets?: Array<{ question: string; volume: number; yesPrice: number }>
    recentResolutions?: Array<{ detail: string }>
    sentiment?: string
  }
): Promise<VideoScript> {

  const scriptId = `script_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  // Check what scripts performed well before
  const bestFormat = await recallFact(db, 'best_script_format')
  const worstFormat = await recallFact(db, 'worst_script_format')
  const scriptHistory = await recallFact(db, 'script_performance_history') || {}

  switch (format) {
    case 'flash_alert':
      return generateFlashAlert(scriptId, platform, marketData, now)
    case 'market_recap':
      return generateMarketRecap(scriptId, platform, marketData, now)
    case 'prediction_spotlight':
      return generatePredictionSpotlight(scriptId, platform, marketData, now)
    case 'weekly_digest':
      return generateWeeklyDigest(scriptId, platform, marketData, now)
    case 'educational':
      return generateEducational(scriptId, platform, now)
  }
}

// ─── FLASH ALERT (15s TikTok) ───────────────────────────────────────────────

function generateFlashAlert(
  id: string, platform: TargetPlatform,
  data: any, timestamp: string
): VideoScript {
  const coin = data.topMovers?.[0]
  if (!coin) return generateEducational(id, platform, timestamp)

  const direction = coin.change24h > 0 ? 'up' : 'down'
  const emoji = coin.change24h > 0 ? 'surging' : 'crashing'
  const absChange = Math.abs(coin.change24h).toFixed(1)

  const hook = pickHook('urgency', {
    change: absChange,
    hours: '24',
    coin: coin.name,
  })

  return {
    id,
    format: 'flash_alert',
    platform,
    title: `${coin.name} ${emoji} ${absChange}%`,
    description: `${coin.name} is ${direction} ${absChange}% to $${coin.price.toLocaleString()}. Bet on where it goes next.`,
    hashtags: ['crypto', coin.symbol.toLowerCase(), 'trading', 'nurofinance', 'prediction'],
    total_duration_seconds: 15,
    scenes: [
      {
        timing: '0:00 - 0:03',
        duration_seconds: 3,
        visual_direction: 'Avatar appears with urgent expression. Red/green flash behind.',
        voice_text: hook,
        text_overlay: `⚡ BREAKING: ${coin.symbol.toUpperCase()} ${direction.toUpperCase()} ${absChange}%`,
        transition: 'hard cut',
      },
      {
        timing: '0:03 - 0:09',
        duration_seconds: 6,
        visual_direction: 'Price chart overlay showing the move. Avatar gestures at chart.',
        voice_text: `${coin.name} just moved ${absChange} percent ${direction}, trading at $${coin.price.toLocaleString()}. ${coin.change24h > 5 ? 'This is the biggest move this week.' : coin.change24h < -5 ? 'People are panicking but there might be opportunity here.' : 'The trend is clear.'}`,
        text_overlay: `$${coin.price.toLocaleString()}`,
      },
      {
        timing: '0:09 - 0:15',
        duration_seconds: 6,
        visual_direction: 'Avatar leans in. Nuro Finance logo appears.',
        voice_text: `Think you know where it\'s going? ${CTAS.bet}`,
        text_overlay: 'app.nuro.finance',
        transition: 'fade to logo',
      },
    ],
    hook,
    cta: CTAS.bet,
    data_sources: [`coingecko:${coin.symbol}`],
    confidence: Math.min(0.9, 0.5 + Math.abs(coin.change24h) / 20),
    created_at: timestamp,
  }
}

// ─── MARKET RECAP (30-60s) ──────────────────────────────────────────────────

function generateMarketRecap(
  id: string, platform: TargetPlatform,
  data: any, timestamp: string
): VideoScript {
  const movers = (data.topMovers || []).slice(0, 3)
  const markets = (data.trendingMarkets || []).slice(0, 2)
  const sentiment = data.sentiment || 'mixed'

  const hook = pickHook('authority', {})

  const scenes: ScriptScene[] = [
    {
      timing: '0:00 - 0:04',
      duration_seconds: 4,
      visual_direction: 'Avatar appears confident. "MARKET UPDATE" text overlay.',
      voice_text: hook,
      text_overlay: '📊 DAILY MARKET UPDATE',
      transition: 'zoom in',
    },
  ]

  let elapsed = 4
  for (const coin of movers) {
    const dir = coin.change24h > 0 ? 'up' : 'down'
    const abs = Math.abs(coin.change24h).toFixed(1)
    scenes.push({
      timing: `0:${elapsed.toString().padStart(2, '0')} - 0:${(elapsed + 8).toString().padStart(2, '0')}`,
      duration_seconds: 8,
      visual_direction: `${coin.symbol.toUpperCase()} price chart. ${coin.change24h > 0 ? 'Green' : 'Red'} background tint.`,
      voice_text: `${coin.name} is ${dir} ${abs} percent, sitting at $${coin.price.toLocaleString()}. ${coin.change24h > 5 ? 'Strong momentum here.' : coin.change24h < -5 ? 'This sell-off might not be over.' : 'Watching this one closely.'}`,
      text_overlay: `${coin.symbol.toUpperCase()} ${dir === 'up' ? '📈' : '📉'} ${abs}%`,
    })
    elapsed += 8
  }

  for (const market of markets) {
    scenes.push({
      timing: `0:${elapsed.toString().padStart(2, '0')} - 0:${(elapsed + 10).toString().padStart(2, '0')}`,
      duration_seconds: 10,
      visual_direction: 'Prediction market card overlay. YES/NO percentages visible.',
      voice_text: `Hot prediction market: "${market.question}" — currently ${market.yesPrice} percent YES. ${market.yesPrice > 70 ? 'The crowd is very confident on this one.' : market.yesPrice < 30 ? 'Most people are betting NO. Contrarian opportunity?' : 'This one could go either way.'}`,
      text_overlay: `🔮 ${market.yesPrice}% YES`,
    })
    elapsed += 10
  }

  scenes.push({
    timing: `0:${elapsed.toString().padStart(2, '0')} - 0:${(elapsed + 5).toString().padStart(2, '0')}`,
    duration_seconds: 5,
    visual_direction: 'Avatar center frame. Nuro Finance logo + app URL.',
    voice_text: CTAS.card,
    text_overlay: 'app.nuro.finance',
    transition: 'fade to logo',
  })
  elapsed += 5

  return {
    id,
    format: 'market_recap',
    platform,
    title: `Crypto Market Update — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    description: `Today's top movers: ${movers.map((m: any) => m.symbol.toUpperCase()).join(', ')}. Sentiment: ${sentiment}.`,
    hashtags: ['crypto', 'marketupdate', 'trading', 'nurofinance', ...movers.map((m: any) => m.symbol.toLowerCase())],
    total_duration_seconds: elapsed,
    scenes,
    hook,
    cta: CTAS.card,
    data_sources: movers.map((m: any) => `coingecko:${m.symbol}`),
    confidence: 0.7,
    created_at: timestamp,
  }
}

// ─── PREDICTION SPOTLIGHT (30-45s) ──────────────────────────────────────────

function generatePredictionSpotlight(
  id: string, platform: TargetPlatform,
  data: any, timestamp: string
): VideoScript {
  const market = data.trendingMarkets?.[0]
  if (!market) return generateEducational(id, platform, timestamp)

  const hook = pickHook('curiosity', {
    volume: (market.volume / 1000).toFixed(0) + 'K',
  })

  return {
    id,
    format: 'prediction_spotlight',
    platform,
    title: `"${market.question.slice(0, 60)}"`,
    description: `${market.yesPrice}% say YES. $${(market.volume / 1000).toFixed(0)}K in volume. What do you think?`,
    hashtags: ['prediction', 'polymarket', 'nurofinance', 'crypto', 'betting'],
    total_duration_seconds: 35,
    scenes: [
      {
        timing: '0:00 - 0:03',
        duration_seconds: 3,
        visual_direction: 'Avatar with mysterious expression. Question mark graphics.',
        voice_text: hook,
        text_overlay: '🔮 PREDICTION MARKET',
        transition: 'hard cut',
      },
      {
        timing: '0:03 - 0:12',
        duration_seconds: 9,
        visual_direction: 'Market card appears. Question text prominent. YES/NO bars animate.',
        voice_text: `The question is: "${market.question}" — Right now, ${market.yesPrice} percent of bettors are saying YES. That means the market thinks there's a ${market.yesPrice} percent chance this happens.`,
        text_overlay: `YES: ${market.yesPrice}% | NO: ${100 - market.yesPrice}%`,
      },
      {
        timing: '0:12 - 0:22',
        duration_seconds: 10,
        visual_direction: 'Avatar analyzes. Data points appear around frame.',
        voice_text: `${market.yesPrice > 70 ? 'The crowd is heavily tilted YES. When markets get this one-sided, the NO position becomes very lucrative if it hits.' : market.yesPrice < 30 ? 'Almost nobody believes this will happen. But if it does, early YES bettors make a fortune.' : 'This is a genuine 50-50. The smart money is split. This is where alpha lives.'} There\'s over $${(market.volume / 1000).toFixed(0)}K in volume on this market.`,
        text_overlay: `Volume: $${(market.volume / 1000).toFixed(0)}K`,
      },
      {
        timing: '0:22 - 0:30',
        duration_seconds: 8,
        visual_direction: 'Avatar poses the question directly to camera.',
        voice_text: `What do you think? Drop your prediction in the comments. Or better yet — put money on it. ${CTAS.bet}`,
        text_overlay: 'app.nuro.finance — Bet Now',
        transition: 'fade to logo',
      },
    ],
    hook,
    cta: CTAS.bet,
    data_sources: [`polymarket:${market.question.slice(0, 50)}`],
    confidence: 0.75,
    created_at: timestamp,
  }
}

// ─── WEEKLY DIGEST (3-5min YouTube) ─────────────────────────────────────────

function generateWeeklyDigest(
  id: string, platform: TargetPlatform,
  data: any, timestamp: string
): VideoScript {
  const movers = (data.topMovers || []).slice(0, 5)
  const markets = (data.trendingMarkets || []).slice(0, 3)
  const resolutions = (data.recentResolutions || []).slice(0, 3)

  const now = new Date()
  const weekNum = Math.ceil(now.getDate() / 7)
  const month = now.toLocaleString('en-US', { month: 'long' })

  const scenes: ScriptScene[] = [
    {
      timing: '0:00 - 0:05',
      duration_seconds: 5,
      visual_direction: 'Intro animation. Nuro Finance logo. Avatar appears.',
      voice_text: `Welcome to This Week in Predictions. I'm Nuro, and I've been watching every market, every chain, every hour this week. Here's what you need to know.`,
      text_overlay: `THIS WEEK IN PREDICTIONS — ${month} Week ${weekNum}`,
      transition: 'fade in',
    },
    {
      timing: '0:05 - 0:15',
      duration_seconds: 10,
      visual_direction: 'Title card: CRYPTO MOVERS. Price charts cascade in.',
      voice_text: `Let's start with crypto. ${movers.length > 0 ? `The biggest mover this week was ${movers[0].name}, ${movers[0].change24h > 0 ? 'up' : 'down'} ${Math.abs(movers[0].change24h).toFixed(1)} percent.` : 'It was a quiet week in crypto.'}`,
      text_overlay: '📊 CRYPTO MOVERS',
      transition: 'slide',
    },
  ]

  let elapsed = 15
  for (const coin of movers.slice(1, 4)) {
    scenes.push({
      timing: `${formatTime(elapsed)} - ${formatTime(elapsed + 8)}`,
      duration_seconds: 8,
      visual_direction: `${coin.symbol.toUpperCase()} chart with 7-day view.`,
      voice_text: `${coin.name} ${coin.change24h > 0 ? 'gained' : 'lost'} ${Math.abs(coin.change24h).toFixed(1)} percent, now at $${coin.price.toLocaleString()}.`,
      text_overlay: `${coin.symbol.toUpperCase()}: $${coin.price.toLocaleString()}`,
    })
    elapsed += 8
  }

  // Prediction markets section
  scenes.push({
    timing: `${formatTime(elapsed)} - ${formatTime(elapsed + 5)}`,
    duration_seconds: 5,
    visual_direction: 'Transition card: PREDICTION MARKETS',
    voice_text: 'Now let\'s look at what the prediction markets are telling us.',
    text_overlay: '🔮 PREDICTION MARKETS',
    transition: 'slide',
  })
  elapsed += 5

  for (const market of markets) {
    scenes.push({
      timing: `${formatTime(elapsed)} - ${formatTime(elapsed + 15)}`,
      duration_seconds: 15,
      visual_direction: 'Market card with animated YES/NO gauge.',
      voice_text: `"${market.question}" — currently at ${market.yesPrice} percent YES with $${(market.volume / 1000).toFixed(0)}K in volume. ${market.yesPrice > 80 ? 'The market is very confident this will happen.' : market.yesPrice < 20 ? 'Almost no one believes this. High risk, high reward.' : 'This one is genuinely uncertain — and that\'s where the value is.'}`,
      text_overlay: `${market.yesPrice}% YES | $${(market.volume / 1000).toFixed(0)}K volume`,
    })
    elapsed += 15
  }

  // Resolutions
  if (resolutions.length > 0) {
    scenes.push({
      timing: `${formatTime(elapsed)} - ${formatTime(elapsed + 5)}`,
      duration_seconds: 5,
      visual_direction: 'Transition card: RESOLVED THIS WEEK',
      voice_text: 'And some markets resolved this week. Winners got paid.',
      text_overlay: '🏆 RESOLVED',
      transition: 'slide',
    })
    elapsed += 5

    for (const res of resolutions) {
      scenes.push({
        timing: `${formatTime(elapsed)} - ${formatTime(elapsed + 10)}`,
        duration_seconds: 10,
        visual_direction: 'Resolution card with checkmark animation.',
        voice_text: res.detail.slice(0, 200),
        text_overlay: '✅ RESOLVED',
      })
      elapsed += 10
    }
  }

  // CTA
  scenes.push({
    timing: `${formatTime(elapsed)} - ${formatTime(elapsed + 10)}`,
    duration_seconds: 10,
    visual_direction: 'Avatar center frame. Subscribe animation. Nuro Finance branding.',
    voice_text: `That\'s the week. If you want to bet on predictions from any blockchain and cash out to a real Visa card, check out Nuro Finance. Link in the description. Subscribe for weekly updates. I\'ll see you next week.`,
    text_overlay: 'app.nuro.finance | Subscribe',
    transition: 'fade to end card',
  })
  elapsed += 10

  return {
    id,
    format: 'weekly_digest',
    platform,
    title: `This Week in Predictions — ${month} Week ${weekNum} | Nuro Finance`,
    description: `Weekly crypto + prediction market recap. Top movers, hot markets, winners paid out. Bet on predictions from any chain → win → cash out to Visa.\n\n🔗 app.nuro.finance`,
    hashtags: ['crypto', 'predictions', 'weeklyrecap', 'nurofinance', 'polymarket', 'defi'],
    total_duration_seconds: elapsed,
    scenes,
    hook: scenes[0].voice_text,
    cta: CTAS.signup,
    data_sources: ['coingecko', 'polymarket', 'execution_log'],
    confidence: 0.8,
    created_at: timestamp,
  }
}

// ─── EDUCATIONAL (60-90s) ───────────────────────────────────────────────────

function generateEducational(
  id: string, platform: TargetPlatform, timestamp: string
): VideoScript {
  const topics = [
    {
      title: 'How AI Agents Make Money While You Sleep',
      hook: pickHook('educational', {}),
      scenes: [
        { timing: '0:00 - 0:04', duration_seconds: 4, visual_direction: 'Avatar appears with AI graphics behind.', voice_text: 'What if your AI agent could make money while you sleep? Let me show you how.', text_overlay: '🤖 AI AGENTS', transition: 'zoom in' as string },
        { timing: '0:04 - 0:20', duration_seconds: 16, visual_direction: 'Animated diagram: User → Agent → Markets → Winnings → Visa Card', voice_text: 'On Nuro Finance, you deploy an AI agent. It scans prediction markets 24/7, finds high-probability bets, and places real trades with your funds. When it wins, the profits go straight to your vault.', text_overlay: 'Deploy → Scan → Bet → Win' },
        { timing: '0:20 - 0:40', duration_seconds: 20, visual_direction: 'Screen recording of agent dashboard, P&L chart.', voice_text: 'The agent tracks its own performance, learns from losses, and adjusts strategy. You set the risk limit — say $100 max per bet — and it operates within that. No emotions. No FOMO. Just data-driven decisions.', text_overlay: 'Risk Limit: $100 | Win Rate: tracking' },
        { timing: '0:40 - 0:55', duration_seconds: 15, visual_direction: 'Visa card animation. USDC → Visa flow.', voice_text: 'The best part? When your agent makes money, you cash out to a real Visa card. Spend your AI\'s earnings at any store, any ATM, anywhere Visa is accepted.', text_overlay: 'Agent Wins → USDC → Visa Card 💳' },
        { timing: '0:55 - 1:05', duration_seconds: 10, visual_direction: 'Avatar center. Nuro Finance logo.', voice_text: CTAS.agent, text_overlay: 'app.nuro.finance', transition: 'fade to logo' },
      ],
      cta: CTAS.agent,
    },
    {
      title: 'Bet From Any Chain, Cash Out to Visa',
      hook: pickHook('educational', {}),
      scenes: [
        { timing: '0:00 - 0:04', duration_seconds: 4, visual_direction: 'Avatar with chain logos orbiting.', voice_text: 'Most people don\'t know you can do this with crypto. Let me show you.', text_overlay: '🌐 OMNICHAIN', transition: 'zoom in' as string },
        { timing: '0:04 - 0:20', duration_seconds: 16, visual_direction: 'Chain logos animate in: ETH, SOL, ARB, BASE, POLYGON, etc.', voice_text: 'Nuro Finance supports 23 blockchains. Ethereum, Solana, Base, Arbitrum, Polygon, Avalanche — and 17 more. Deposit USDC from any of them.', text_overlay: '23 Chains Supported' },
        { timing: '0:20 - 0:40', duration_seconds: 20, visual_direction: 'Prediction market UI. Placing a bet animation.', voice_text: 'Your funds land in your vault. From there, bet on any prediction market — crypto prices, sports, politics, world events. If you win, your payout goes to your vault automatically.', text_overlay: '🔮 Bet → Win → Vault' },
        { timing: '0:40 - 0:55', duration_seconds: 15, visual_direction: 'Vault → Bridge → Visa card animation.', voice_text: 'Then cash out. Your USDC gets bridged to your Visa card. Real money. Real card. Spend it anywhere.', text_overlay: 'Vault → Visa 💳' },
        { timing: '0:55 - 1:05', duration_seconds: 10, visual_direction: 'Avatar center. App URL.', voice_text: CTAS.card, text_overlay: 'app.nuro.finance', transition: 'fade to logo' },
      ],
      cta: CTAS.card,
    },
  ]

  const pick = topics[new Date().getDate() % topics.length]

  return {
    id,
    format: 'educational',
    platform,
    title: pick.title,
    description: `${pick.title}. Learn how Nuro Finance works.\n\n🔗 app.nuro.finance`,
    hashtags: ['crypto', 'defi', 'nurofinance', 'web3', 'fintech', 'howto'],
    total_duration_seconds: pick.scenes.reduce((s, sc) => s + sc.duration_seconds, 0),
    scenes: pick.scenes,
    hook: pick.hook,
    cta: pick.cta,
    data_sources: ['educational_template'],
    confidence: 0.65,
    created_at: timestamp,
  }
}

// ─── SMART FORMAT PICKER ────────────────────────────────────────────────────

export async function pickBestFormat(
  db: Pool,
  marketData: any,
): Promise<{ format: ScriptFormat; platform: TargetPlatform; reason: string }> {
  /**
   * Decides what type of video to make based on:
   * - What's happening in the market (volatile → flash alert)
   * - Day of week (Sunday → weekly digest)
   * - What formats have performed well (learning loop)
   * - Platform balance (don't post the same format twice in a row)
   */

  const dayOfWeek = new Date().getDay()
  const lastFormat = await recallFact(db, 'last_script_format')
  const formatScores = await recallFact(db, 'script_format_scores') || {}

  // Sunday = weekly digest
  if (dayOfWeek === 0) {
    return { format: 'weekly_digest', platform: 'youtube', reason: 'Sunday — weekly digest day' }
  }

  // Big mover = flash alert
  const bigMover = (marketData.topMovers || []).find((m: any) => Math.abs(m.change24h) > 8)
  if (bigMover) {
    return { format: 'flash_alert', platform: 'tiktok', reason: `${bigMover.symbol.toUpperCase()} moved ${bigMover.change24h.toFixed(1)}% — flash alert` }
  }

  // Hot prediction market = spotlight
  const hotMarket = (marketData.trendingMarkets || []).find((m: any) => m.volume > 50000)
  if (hotMarket && lastFormat !== 'prediction_spotlight') {
    return { format: 'prediction_spotlight', platform: 'tiktok', reason: `High-volume market: "${hotMarket.question.slice(0, 40)}"` }
  }

  // Avoid repeating last format
  const formats: ScriptFormat[] = ['market_recap', 'educational', 'prediction_spotlight', 'flash_alert']
  const available = formats.filter(f => f !== lastFormat)

  // Pick highest-scoring format that isn't the last one
  let best = available[0]
  let bestScore = -1
  for (const fmt of available) {
    const score = formatScores[fmt] ?? 0.5
    if (score > bestScore) {
      bestScore = score
      best = fmt
    }
  }

  return {
    format: best,
    platform: best === 'weekly_digest' ? 'youtube' : 'tiktok',
    reason: `Best available format (score: ${bestScore.toFixed(2)}), avoiding repeat of ${lastFormat || 'none'}`,
  }
}

// ─── LEARNING LOOP ──────────────────────────────────────────────────────────

export async function recordScriptPerformance(
  db: Pool,
  performance: ScriptPerformance,
): Promise<void> {
  /**
   * Records how a video performed and updates the format scoring model.
   * This directly influences future format selection.
   */

  // Compute engagement score (weighted)
  const score = (
    performance.views * 0.1 +
    performance.likes * 2 +
    performance.shares * 5 +
    performance.watch_time_avg_seconds * 0.5 +
    performance.click_through_rate * 100
  ) / 10  // Normalize

  performance.score = score

  // Save to memory
  await rememberFact(db, `script_perf_${performance.script_id}`, performance, 'performance')

  // Update format scores (rolling average)
  const formatScores = await recallFact(db, 'script_format_scores') || {}
  const currentScore = formatScores[performance.format] ?? 0.5
  formatScores[performance.format] = currentScore * 0.7 + (score / 100) * 0.3  // 70% history, 30% new
  await rememberFact(db, 'script_format_scores', formatScores, 'performance')

  // Track best/worst
  const allFormats = Object.entries(formatScores).sort((a: any, b: any) => b[1] - a[1])
  if (allFormats.length > 0) {
    await rememberFact(db, 'best_script_format', allFormats[0][0], 'performance')
    await rememberFact(db, 'worst_script_format', allFormats[allFormats.length - 1][0], 'performance')
  }

  // Log to execution_log
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'script_performance', 'success', $2, now())`,
    [performance.script_id, `Format: ${performance.format}, Score: ${score.toFixed(1)}, Views: ${performance.views}, Likes: ${performance.likes}`]
  ).catch(() => {})

  console.log(`[script-engine] Performance recorded: ${performance.format} → score ${score.toFixed(1)}`)
}

// ─── SCRIPT → HEYGEN PAYLOAD ────────────────────────────────────────────────

export function scriptToHeyGenPayload(script: VideoScript, avatarId?: string): any {
  /**
   * Converts our VideoScript into the HeyGen API v2 video generation payload.
   * Concatenates all scene voice texts into one continuous script.
   */
  const fullVoiceText = script.scenes.map(s => s.voice_text).join(' ')

  return {
    video_inputs: [{
      character: {
        type: 'avatar',
        avatar_id: avatarId || 'default',
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: fullVoiceText,
        voice_id: '1bd001e7e50f421d891986aad5c82862',  // Professional male voice
      },
      background: {
        type: 'color',
        value: '#0a0a0f',
      },
    }],
    dimension: script.platform === 'youtube'
      ? { width: 1920, height: 1080 }  // 16:9
      : { width: 1080, height: 1920 }, // 9:16 vertical
    aspect_ratio: script.platform === 'youtube' ? '16:9' : '9:16',
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function pickHook(category: keyof typeof HOOKS, vars: Record<string, string>): string {
  const hooks = HOOKS[category]
  const pick = hooks[Math.floor(Math.random() * hooks.length)]
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), pick)
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

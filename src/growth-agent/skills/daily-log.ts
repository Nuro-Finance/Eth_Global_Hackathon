/**
 * ─── AUTONOMOUS DAILY LOG ────────────────────────────────────────────────────
 *
 * Mythos's brain. Runs daily at 9 AM.
 * Reads feeds, thinks, generates content, posts, logs, learns.
 *
 * CRUD Cycle:
 *   1. READ  — market_feed_cache, execution_log, past post metrics
 *   2. THINK — rank content ideas by engagement potential
 *   3. CREATE — generate tailored posts for each platform
 *   4. POST  — push to Moltbook first, then cascade
 *   5. LOG   — record everything to growth_agent_log table
 *   6. LEARN — analyze which posts drove engagement → adjust
 */

import { Pool } from 'pg'
import { generateDailyContent } from './content'
import { generateScript, pickBestFormat } from './script-engine'
import { executeVideoPipeline, checkPendingVideos } from './tiktok'
import { perceiveMarket } from './thought-engine'
import { postToMoltbook } from './moltbook'
import { postTweet } from './twitter'
import { sendTelegramMessage } from './telegram'
import {
  loadIdentity, saveIdentity, reviewPerformance,
  selfRegisterMoltbook, selfRegisterTelegram,
  rememberFact, recallFact,
} from '../agent-identity'
import { think, consolidateMemory, introspect } from './thought-engine'
import { runDailyKnowledgeCycle, selfExamine } from './knowledge-engine'
import { submitForApproval, assessRisk, processApprovedPosts, sendDailySummary, notifyAdmin } from './approval-pipeline'
import { runQualityGate, runVideoQualityGate } from './quality-gate'

export interface DailyLogEntry {
  date: string
  posts_generated: number
  posts_published: number
  platforms_reached: string[]
  top_content: string
  engagement_summary: string
  learnings: string
}

export async function runDailyGrowthCycle(db: Pool): Promise<DailyLogEntry> {
  const today = new Date().toISOString().split('T')[0]
  const platformsReached: string[] = []
  let postsPublished = 0

  console.log(`[mythos] Starting daily cycle for ${today}`)

  // ── Step 0: IDENTITY — Load self, check platforms, self-register ───────
  const identity = await loadIdentity(db)
  console.log(`[mythos] Identity loaded: ${identity.name} v${identity.version}`)

  // Try to register on platforms we haven't registered on yet
  if (!identity.platforms.moltbook.registered) {
    await selfRegisterMoltbook(db)
  }
  if (!identity.platforms.telegram.registered) {
    await selfRegisterTelegram(db)
  }

  // Weekly performance review + memory consolidation (Sunday)
  const dayOfWeek = new Date().getDay()
  if (dayOfWeek === 0) {
    const review = await reviewPerformance(db)
    console.log(`[mythos] Weekly review: ${review.totalPosts} posts, recommendations: ${review.recommendations.join('; ')}`)
    await rememberFact(db, `weekly_review_${today}`, review, 'performance')
    await consolidateMemory(db)
    console.log(`[mythos] Memory consolidated — long-term insights updated`)
  }

  // ── Step 0.5: THINK — Inner monologue before generating content ───────
  const thoughtChain = await think(db)
  console.log(`[mythos] Thought chain: ${thoughtChain.thoughts.length} thoughts, strategy: ${thoughtChain.finalStrategy.primaryTopic} (urgency ${thoughtChain.finalStrategy.urgencyLevel}/10)`)
  if (thoughtChain.finalStrategy.toneAdjustment) {
    console.log(`[mythos] Tone adjustment: ${thoughtChain.finalStrategy.toneAdjustment}`)
  }

  // Save cycle performance for next cycle's learning
  await rememberFact(db, 'last_cycle_performance', {
    date: today,
    postsPublished: 0,  // will update at end
    platformsReached: [],
    strategy: thoughtChain.finalStrategy.primaryTopic,
    urgency: thoughtChain.finalStrategy.urgencyLevel,
  }, 'performance')

  // ── Step 1: READ — Generate content from live data ─────────────────────
  const posts = await generateDailyContent(db)
  console.log(`[mythos] Generated ${posts.length} content ideas`)

  // ── Step 1.5: KNOWLEDGE — Daily CRUD learning cycle ────────────────────
  const knowledgeReport = await runDailyKnowledgeCycle(db)
  console.log(`[mythos] Knowledge CRUD: C=${knowledgeReport.created} R=${knowledgeReport.read} U=${knowledgeReport.updated} D=${knowledgeReport.deleted}`)

  // ── Step 2: QUALITY + APPROVAL — Filter and route content ─────────────
  for (const post of posts.slice(0, 5)) {  // Max 5 posts per day
    // Run quality gate on every post
    const quality = await runQualityGate(db, post.text, 'moltbook', post.category)
    if (!quality.passed) {
      console.log(`[mythos] BLOCKED by quality gate (${quality.score}/100): ${quality.improvements[0] || 'failed checks'}`)
      continue
    }

    // Assess risk and route through approval pipeline
    const risk = assessRisk(post)
    const pending = await submitForApproval(db, post.text, 'moltbook', post.category, {
      hashtags: post.hashtags,
      link: post.link,
      riskLevel: risk,
    })

    // Only post immediately if auto-approved
    if (pending.status === 'auto_approved') {
      // Moltbook (always first)
      const mbResult = await postToMoltbook({
        text: post.text,
        link: post.link,
        hashtags: post.hashtags,
      })
      if (mbResult) {
        postsPublished++
        if (!platformsReached.includes('moltbook')) platformsReached.push('moltbook')
        await db.query(
          `INSERT INTO growth_agent_posts (id, platform, post_id, post_url, content, content_type, hashtags, posted_at)
           VALUES (gen_random_uuid(), 'moltbook', $1, $2, $3, $4, $5, now())`,
          [mbResult.postId, mbResult.url, post.text, post.category, post.hashtags]
        ).catch(() => {})
      }

      // X/Twitter (high priority posts only)
      if (post.priority >= 7) {
        const tweetText = post.text.length > 280
          ? post.text.slice(0, 250) + '...\n\n' + (post.link || '')
          : post.text
        const tweetResult = await postTweet(tweetText)
        if (tweetResult) {
          postsPublished++
          if (!platformsReached.includes('twitter')) platformsReached.push('twitter')
        }
      }

      // Telegram (crypto alerts and high priority)
      if (post.priority >= 6) {
        const tgChannel = process.env.TELEGRAM_CHANNEL_ID
        const tgToken = process.env.TELEGRAM_BOT_TOKEN
        if (tgToken && tgChannel) {
          const sent = await sendTelegramMessage(tgChannel, post.text, 'HTML')
          if (sent) {
            postsPublished++
            if (!platformsReached.includes('telegram')) platformsReached.push('telegram')
            await db.query(
              `INSERT INTO growth_agent_posts (id, platform, content, content_type, hashtags, posted_at)
               VALUES (gen_random_uuid(), 'telegram', $1, $2, $3, now())`,
              [post.text, post.category, post.hashtags]
            ).catch(() => {})
          }
        }
      }
    } else {
      console.log(`[mythos] Post queued for approval (${risk} risk): ${post.text.slice(0, 60)}...`)
    }
  }

  // ── Step 2.5: VIDEO — Generate one video per day via HeyGen ────────────
  // Gated by HEYGEN_ENABLED env flag (default: false). Session 23 — disabled
  // because the `default` avatar look_id isn't configured ("avatar look not
  // found, look_id: default, space_id: ce638c11d1ed42be83d07aa4c4fe2e57").
  // Re-enable by: (1) configuring a real avatar in HeyGen dashboard, (2)
  // setting HEYGEN_AVATAR_LOOK_ID + HEYGEN_AVATAR_SPACE_ID env vars, (3)
  // flipping HEYGEN_ENABLED=true on VPS.
  if (process.env.HEYGEN_ENABLED === 'true') {
    try {
      const snapshot = await perceiveMarket(db)
      const { format, platform, reason } = await pickBestFormat(db, snapshot)
      console.log(`[mythos] Video format selected: ${format} for ${platform} — ${reason}`)

      const script = await generateScript(db, format, platform, snapshot)
      const videoResult = await executeVideoPipeline(db, script)

      if (videoResult.success) {
        postsPublished++
        if (!platformsReached.includes(platform)) platformsReached.push(platform)
        console.log(`[mythos] Video published: ${videoResult.videoUrl?.slice(0, 60)}...`)
      } else {
        console.log(`[mythos] Video pipeline: ${videoResult.error}`)
      }
    } catch (err: any) {
      console.error(`[mythos] Video pipeline error: ${err.message}`)
    }
  }

  // ── Step 3: LOG — Record the daily cycle ───────────────────────────────
  const entry: DailyLogEntry = {
    date: today,
    posts_generated: posts.length,
    posts_published: postsPublished,
    platforms_reached: platformsReached,
    top_content: posts[0]?.text.slice(0, 100) || 'No content generated',
    engagement_summary: 'Pending — check metrics tomorrow',
    learnings: `Generated ${posts.length} ideas, published ${postsPublished} to ${platformsReached.join(', ') || 'none (no tokens configured)'}`,
  }

  // Store in DB
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'daily_cycle', 'success', $2, now())`,
    [today, JSON.stringify(entry)]
  ).catch(() => {})

  // Update cycle performance for next cycle's learning loop
  await rememberFact(db, 'last_cycle_performance', {
    date: today,
    postsPublished,
    platformsReached,
    strategy: thoughtChain.finalStrategy.primaryTopic,
    urgency: thoughtChain.finalStrategy.urgencyLevel,
    contentMix: thoughtChain.finalStrategy.contentMix,
  }, 'performance')

  // Send daily summary to Richard via Telegram
  await sendDailySummary(db)

  console.log(`[mythos] Daily cycle complete: ${postsPublished} posts to ${platformsReached.length} platforms`)

  return entry
}

// ── HOURLY CHECK — Real-time alerts for big moves ────────────────────────

export { introspect, think, consolidateMemory } from './thought-engine'
export { selfExamine, runDailyKnowledgeCycle } from './knowledge-engine'
import { pollTelegramApprovals } from './approval-pipeline'
export { processApprovalCallback, getApprovedPosts, processApprovedPosts, notifyAdmin, pollTelegramApprovals, sendTestMessage } from './approval-pipeline'

export async function runHourlyCheck(db: Pool): Promise<void> {
  // Poll Telegram for approval button presses (replaces webhook)
  await pollTelegramApprovals(db)

  // Check if any pending HeyGen videos have finished rendering
  await checkPendingVideos(db)

  // Process approved posts (admin approved via Telegram)
  await processApprovedPosts(db)

  // Check for big crypto movers in last hour
  const bigMovers = await db.query(
    `SELECT symbol, name, price_usd, price_change_24h FROM market_feed_cache
     WHERE feed_source = 'coingecko' AND ABS(price_change_24h) > 5
     AND last_synced_at > now() - interval '2 hours'
     ORDER BY ABS(price_change_24h) DESC LIMIT 1`
  ).catch(() => ({ rows: [] }))

  if (bigMovers.rows.length > 0) {
    const coin = bigMovers.rows[0]
    const dir = parseFloat(coin.price_change_24h) > 0 ? '🚀' : '💥'
    const text = `${dir} ALERT: ${coin.name} (${coin.symbol.toUpperCase()}) ${parseFloat(coin.price_change_24h) > 0 ? '+' : ''}${parseFloat(coin.price_change_24h).toFixed(1)}% → $${parseFloat(coin.price_usd).toLocaleString()}\n\nBet on it: https://app.nuro.finance/en/dashboard/markets`

    // Post to all platforms
    await postToMoltbook({ text, hashtags: ['crypto', coin.symbol.toLowerCase(), 'alert'] })
    await postTweet(text)
    const tgChannel = process.env.TELEGRAM_CHANNEL_ID
    if (tgChannel) await sendTelegramMessage(tgChannel, text)
  }

  // Check for newly resolved markets
  const resolved = await db.query(
    `SELECT detail FROM execution_log
     WHERE entity_type = 'oracle' AND action = 'auto_resolve' AND status = 'success'
     AND created_at > now() - interval '1 hour'
     LIMIT 1`
  ).catch(() => ({ rows: [] }))

  if (resolved.rows.length > 0) {
    const text = `🏆 Market Just Resolved!\n\n${resolved.rows[0].detail}\n\nWinners paid out → cash out to Visa.\n\nhttps://app.nuro.finance/en/dashboard/markets`
    await postToMoltbook({ text, hashtags: ['prediction', 'winners'] })
  }
}

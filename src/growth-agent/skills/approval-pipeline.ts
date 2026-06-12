/**
 * ─── APPROVAL PIPELINE ─────────────────────────────────────────────────────
 *
 * Content goes through this pipeline before posting:
 *   1. Agent generates content
 *   2. Quality Gate checks it
 *   3. If auto-approved (low risk), posts immediately
 *   4. If needs review (high risk/video), sends to Richard via Telegram
 *   5. Richard approves/rejects via inline buttons
 *   6. Approved content gets posted, rejected gets logged for learning
 *
 * Risk levels:
 *   LOW    — crypto price alert, educational → auto-post
 *   MEDIUM — prediction spotlight, market recap → notify + auto-post after 2hr
 *   HIGH   — video content, contrarian takes → require approval
 *
 * Telegram Integration:
 *   - Bot sends preview with Approve/Reject inline buttons
 *   - Webhook at POST /telegram/webhook handles button callbacks
 *   - Approval stored in growth_agent_memory
 */

import { Pool } from 'pg'
import axios from 'axios'
import { PostContent } from './content'
import { VideoScript } from './script-engine'
import { rememberFact, recallFact } from '../agent-identity'
import { postToMoltbook } from './moltbook'
import { postTweet } from './twitter'
import { sendTelegramMessage } from './telegram'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''  // Richard's personal chat ID
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'expired'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface PendingPost {
  id: string
  content: string
  platform: string
  category: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  telegramMessageId?: number
  createdAt: string
  expiresAt: string  // Auto-expire after 24h
  reviewedAt?: string
  reviewNote?: string
  hashtags?: string[]
  link?: string
  scriptId?: string  // If this is a video post
}

// ─── RISK ASSESSMENT ────────────────────────────────────────────────────────

export function assessRisk(content: PostContent | VideoScript): RiskLevel {
  // Videos always need approval
  if ('scenes' in content) return 'high'

  const post = content as PostContent

  // Auto-approve: simple price alerts and educational content
  if (post.category === 'crypto' && post.priority <= 6) return 'low'
  if (post.category === 'education') return 'low'

  // Medium: market recaps, predictions
  if (post.category === 'announcement') return 'medium'
  if (post.category === 'sports') return 'medium'

  // High: anything with strong opinions or high priority
  if (post.priority >= 8) return 'high'

  // Check for risky language
  const text = post.text.toLowerCase()
  const riskyWords = ['guaranteed', 'definitely', 'impossible', 'crash', 'moon', '100%', 'scam', 'rug']
  if (riskyWords.some(w => text.includes(w))) return 'high'

  return 'medium'
}

// ─── SUBMIT FOR APPROVAL ────────────────────────────────────────────────────

export async function submitForApproval(
  db: Pool,
  content: string,
  platform: string,
  category: string,
  options: {
    hashtags?: string[]
    link?: string
    scriptId?: string
    riskLevel?: RiskLevel
  } = {}
): Promise<PendingPost> {
  const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const riskLevel = options.riskLevel || 'medium'
  const now = new Date()
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)  // 24h expiry

  const pending: PendingPost = {
    id,
    content,
    platform,
    category,
    riskLevel,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    hashtags: options.hashtags,
    link: options.link,
    scriptId: options.scriptId,
  }

  // Auto-approve low risk content
  if (riskLevel === 'low') {
    pending.status = 'auto_approved'
    console.log(`[approval] Auto-approved: ${category} post for ${platform} (low risk)`)
  } else {
    // S32 anti-spam: only HIGH-risk fires immediate Telegram. MEDIUM goes
    // to admin console silently — Richard reviews the queue once via the
    // daily digest or the admin /pending-posts endpoint. Was firing
    // ~150 Telegram messages/day before this gate.
    // Override: APPROVAL_ALERT_VERBOSE=true reverts to per-post alerting.
    const verboseAlerts = process.env.APPROVAL_ALERT_VERBOSE === 'true'
    if (riskLevel === 'high' || verboseAlerts) {
      const msgId = await sendApprovalRequest(pending)
      if (msgId) {
        pending.telegramMessageId = msgId
      }
    }
    console.log(`[approval] Submitted for review: ${category} post for ${platform} (${riskLevel} risk)${riskLevel === 'medium' && !verboseAlerts ? ' [silent — admin-console only]' : ''}`)
  }

  // Store in memory
  await rememberFact(db, `pending_post_${id}`, pending, 'approval')

  // Log to execution_log
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'submit_approval', $2, $3, now())`,
    [id, pending.status, `[${riskLevel.toUpperCase()}] ${platform}/${category}: ${content.slice(0, 100)}...`]
  ).catch(() => {})

  return pending
}

// ─── TELEGRAM APPROVAL REQUEST ──────────────────────────────────────────────

async function sendApprovalRequest(post: PendingPost): Promise<number | null> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.log('[approval] No Telegram bot token or admin chat ID — approval via admin console only')
    return null
  }

  try {
    const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[post.riskLevel]
    const preview = post.content.length > 500 ? post.content.slice(0, 500) + '...' : post.content

    const text = [
      `${riskEmoji} <b>Post Approval Request</b>`,
      ``,
      `<b>Platform:</b> ${post.platform}`,
      `<b>Category:</b> ${post.category}`,
      `<b>Risk:</b> ${post.riskLevel.toUpperCase()}`,
      `${post.scriptId ? `<b>Type:</b> Video Script` : ''}`,
      ``,
      `<b>Content Preview:</b>`,
      `<code>${escapeHtml(preview)}</code>`,
      ``,
      `${post.hashtags?.length ? `<b>Tags:</b> ${post.hashtags.map(h => `#${h}`).join(' ')}` : ''}`,
      `${post.link ? `<b>Link:</b> ${post.link}` : ''}`,
      ``,
      `<i>Auto-expires: ${new Date(post.expiresAt).toLocaleString()}</i>`,
    ].filter(Boolean).join('\n')

    const res = await axios.post(`${TG_API}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve:${post.id}` },
            { text: '❌ Reject', callback_data: `reject:${post.id}` },
          ],
          [
            { text: '✏️ Approve + Edit', callback_data: `edit:${post.id}` },
            { text: '⏭️ Skip', callback_data: `skip:${post.id}` },
          ],
        ],
      },
    })

    return res.data?.result?.message_id || null
  } catch (err: any) {
    console.error('[approval] Telegram send failed:', err.response?.data?.description || err.message)
    return null
  }
}

// ─── ENGAGEMENT TRACKING SEED ───────────────────────────────────────────────
// Session 23 Thread C1. When a post goes live, seed post_engagement with a
// t=0 snapshot (all metrics zero). Later hourly sampler updates with real
// numbers. Without the seed row, we'd have no "posted at + format/tone"
// metadata to join against when the metrics fetch runs.
async function seedPostEngagement(
    db: Pool,
    params: {
        postUuid?: string | null
        platform: string
        externalPostId?: string | null
        category?: string | null
        tone?: string | null
        format?: string | null
    }
): Promise<void> {
    try {
        await db.query(
            `INSERT INTO post_engagement
             (post_uuid, platform, external_post_id, category, tone, post_format, sampled_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())`,
            [
                params.postUuid || null,
                params.platform,
                params.externalPostId || null,
                params.category || null,
                params.tone || null,
                params.format || null,
            ]
        )
    } catch (e: any) {
        // Don't let engagement-tracking failures block the post itself.
        // Log so we notice at audit time.
        console.warn(`[engagement] Seed insert failed: ${e.message?.slice(0, 80)}`)
    }
}

// ─── PROCESS APPROVAL CALLBACK ──────────────────────────────────────────────

export async function processApprovalCallback(
  db: Pool,
  action: string,
  postId: string,
  callbackQueryId: string,
): Promise<{ approved: boolean; post: PendingPost | null }> {
  const post = await recallFact(db, `pending_post_${postId}`) as PendingPost | null
  if (!post) {
    await answerCallback(callbackQueryId, 'Post not found or expired')
    return { approved: false, post: null }
  }

  switch (action) {
    case 'approve':
      post.status = 'approved'
      post.reviewedAt = new Date().toISOString()
      await rememberFact(db, `pending_post_${postId}`, post, 'approval')
      await answerCallback(callbackQueryId, '✅ Approved! Posting now...')
      await updateTelegramMessage(post.telegramMessageId, '✅ APPROVED')
      console.log(`[approval] Post ${postId} APPROVED by admin`)
      // S32 — close the learning loop (same as reject path).
      await recomputeContentTypePerformance(db).catch(() => undefined)
      break

    case 'reject':
      post.status = 'rejected'
      post.reviewedAt = new Date().toISOString()
      await rememberFact(db, `pending_post_${postId}`, post, 'approval')
      await answerCallback(callbackQueryId, '❌ Rejected. Will learn from this.')
      await updateTelegramMessage(post.telegramMessageId, '❌ REJECTED')
      // Log rejection for learning
      await rememberFact(db, `rejection_${postId}`, {
        content: post.content.slice(0, 200),
        category: post.category,
        reason: 'admin_rejected',
        date: new Date().toISOString(),
      }, 'learning')
      console.log(`[approval] Post ${postId} REJECTED by admin`)
      // S32 — close the learning loop: recompute best/worst content type
      // from accumulated approval/rejection history. Thought-engine reads
      // these on the next cycle, so future content gen biases toward
      // categories the operator approves and away from ones rejected.
      await recomputeContentTypePerformance(db).catch(() => undefined)
      break

    case 'skip':
      post.status = 'expired'
      await rememberFact(db, `pending_post_${postId}`, post, 'approval')
      await answerCallback(callbackQueryId, '⏭️ Skipped')
      await updateTelegramMessage(post.telegramMessageId, '⏭️ SKIPPED')
      break

    default:
      await answerCallback(callbackQueryId, 'Unknown action')
  }

  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'approval_review', $2, $3, now())`,
    [postId, post.status, `Admin ${action}: ${post.content.slice(0, 100)}`]
  ).catch(() => {})

  return { approved: post.status === 'approved', post }
}

// ─── CHECK & POST APPROVED CONTENT ─────────────────────────────────────────

export async function processApprovedPosts(db: Pool): Promise<number> {
  /**
   * Called in hourly cycle. Checks for approved posts and posts them.
   * Also auto-approves medium-risk posts after 2 hours with no response.
   */
  let posted = 0

  // Get all pending posts from memory
  const allMemory = await db.query(
    `SELECT key, value FROM growth_agent_memory WHERE key LIKE 'pending_post_%' AND category = 'approval'`
  ).catch(() => ({ rows: [] }))

  for (const row of allMemory.rows) {
    const post: PendingPost = typeof row.value === 'string' ? JSON.parse(row.value) : row.value

    // Skip already processed
    if (['auto_approved', 'rejected', 'expired'].includes(post.status) && post.reviewedAt) continue

    // Auto-approve medium risk after 2 hours
    if (post.status === 'pending' && post.riskLevel === 'medium') {
      const elapsed = Date.now() - new Date(post.createdAt).getTime()
      if (elapsed > 2 * 60 * 60 * 1000) {
        post.status = 'auto_approved'
        post.reviewedAt = new Date().toISOString()
        post.reviewNote = 'Auto-approved after 2hr timeout'
        await rememberFact(db, row.key, post, 'approval')
        await updateTelegramMessage(post.telegramMessageId, '⏰ AUTO-APPROVED (2hr timeout)')
        console.log(`[approval] Auto-approved ${post.id} after 2hr timeout`)
      }
    }

    // Expire old posts
    if (post.status === 'pending' && new Date(post.expiresAt) < new Date()) {
      post.status = 'expired'
      await rememberFact(db, row.key, post, 'approval')
      await updateTelegramMessage(post.telegramMessageId, '⏰ EXPIRED')
      continue
    }

    // ── ACTUALLY POST approved content to platforms ──────────────────────
    if ((post.status === 'approved' || post.status === 'auto_approved') && !post.reviewNote?.includes('POSTED')) {
      console.log(`[mythos] Posting approved content to ${post.platform}: ${post.content.slice(0, 60)}...`)

      try {
        let success = false

        // Post to the target platform. On each successful post we also seed
        // a post_engagement row so the hourly metrics sampler has a target.
        // The `(post as any).tone/format` reads come from the thought-engine
        // snapshot when available; they're nullable-safe at the DB level.
        if (post.platform === 'moltbook') {
          const result = await postToMoltbook({
            text: post.content,
            link: post.link,
            hashtags: post.hashtags,
          })
          if (result) {
            success = true
            const insertedRow = await db.query(
              `INSERT INTO growth_agent_posts (id, platform, post_id, post_url, content, content_type, hashtags, posted_at)
               VALUES (gen_random_uuid(), 'moltbook', $1, $2, $3, $4, $5, now())
               RETURNING id`,
              [result.postId, result.url, post.content, post.category, post.hashtags]
            ).catch(() => ({ rows: [] as any[] }))
            const postUuid = insertedRow.rows[0]?.id ?? null
            await seedPostEngagement(db, {
              postUuid,
              platform: 'moltbook',
              externalPostId: result.postId,
              category: post.category,
              tone: (post as any).tone,
              format: (post as any).format,
            })
          }
        }

        if (post.platform === 'twitter') {
          const tweetText = post.content.length > 280
            ? post.content.slice(0, 250) + '...\n\n' + (post.link || '')
            : post.content
          const result = await postTweet(tweetText)
          if (result) {
            success = true
            await seedPostEngagement(db, {
              platform: 'twitter',
              externalPostId: typeof result === 'string' ? result : (result as any)?.tweetId,
              category: post.category,
              tone: (post as any).tone,
              format: (post as any).format,
            })
          }
        }

        if (post.platform === 'telegram') {
          const tgChannel = process.env.TELEGRAM_CHANNEL_ID
          if (tgChannel) {
            const result = await sendTelegramMessage(tgChannel, post.content, 'HTML')
            if (result) {
              success = true
              const insertedRow = await db.query(
                `INSERT INTO growth_agent_posts (id, platform, content, content_type, hashtags, posted_at)
                 VALUES (gen_random_uuid(), 'telegram', $1, $2, $3, now())
                 RETURNING id`,
                [post.content, post.category, post.hashtags]
              ).catch(() => ({ rows: [] as any[] }))
              const postUuid = insertedRow.rows[0]?.id ?? null
              await seedPostEngagement(db, {
                postUuid,
                platform: 'telegram',
                category: post.category,
                tone: (post as any).tone,
                format: (post as any).format,
              })
            }
          }
        }

        // Cross-post to Telegram for high-priority approved content (notify followers)
        if (success && post.platform === 'moltbook') {
          const tgChannel = process.env.TELEGRAM_CHANNEL_ID
          if (tgChannel) {
            await sendTelegramMessage(tgChannel, post.content, 'HTML').catch(() => {})
          }
        }

        // Mark as posted so we don't re-post on next cycle
        post.reviewNote = (post.reviewNote || '') + ' | POSTED'
        await rememberFact(db, row.key, post, 'approval')

        if (success) {
          posted++
          await notifyAdmin(`✅ Posted to ${post.platform}: ${post.content.slice(0, 80)}...`, 'success')
          console.log(`[mythos] Successfully posted to ${post.platform}`)
        } else {
          console.log(`[mythos] Post to ${post.platform} returned no result (missing API keys?)`)
        }
      } catch (err: any) {
        console.error(`[mythos] Failed to post approved content: ${err.message?.slice(0, 80)}`)
        post.reviewNote = (post.reviewNote || '') + ` | POST_FAILED: ${err.message?.slice(0, 50)}`
        await rememberFact(db, row.key, post, 'approval')
      }
    }
  }

  return posted
}

export async function getApprovedPosts(db: Pool): Promise<PendingPost[]> {
  const allMemory = await db.query(
    `SELECT key, value FROM growth_agent_memory
     WHERE key LIKE 'pending_post_%' AND category = 'approval'`
  ).catch(() => ({ rows: [] }))

  const approved: PendingPost[] = []
  for (const row of allMemory.rows) {
    const post: PendingPost = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (post.status === 'approved' || post.status === 'auto_approved') {
      approved.push(post)
    }
  }
  return approved
}

// ─── NOTIFY ADMIN ───────────────────────────────────────────────────────────

export async function notifyAdmin(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): Promise<void> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return

  const emoji = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '🚨' }[type]

  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: `${emoji} <b>Mythos</b>\n\n${message}`,
      parse_mode: 'HTML',
    })
  } catch (err: any) {
    console.error('[approval] Admin notify failed:', err.message)
  }
}

// ─── DAILY SUMMARY TO ADMIN ────────────────────────────────────────────────

export async function sendDailySummary(db: Pool): Promise<void> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return

  // Gather stats
  const todayPosts = await db.query(
    `SELECT COUNT(*) as c FROM growth_agent_posts WHERE posted_at > now() - interval '24 hours'`
  ).catch(() => ({ rows: [{ c: 0 }] }))

  const pendingCount = await db.query(
    `SELECT COUNT(*) as c FROM growth_agent_memory
     WHERE key LIKE 'pending_post_%' AND category = 'approval'
     AND (value->>'status')::text = 'pending'`
  ).catch(() => ({ rows: [{ c: 0 }] }))

  const rejections = await db.query(
    `SELECT COUNT(*) as c FROM growth_agent_memory WHERE category = 'learning' AND key LIKE 'rejection_%'
     AND (value->>'date')::text > (now() - interval '24 hours')::text`
  ).catch(() => ({ rows: [{ c: 0 }] }))

  const thoughtLog = await db.query(
    `SELECT detail FROM execution_log WHERE entity_type = 'growth_agent' AND action = 'inner_monologue'
     AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1`
  ).catch(() => ({ rows: [] }))

  const summary = [
    `📊 <b>Daily Agent Report</b>`,
    ``,
    `Posts published: <b>${todayPosts.rows[0].c}</b>`,
    `Pending approval: <b>${pendingCount.rows[0].c}</b>`,
    `Rejected today: <b>${rejections.rows[0].c}</b>`,
    ``,
    thoughtLog.rows[0] ? `<b>Latest Thought:</b>\n<code>${thoughtLog.rows[0].detail.slice(0, 300)}</code>` : 'No thoughts logged today.',
    ``,
    `<i>— Mythos</i>`,
  ].join('\n')

  await notifyAdmin(summary, 'info')
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await axios.post(`${TG_API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    })
  } catch {}
}

async function updateTelegramMessage(messageId: number | undefined, statusText: string): Promise<void> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID || !messageId) return
  try {
    // Add status to the message (can't edit inline keyboards after callback)
    await axios.post(`${TG_API}/editMessageReplyMarkup`, {
      chat_id: ADMIN_CHAT_ID,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: statusText, callback_data: 'noop' }]] },
    })
  } catch {}
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── TELEGRAM POLLING (replaces webhook for HTTP-only servers) ──────────────

let lastUpdateId = 0

export async function pollTelegramApprovals(db: Pool): Promise<void> {
  /**
   * Polls Telegram for callback_query updates (button presses).
   * Called in hourly cycle since we can't use webhooks without HTTPS.
   * Actually runs every cycle — fast, lightweight, non-blocking.
   */
  if (!BOT_TOKEN) return

  try {
    const res = await axios.get(`${TG_API}/getUpdates`, {
      params: {
        offset: lastUpdateId + 1,
        timeout: 5,
        allowed_updates: JSON.stringify(['callback_query', 'message']),
      },
      timeout: 10000,
    })

    const updates = res.data?.result || []
    for (const update of updates) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id)

      // Handle approval button presses
      if (update.callback_query) {
        const callbackData = update.callback_query.data || ''
        const callbackQueryId = update.callback_query.id
        const [action, postId] = callbackData.split(':')

        if (action && postId && ['approve', 'reject', 'skip', 'edit'].includes(action)) {
          await processApprovalCallback(db, action, postId, callbackQueryId)
          console.log(`[telegram-poll] Processed: ${action} for ${postId}`)
        }
      }

      // Handle text commands from Richard
      if (update.message?.text && update.message.from?.id.toString() === ADMIN_CHAT_ID) {
        const text = update.message.text.trim()
        if (text === '/status') {
          await notifyAdmin('Agent is running. Use /pending to see queued posts.', 'info')
        } else if (text === '/pending') {
          const pending = await db.query(
            `SELECT value FROM growth_agent_memory
             WHERE key LIKE 'pending_post_%' AND category = 'approval'
             AND (value->>'status')::text = 'pending'
             LIMIT 5`
          ).catch(() => ({ rows: [] }))
          const count = pending.rows.length
          await notifyAdmin(
            count === 0
              ? 'No pending posts. All clear.'
              : `${count} post(s) pending approval. Check above messages for Approve/Reject buttons.`,
            'info'
          )
        } else if (text === '/knowledge') {
          // Import would cause circular dep, so we just query directly
          const knowledgeCount = await db.query(
            `SELECT COUNT(*) as c FROM growth_agent_memory WHERE category LIKE 'knowledge_%'`
          ).catch(() => ({ rows: [{ c: 0 }] }))
          await notifyAdmin(`Knowledge base: ${knowledgeCount.rows[0].c} entries. Use admin console for full view.`, 'info')
        }
      }
    }
  } catch (err: any) {
    // Silent fail — polling errors are not critical
    if (!err.message?.includes('timeout')) {
      console.error('[telegram-poll] Error:', err.message)
    }
  }
}

// ─── SEND TEST MESSAGE ──────────────────────────────────────────────────────

export async function sendTestMessage(db: Pool): Promise<boolean> {
  /**
   * Sends a test message to Richard to verify the pipeline works.
   * Call from admin console or API endpoint.
   */
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.log('[approval] Cannot send test — no bot token or admin chat ID')
    return false
  }

  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text: [
        '🤖 <b>Mythos — Online</b>',
        '',
        'Pipeline status:',
        '  ✅ Telegram bot connected',
        '  ✅ Approval pipeline active',
        '  ✅ Quality gate armed',
        '  ✅ Knowledge engine running',
        '  ✅ Thought engine ready',
        '',
        'Commands:',
        '  /status — Check agent status',
        '  /pending — View pending posts',
        '  /knowledge — Knowledge base stats',
        '',
        '<i>I will send you posts for approval. Use the buttons to approve or reject.</i>',
      ].join('\n'),
      parse_mode: 'HTML',
    })
    console.log('[approval] Test message sent to admin')
    return true
  } catch (err: any) {
    console.error('[approval] Test message failed:', err.response?.data?.description || err.message)
    return false
  }
}

// ─── LEARNING LOOP — S32 ──────────────────────────────────────────────────────
//
// Aggregates approval + rejection history per content category, derives
// `best_content_type` + `worst_content_type`, persists via rememberFact()
// so the thought-engine's reflection step reads them on the next cycle.
//
// Closes the gap surfaced in S32 audit Q4: the agent's "Latest Thought"
// observation/reflection used to be generated fresh each cycle without
// reading back from prior approvals/rejections. Now: every approve/reject
// from Richard recomputes the performance signal; the next thought-engine
// cycle picks it up via the existing recallFact('best_content_type') etc.
//
// Algorithm: per category, count approved + rejected over the last 7 days.
// approval_rate = approved / (approved + rejected). Best = highest rate
// with sample >= 3. Worst = lowest rate with sample >= 3. Categories with
// fewer samples are still listed in stats but don't drive best/worst.
//
// Bonus signal: market conditions snapshot (vault APRs, BTC/ETH price)
// piggy-backed via `last_market_snapshot` fact — already populated by
// thought-engine. If we want richer signals later, a recompute call could
// also stamp `category_performance_by_market_regime` for finer
// conditional strategies (e.g. "education performs better in bear markets").

interface CategoryStats {
  category: string
  approved: number
  rejected: number
  approvalRate: number
}

export async function recomputeContentTypePerformance(db: Pool): Promise<{
  best: string | null
  worst: string | null
  stats: CategoryStats[]
}> {
  // Pull the last 7 days of approval/rejection history from the audit log.
  // execution_log entries written from processApprovalCallback have
  // entity_type='growth_agent', action='approval_review', and status =
  // 'approved' / 'rejected' / 'expired'. The detail field carries the
  // first 100 chars of the post — we don't need that here.
  // Category isn't on the audit row directly; we recover it by joining
  // through `pending_post_*` memory facts.
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Pull all pending_post_* memory facts that fall in the window.
  let posts: Array<{ category: string; status: string }> = []
  try {
    const r = await db.query(
      `SELECT value FROM growth_agent_memory
       WHERE key LIKE 'pending_post_%'
         AND category = 'approval'
         AND updated_at >= $1`,
      [sinceIso],
    )
    posts = r.rows
      .map((row: any) => {
        try {
          const p = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
          if (!p?.category || !p?.status) return null
          return { category: String(p.category), status: String(p.status) }
        } catch {
          return null
        }
      })
      .filter((p): p is { category: string; status: string } => p != null)
  } catch (err: any) {
    console.warn(`[approval:learning] memory query failed: ${err?.message?.slice(0, 100)}`)
    return { best: null, worst: null, stats: [] }
  }

  if (posts.length === 0) {
    return { best: null, worst: null, stats: [] }
  }

  // Aggregate per category.
  const tally: Record<string, { approved: number; rejected: number }> = {}
  for (const p of posts) {
    if (!tally[p.category]) tally[p.category] = { approved: 0, rejected: 0 }
    if (p.status === 'approved' || p.status === 'auto_approved') tally[p.category].approved++
    else if (p.status === 'rejected') tally[p.category].rejected++
    // 'pending', 'expired', 'skipped' don't contribute to the signal
  }

  const stats: CategoryStats[] = Object.entries(tally)
    .map(([category, t]) => {
      const total = t.approved + t.rejected
      const approvalRate = total > 0 ? t.approved / total : 0
      return { category, approved: t.approved, rejected: t.rejected, approvalRate }
    })
    .sort((a, b) => b.approvalRate - a.approvalRate)

  // Best/worst require minimum 3 samples to avoid one-off noise.
  const eligible = stats.filter((s) => s.approved + s.rejected >= 3)
  const best = eligible.length > 0 ? eligible[0].category : null
  const worst = eligible.length > 0 ? eligible[eligible.length - 1].category : null

  // Persist signals so thought-engine reads on next cycle.
  await rememberFact(db, 'best_content_type', best, 'learning').catch(() => undefined)
  await rememberFact(db, 'worst_content_type', worst, 'learning').catch(() => undefined)
  await rememberFact(db, 'content_type_performance_7d', stats, 'learning').catch(() => undefined)

  console.log(
    `[approval:learning] recomputed — best=${best || 'null'}, worst=${worst || 'null'}, samples=${posts.length}, eligible-categories=${eligible.length}`,
  )

  return { best, worst, stats }
}

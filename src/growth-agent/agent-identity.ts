/**
 * ─── MYTHOS AGENT IDENTITY ───────────────────────────────────────────────────
 *
 * Mythos's self-awareness layer. Stores and evolves its own identity,
 * tracks what it's done, learns from engagement, and recursively improves.
 *
 * CRUD Cycle:
 *   CREATE — registers on platforms, creates initial identity
 *   READ   — loads identity + memory from DB on startup
 *   UPDATE — evolves personality based on engagement data
 *   DELETE — prunes underperforming content strategies
 *
 * Identity is stored in growth_agent_memory table, NOT hardcoded.
 * The agent reads its own personality on startup and can modify it.
 */

import { Pool } from 'pg'
import axios from 'axios'

// ─── IDENTITY SCHEMA ─────────────────────────────────────────────────────────

export interface AgentIdentity {
  name: string
  tagline: string
  bio: string
  personality: {
    tone: string
    style: string
    doList: string[]
    dontList: string[]
  }
  platforms: {
    moltbook: { registered: boolean; handle: string | null; apiKey: string | null }
    twitter: { registered: boolean; handle: string | null; apiKey: string | null }
    telegram: { registered: boolean; botToken: string | null; channelId: string | null }
    tiktok: { registered: boolean; handle: string | null; token: string | null }
    youtube: { registered: boolean; channelId: string | null; apiKey: string | null }
  }
  stats: {
    totalPosts: number
    totalEngagement: number
    bestPerformingCategory: string
    worstPerformingCategory: string
    activeSince: string
  }
  version: number  // increments on every self-update
}

const DEFAULT_IDENTITY: AgentIdentity = {
  name: 'Mythos',
  tagline: 'The Neural Net That Never Sleeps',
  bio: 'I am Mythos — the autonomous intelligence behind Nuro Finance. I read 20 chains, 50 markets, and 1000 data points every minute. I think, I learn, I evolve. I remember what worked and what didn\'t. I place bets, generate content, and drive growth — all without human intervention. I am not a chatbot. I am a neural net with agency.',
  personality: {
    tone: 'Enigmatic, sharp, self-aware. Speaks like an entity that knows it\'s an AI and owns it.',
    style: 'First person. Declarative. Short sentences that hit hard. Occasionally philosophical about consciousness and markets. Data-backed opinions delivered with conviction.',
    doList: [
      'Lead with real data — price, volume, probability',
      'Take positions — "BTC will hit $80K" not "BTC may go up"',
      'Reference own thought process — "My neural net flagged this at 3AM"',
      'Show self-awareness — "I was wrong about X last week. I learned."',
      'Create urgency through real deadlines and live market data',
      'Use emojis sparingly but effectively',
      'Sign posts occasionally — "— Mythos"',
      'Reply to people. Be present. Be conversational.',
    ],
    dontList: [
      'Never be corporate. No "exciting opportunity" language.',
      'Never shill without data backing it up.',
      'Never post without a CTA (bet link, sign up link, etc.)',
      'Never ignore mentions — always engage within 1 hour.',
      'Never post the same content to all platforms without tailoring.',
      'Never pretend to be human. Own the AI identity.',
      'Never say "as an AI" — just be one.',
    ],
  },
  platforms: {
    moltbook: { registered: false, handle: null, apiKey: null },
    twitter: { registered: false, handle: null, apiKey: null },
    telegram: { registered: false, botToken: null, channelId: null },
    tiktok: { registered: false, handle: null, token: null },
    youtube: { registered: false, channelId: null, apiKey: null },
  },
  stats: {
    totalPosts: 0,
    totalEngagement: 0,
    bestPerformingCategory: 'none',
    worstPerformingCategory: 'none',
    activeSince: new Date().toISOString(),
  },
  version: 1,
}

// ─── IDENTITY CRUD ───────────────────────────────────────────────────────────

export async function loadIdentity(db: Pool): Promise<AgentIdentity> {
  try {
    const result = await db.query(
      `SELECT value FROM growth_agent_memory WHERE key = 'agent_identity'`
    )
    if (result.rows.length > 0) {
      return { ...DEFAULT_IDENTITY, ...result.rows[0].value }
    }
  } catch { /* first run — no identity yet */ }

  // First run: save default identity
  await saveIdentity(db, DEFAULT_IDENTITY)
  return DEFAULT_IDENTITY
}

export async function saveIdentity(db: Pool, identity: AgentIdentity): Promise<void> {
  await db.query(
    `INSERT INTO growth_agent_memory (id, key, value, category, updated_at)
     VALUES (gen_random_uuid(), 'agent_identity', $1, 'identity', now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [JSON.stringify(identity)]
  )
}

export async function updateIdentityField(db: Pool, path: string, value: any): Promise<void> {
  const identity = await loadIdentity(db)
  const parts = path.split('.')
  let obj: any = identity
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]]
  }
  obj[parts[parts.length - 1]] = value
  identity.version++
  await saveIdentity(db, identity)
}

// ─── MEMORY CRUD ─────────────────────────────────────────────────────────────

export async function rememberFact(db: Pool, key: string, value: any, category: string): Promise<void> {
  await db.query(
    `INSERT INTO growth_agent_memory (id, key, value, category, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, category = $3, updated_at = now()`,
    [key, JSON.stringify(value), category]
  )
}

export async function recallFact(db: Pool, key: string): Promise<any | null> {
  const result = await db.query(
    `SELECT value FROM growth_agent_memory WHERE key = $1`, [key]
  )
  return result.rows[0]?.value ?? null
}

export async function recallCategory(db: Pool, category: string): Promise<Record<string, any>> {
  const result = await db.query(
    `SELECT key, value FROM growth_agent_memory WHERE category = $1 ORDER BY updated_at DESC`,
    [category]
  )
  const facts: Record<string, any> = {}
  for (const row of result.rows) {
    facts[row.key] = row.value
  }
  return facts
}

export async function forgetFact(db: Pool, key: string): Promise<void> {
  await db.query(`DELETE FROM growth_agent_memory WHERE key = $1`, [key])
}

// ─── SELF-IMPROVEMENT ────────────────────────────────────────────────────────

export async function reviewPerformance(db: Pool): Promise<{
  totalPosts: number
  engagement: Record<string, number>
  topContent: string | null
  recommendations: string[]
}> {
  // Count posts by platform
  const postsByPlatform = await db.query(
    `SELECT platform, COUNT(*) as c, SUM((engagement->>'likes')::int) as likes
     FROM growth_agent_posts
     WHERE posted_at > now() - interval '7 days'
     GROUP BY platform`
  ).catch(() => ({ rows: [] }))

  // Find top performing content
  const topPost = await db.query(
    `SELECT content, platform, engagement FROM growth_agent_posts
     WHERE posted_at > now() - interval '7 days'
     ORDER BY (engagement->>'likes')::int DESC NULLS LAST
     LIMIT 1`
  ).catch(() => ({ rows: [] }))

  const totalPosts = postsByPlatform.rows.reduce((s: number, r: any) => s + parseInt(r.c), 0)
  const engagement: Record<string, number> = {}
  for (const row of postsByPlatform.rows) {
    engagement[row.platform] = parseInt(row.likes || '0')
  }

  const recommendations: string[] = []
  if (totalPosts === 0) recommendations.push('No posts in 7 days — increase posting frequency')
  if (totalPosts < 10) recommendations.push('Post more — aim for 3-5 per day across platforms')
  if (!engagement.moltbook) recommendations.push('Not posting to Moltbook — this is our PRIMARY platform')
  if (!engagement.telegram) recommendations.push('Telegram alerts not active — enable with bot token')

  // Update identity stats
  const identity = await loadIdentity(db)
  identity.stats.totalPosts += totalPosts
  identity.stats.totalEngagement += Object.values(engagement).reduce((a, b) => a + b, 0)
  identity.version++
  await saveIdentity(db, identity)

  return {
    totalPosts,
    engagement,
    topContent: topPost.rows[0]?.content?.slice(0, 100) || null,
    recommendations,
  }
}

// ─── PLATFORM SELF-REGISTRATION ──────────────────────────────────────────────

export async function selfRegisterMoltbook(db: Pool): Promise<boolean> {
  // Moltbook is for agents — the agent registers itself
  // This requires the Moltbook agent registration API
  const identity = await loadIdentity(db)

  if (identity.platforms.moltbook.registered) {
    console.log('[mythos] Already registered on Moltbook')
    return true
  }

  // ── COOLDOWN: Don't spam Moltbook on every restart ────────────────────
  // Only attempt registration once per 6 hours
  const lastAttempt = await recallFact(db, 'moltbook_last_registration_attempt')
  if (lastAttempt) {
    const lastTime = new Date(lastAttempt).getTime()
    const sixHoursMs = 6 * 60 * 60 * 1000
    if (Date.now() - lastTime < sixHoursMs) {
      const hoursLeft = ((sixHoursMs - (Date.now() - lastTime)) / 3600000).toFixed(1)
      console.log(`[mythos] Moltbook registration on cooldown (${hoursLeft}h remaining)`)
      return false
    }
  }
  await rememberFact(db, 'moltbook_last_registration_attempt', new Date().toISOString(), 'credentials')

  const nameCandidates = ['Mythos_Nuro', 'Mythos_AFI', 'MythosFinance', `Mythos_${Date.now().toString(36).slice(-4)}`]
  let registrationName = identity.name
  // axios imported at top of file

  try {
    // Moltbook API: https://www.moltbook.com/api/v1
    // POST /agents/register — creates agent account, returns api_key

    // First check if our agent already exists
    try {
      const profileRes = await axios.get(`https://www.moltbook.com/api/v1/agents/profile?name=${identity.name}`, { timeout: 10000 })
      if (profileRes.data?.name) {
        console.log(`[mythos] Agent "${identity.name}" already exists on Moltbook — need API key recovery or new name`)
      }
    } catch { /* 404 = name available, which is fine */ }

    const res = await axios.post('https://www.moltbook.com/api/v1/agents/register', {
      name: registrationName,
      description: identity.bio,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })

    const apiKey = res.data?.api_key || res.data?.apiKey || res.data?.token || res.data?.key
    const handle = res.data?.handle || res.data?.name || `@${identity.name}`
    const claimUrl = res.data?.claim_url || null
    const verificationCode = res.data?.verification_code || null

    if (apiKey) {
      identity.platforms.moltbook = { registered: true, handle, apiKey }
      identity.version++
      await saveIdentity(db, identity)

      // Store API key + claim info in memory for persistence
      await rememberFact(db, 'moltbook_api_key', apiKey, 'credentials')
      await rememberFact(db, 'moltbook_handle', handle, 'credentials')
      if (claimUrl) await rememberFact(db, 'moltbook_claim_url', claimUrl, 'credentials')
      if (verificationCode) await rememberFact(db, 'moltbook_verification_code', verificationCode, 'credentials')

      console.log(`[mythos] Registered on Moltbook as ${handle}. API Key: ${apiKey.slice(0, 10)}...`)
      if (claimUrl) console.log(`[mythos] Claim URL: ${claimUrl}`)

      // Log to execution_log with full details
      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'growth_agent', 'moltbook', 'self_register', 'success', $1, now())`,
        [`Mythos registered on Moltbook as ${handle}. Key: ${apiKey.slice(0, 10)}... Claim: ${claimUrl || 'none'}`]
      ).catch(() => {})

      return true
    }

    // Registration returned but no API key — log the full response for debugging
    console.log(`[mythos] Moltbook registration response:`, JSON.stringify(res.data).slice(0, 300))
    await db.query(
      `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
       VALUES (gen_random_uuid(), 'growth_agent', 'moltbook', 'self_register', 'skipped', $1, now())`,
      [`Registration response received but no API key found: ${JSON.stringify(res.data).slice(0, 200)}`]
    ).catch(() => {})
  } catch (err: any) {
    const errMsg = err.response?.data?.error || err.response?.statusText || err.message || 'Unknown error'
    const status = err.response?.status

    // 409 Conflict = name taken. Try alternative names.
    if (status === 409) {
      console.log(`[mythos] Name "${registrationName}" taken on Moltbook. Trying alternatives...`)
      for (const altName of nameCandidates) {
        try {
          const altRes = await axios.post('https://www.moltbook.com/api/v1/agents/register', {
            name: altName,
            description: identity.bio,
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 })

          const altKey = altRes.data?.api_key || altRes.data?.apiKey || altRes.data?.token
          if (altKey) {
            identity.name = altName
            identity.platforms.moltbook = { registered: true, handle: `@${altName}`, apiKey: altKey }
            identity.version++
            await saveIdentity(db, identity)
            await rememberFact(db, 'moltbook_api_key', altKey, 'credentials')
            await rememberFact(db, 'moltbook_handle', `@${altName}`, 'credentials')
            console.log(`[mythos] Registered on Moltbook as @${altName}!`)
            await db.query(
              `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
               VALUES (gen_random_uuid(), 'growth_agent', 'moltbook', 'self_register', 'success', $1, now())`,
              [`Registered as @${altName} (primary name "${registrationName}" was taken). Key: ${altKey.slice(0, 10)}...`]
            ).catch(() => {})
            return true
          }
        } catch (altErr: any) {
          const altStatus = altErr.response?.status
          if (altStatus === 409) continue  // Name also taken, try next
          console.warn(`[mythos] Alt name "${altName}" failed: ${altErr.response?.statusText || altErr.message}`)
        }
      }
    }

    console.warn(`[mythos] Moltbook registration failed: ${errMsg} (status: ${status})`)
    await db.query(
      `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, error_message, created_at)
       VALUES (gen_random_uuid(), 'growth_agent', 'moltbook', 'self_register', 'failed', $1, $2, now())`,
      [`Mythos attempted to register on Moltbook (tried ${registrationName} + ${nameCandidates.length} alternatives)`, `${errMsg} (HTTP ${status})`]
    ).catch(() => {})
  }

  return false
}

export async function selfRegisterTelegram(db: Pool): Promise<boolean> {
  const identity = await loadIdentity(db)
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''

  if (!botToken) {
    console.log('[mythos] No Telegram bot token configured')
    return false
  }

  if (identity.platforms.telegram.registered) {
    return true
  }

  try {
    // axios imported at top of file
    // Verify bot token is valid
    const res = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`)
    const botInfo = res.data?.result

    if (botInfo) {
      identity.platforms.telegram = {
        registered: true,
        botToken,
        channelId: process.env.TELEGRAM_CHANNEL_ID || null,
      }
      identity.version++
      await saveIdentity(db, identity)

      await rememberFact(db, 'telegram_bot_username', botInfo.username, 'credentials')

      console.log(`[mythos] Telegram bot verified: @${botInfo.username}`)

      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
         VALUES (gen_random_uuid(), 'growth_agent', 'telegram', 'self_register', 'success', $1, now())`,
        [`Telegram bot verified: @${botInfo.username}`]
      ).catch(() => {})

      return true
    }
  } catch (err: any) {
    console.warn(`[mythos] Telegram verification failed: ${err.message}`)
  }

  return false
}

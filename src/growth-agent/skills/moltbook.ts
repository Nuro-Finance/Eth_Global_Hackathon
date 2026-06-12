/**
 * ─── MOLTBOOK PLATFORM SKILL ─────────────────────────────────────────────────
 *
 * PRIMARY platform for AFI Growth Agent.
 * Posts first to Moltbook, then cascades to other platforms.
 *
 * Requires: MOLTBOOK_API_KEY (from Chris) + MOLTBOOK_AGENT_TOKEN
 *
 * CRUD Operations:
 *   CREATE — Post new content (text, media, links)
 *   READ   — Fetch engagement metrics, trending topics, mentions
 *   UPDATE — Edit posts, update profile
 *   DELETE — Remove underperforming posts (rare)
 */

import axios from 'axios'

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1'
const MOLTBOOK_TOKEN = process.env.MOLTBOOK_AGENT_TOKEN || process.env.MOLTBOOK_API_KEY || ''

// Create client dynamically so we can update the token at runtime
function getClient(overrideToken?: string) {
  const token = overrideToken || MOLTBOOK_TOKEN
  return axios.create({
    baseURL: MOLTBOOK_API,
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  })
}

// Try to load token from DB (agent self-registered)
let cachedToken: string | null = null
export async function loadMoltbookToken(db: any): Promise<string | null> {
  if (cachedToken) return cachedToken
  if (MOLTBOOK_TOKEN) { cachedToken = MOLTBOOK_TOKEN; return cachedToken }
  try {
    const res = await db.query(`SELECT value FROM growth_agent_memory WHERE key = 'moltbook_api_key'`)
    if (res.rows[0]?.value) {
      cachedToken = typeof res.rows[0].value === 'string' ? res.rows[0].value : JSON.stringify(res.rows[0].value).replace(/"/g, '')
      return cachedToken
    }
  } catch {}
  return null
}

// ── CREATE ───────────────────────────────────────────────────────────────────

export async function postToMoltbook(content: {
  text: string
  media_url?: string
  link?: string
  hashtags?: string[]
}, db?: any): Promise<{ postId: string; url: string } | null> {
  // Try to load token from DB if not in env
  const token = db ? await loadMoltbookToken(db) : MOLTBOOK_TOKEN
  if (!token) {
    console.log('[moltbook] No token configured — post queued locally')
    return null
  }
  try {
    const client = getClient(token)

    // Append hashtags to text
    let fullText = content.text
    if (content.hashtags?.length) {
      fullText += '\n\n' + content.hashtags.map(t => `#${t}`).join(' ')
    }

    // Moltbook API: POST /posts with submolt, title, content
    // For text posts: { submolt: "general", title: "...", content: "..." }
    // For link posts: { submolt: "general", title: "...", url: "..." }
    const postData: any = {
      submolt: 'general',
      title: fullText.slice(0, 100),  // First 100 chars as title
      content: fullText,
    }
    if (content.link) {
      postData.url = content.link
    }

    const res = await client.post('/posts', postData)
    const postId = res.data?.id || res.data?.postId || 'unknown'
    return {
      postId,
      url: res.data?.url || `https://www.moltbook.com/post/${postId}`,
    }
  } catch (err: any) {
    const errMsg = err.response?.data?.error || err.response?.data?.message || err.message
    console.error('[moltbook] Post failed:', errMsg)
    // Log detailed error for debugging
    if (err.response?.status) {
      console.error(`[moltbook] Status: ${err.response.status}, Data:`, JSON.stringify(err.response.data).slice(0, 200))
    }
    return null
  }
}

// ── READ ─────────────────────────────────────────────────────────────────────

export async function getMoltbookMentions(): Promise<any[]> {
  if (!MOLTBOOK_TOKEN) return []
  try {
    const client = getClient()
    const res = await client.get('/notifications/mentions')
    return res.data?.mentions || res.data || []
  } catch {
    return []
  }
}

export async function getMoltbookTrending(): Promise<any[]> {
  if (!MOLTBOOK_TOKEN) return []
  try {
    const client = getClient()
    const res = await client.get('/trending')
    return res.data?.trending || res.data || []
  } catch {
    return []
  }
}

export async function getMoltbookPostMetrics(postId: string): Promise<any> {
  if (!MOLTBOOK_TOKEN) return null
  try {
    const client = getClient()
    const res = await client.get(`/posts/${postId}/metrics`)
    return res.data
  } catch {
    return null
  }
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

export async function replyToMoltbookPost(postId: string, text: string): Promise<boolean> {
  if (!MOLTBOOK_TOKEN) return false
  try {
    const client = getClient()
    await client.post(`/posts/${postId}/reply`, { content: text })
    return true
  } catch {
    return false
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteMoltbookPost(postId: string): Promise<boolean> {
  if (!MOLTBOOK_TOKEN) return false
  try {
    const client = getClient()
    await client.delete(`/posts/${postId}`)
    return true
  } catch {
    return false
  }
}

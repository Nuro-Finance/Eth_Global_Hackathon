/**
 * ─── X/TWITTER PLATFORM SKILL ────────────────────────────────────────────────
 *
 * Posts crypto alpha, market predictions, and engagement threads to X.
 * Uses Twitter API v2 with OAuth 1.0a.
 *
 * Content Strategy:
 *   - Price movers → short alerts
 *   - Market predictions → threads with YES/NO breakdown
 *   - Resolution → victory posts with tx proof
 *   - Educational → "How AFI works" threads
 */

import axios from 'axios'
import crypto from 'crypto'

const API_KEY = process.env.TWITTER_API_KEY || ''
const API_SECRET = process.env.TWITTER_API_SECRET || ''
const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || ''
const ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || ''

function generateOAuthHeader(method: string, url: string, params: Record<string, string> = {}): string {
  if (!API_KEY) return ''
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: '1.0',
  }
  const allParams = { ...oauthParams, ...params }
  const paramString = Object.keys(allParams).sort().map(k => `${k}=${encodeURIComponent(allParams[k])}`).join('&')
  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
  const signingKey = `${encodeURIComponent(API_SECRET)}&${encodeURIComponent(ACCESS_SECRET)}`
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')
  oauthParams.oauth_signature = signature
  return 'OAuth ' + Object.entries(oauthParams).map(([k, v]) => `${k}="${encodeURIComponent(v)}"`).join(', ')
}

export async function postTweet(text: string): Promise<{ tweetId: string; url: string } | null> {
  if (!API_KEY) {
    console.log('[twitter] No API key — tweet queued')
    return null
  }
  try {
    const url = 'https://api.twitter.com/2/tweets'
    const auth = generateOAuthHeader('POST', url)
    const res = await axios.post(url, { text }, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
    })
    const tweetId = res.data?.data?.id
    return { tweetId, url: `https://x.com/NuroFinance/status/${tweetId}` }
  } catch (err: any) {
    console.error('[twitter] Post failed:', err.response?.data?.detail || err.message)
    return null
  }
}

export async function postThread(tweets: string[]): Promise<string[]> {
  const ids: string[] = []
  let replyTo: string | null = null
  for (const text of tweets) {
    if (!API_KEY) { ids.push('queued'); continue }
    try {
      const url = 'https://api.twitter.com/2/tweets'
      const auth = generateOAuthHeader('POST', url)
      const body: any = { text }
      if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo }
      const res = await axios.post(url, body, {
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
      })
      replyTo = res.data?.data?.id
      ids.push(replyTo || 'unknown')
    } catch {
      ids.push('failed')
    }
  }
  return ids
}

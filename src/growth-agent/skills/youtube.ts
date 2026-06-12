/**
 * ─── YOUTUBE PLATFORM SKILL ─────────────────────────────────────────────────
 *
 * Weekly market digests + tutorial content.
 * Uses YouTube Data API v3 + HeyGen for avatar videos.
 *
 * Content Types:
 *   - "This Week in Predictions" — weekly market digest
 *   - "How To" tutorials — using AFI, placing bets, deploying agents
 *   - Market analysis — deep dives on trending predictions
 */

import axios from 'axios'

const YT_API_KEY = process.env.YOUTUBE_API_KEY || ''
const YT_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''
const YT_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || ''
const YT_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN || ''

async function getAccessToken(): Promise<string | null> {
  if (!YT_CLIENT_ID || !YT_REFRESH_TOKEN) return null
  try {
    const res = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    })
    return res.data.access_token
  } catch {
    return null
  }
}

export async function uploadToYoutube(videoUrl: string, title: string, description: string, tags: string[]): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) {
    console.log('[youtube] No auth — upload skipped')
    return null
  }
  try {
    // Step 1: Download video from URL
    const videoData = await axios.get(videoUrl, { responseType: 'arraybuffer' })

    // Step 2: Upload to YouTube via resumable upload
    const initRes = await axios.post(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        snippet: { title, description, tags, categoryId: '22' },  // 22 = People & Blogs
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )

    const uploadUrl = initRes.headers.location
    if (!uploadUrl) return null

    const uploadRes = await axios.put(uploadUrl, videoData.data, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/*' },
      maxContentLength: 100 * 1024 * 1024,
    })

    const videoId = uploadRes.data?.id
    console.log('[youtube] Video uploaded:', videoId)
    return videoId ? `https://youtube.com/watch?v=${videoId}` : null
  } catch (err: any) {
    console.error('[youtube] Upload failed:', err.response?.data?.error?.message || err.message)
    return null
  }
}

// Weekly digest script template
export function generateWeeklyDigestTitle(): string {
  const now = new Date()
  const weekNum = Math.ceil(now.getDate() / 7)
  const month = now.toLocaleString('en-US', { month: 'long' })
  return `This Week in Predictions — ${month} Week ${weekNum} | Mythos by Nuro Finance`
}

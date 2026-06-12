/**
 * ─── TIKTOK PLATFORM SKILL ──────────────────────────────────────────────────
 *
 * Short-form video content for market predictions and crypto alerts.
 * Full pipeline: Script Engine → HeyGen Avatar → TikTok Upload
 *
 * Pipeline:
 *   1. Script Engine generates a VideoScript with scenes + timing
 *   2. scriptToHeyGenPayload() converts to HeyGen API format
 *   3. HeyGen renders the AI avatar video (async — poll for completion)
 *   4. Download video URL when ready
 *   5. Upload to TikTok via Content Posting API
 *   6. Record performance for learning loop
 *
 * HeyGen API Key: must be set via HEYGEN_API_KEY env var
 */

import axios from 'axios'
import { Pool } from 'pg'
import { VideoScript, scriptToHeyGenPayload, recordScriptPerformance } from './script-engine'
import { rememberFact, recallFact } from '../agent-identity'

const TIKTOK_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || ''
const HEYGEN_KEY = process.env.HEYGEN_API_KEY || ''

// ─── HEYGEN: Full Video Pipeline ────────────────────────────────────────────

export async function createAvatarVideo(script: VideoScript, avatarId?: string): Promise<string | null> {
  if (!HEYGEN_KEY) {
    console.log('[tiktok] No HeyGen key — video creation skipped')
    return null
  }

  try {
    const payload = scriptToHeyGenPayload(script, avatarId)
    console.log(`[heygen] Creating video: "${script.title}" (${script.total_duration_seconds}s, ${script.format})`)

    const res = await axios.post('https://api.heygen.com/v2/video/generate', payload, {
      headers: { 'X-Api-Key': HEYGEN_KEY, 'Content-Type': 'application/json' },
      timeout: 30000,
    })

    const videoId = res.data?.data?.video_id
    if (videoId) {
      console.log(`[heygen] Video generation started: ${videoId}`)
      return videoId
    }

    console.warn('[heygen] No video_id in response:', JSON.stringify(res.data).slice(0, 200))
    return null
  } catch (err: any) {
    console.error('[heygen] Video creation failed:', err.response?.data?.message || err.response?.data?.error || err.message)
    if (err.response?.status === 401) {
      console.error('[heygen] API key may be invalid or expired')
    }
    return null
  }
}

export async function pollVideoStatus(videoId: string, maxAttempts: number = 30): Promise<{ url: string; duration: number } | null> {
  /**
   * HeyGen video rendering is async. Poll until complete.
   * Typical render time: 30s-3min depending on video length.
   * We poll every 10 seconds, max 5 minutes.
   */
  if (!HEYGEN_KEY) return null

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await axios.get(
        `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
        { headers: { 'X-Api-Key': HEYGEN_KEY } }
      )

      const status = res.data?.data?.status
      const videoUrl = res.data?.data?.video_url
      const duration = res.data?.data?.duration || 0

      if (status === 'completed' && videoUrl) {
        console.log(`[heygen] Video ready: ${videoUrl.slice(0, 80)}... (${duration}s)`)
        return { url: videoUrl, duration }
      }

      if (status === 'failed') {
        console.error('[heygen] Video generation failed:', res.data?.data?.error)
        return null
      }

      // Still processing — wait 10s
      console.log(`[heygen] Video ${videoId} status: ${status} (attempt ${i + 1}/${maxAttempts})`)
      await new Promise(resolve => setTimeout(resolve, 10000))
    } catch (err: any) {
      console.error('[heygen] Poll failed:', err.message)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }

  console.warn(`[heygen] Video ${videoId} timed out after ${maxAttempts} attempts`)
  return null
}

export async function getVideoUrl(videoId: string): Promise<string | null> {
  /** Quick single check — doesn't poll. Use pollVideoStatus for full pipeline. */
  if (!HEYGEN_KEY) return null
  try {
    const res = await axios.get(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': HEYGEN_KEY },
    })
    if (res.data?.data?.status === 'completed') {
      return res.data.data.video_url
    }
    return null
  } catch {
    return null
  }
}

// ─── HEYGEN: List Available Avatars ─────────────────────────────────────────

export async function listAvatars(): Promise<Array<{ avatar_id: string; avatar_name: string }>> {
  if (!HEYGEN_KEY) return []
  try {
    const res = await axios.get('https://api.heygen.com/v2/avatars', {
      headers: { 'X-Api-Key': HEYGEN_KEY },
    })
    return res.data?.data?.avatars || []
  } catch (err: any) {
    console.error('[heygen] List avatars failed:', err.message)
    return []
  }
}

export async function listVoices(): Promise<Array<{ voice_id: string; name: string; language: string }>> {
  if (!HEYGEN_KEY) return []
  try {
    const res = await axios.get('https://api.heygen.com/v2/voices', {
      headers: { 'X-Api-Key': HEYGEN_KEY },
    })
    return res.data?.data?.voices || []
  } catch (err: any) {
    console.error('[heygen] List voices failed:', err.message)
    return []
  }
}

// ─── TIKTOK: Upload Video ───────────────────────────────────────────────────

export async function uploadToTiktok(videoUrl: string, caption: string, hashtags: string[]): Promise<boolean> {
  if (!TIKTOK_TOKEN) {
    console.log('[tiktok] No TikTok token — upload skipped')
    return false
  }
  try {
    const fullCaption = caption + '\n\n' + hashtags.map(t => `#${t}`).join(' ')
    const res = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      post_info: {
        title: fullCaption.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    }, {
      headers: {
        Authorization: `Bearer ${TIKTOK_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
    console.log('[tiktok] Video published:', res.data?.data?.publish_id)
    return true
  } catch (err: any) {
    console.error('[tiktok] Upload failed:', err.response?.data?.error?.message || err.message)
    return false
  }
}

// ─── FULL VIDEO PIPELINE ────────────────────────────────────────────────────

export async function executeVideoPipeline(
  db: Pool,
  script: VideoScript,
  avatarId?: string,
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  /**
   * The complete pipeline: Script → HeyGen → Poll → Upload → Record
   * This is what the daily cycle calls.
   */
  console.log(`[video-pipeline] Starting: "${script.title}" (${script.format}, ${script.platform})`)

  // Step 1: Submit to HeyGen
  const videoId = await createAvatarVideo(script, avatarId)
  if (!videoId) {
    await logPipeline(db, script, 'failed', 'HeyGen video creation failed')
    return { success: false, error: 'HeyGen video creation failed' }
  }

  // Step 2: Save video ID for later polling (in case of restart)
  await rememberFact(db, `pending_video_${script.id}`, {
    videoId,
    scriptId: script.id,
    format: script.format,
    platform: script.platform,
    title: script.title,
    startedAt: new Date().toISOString(),
  }, 'video_pipeline')

  // Step 3: Poll until ready
  const result = await pollVideoStatus(videoId)
  if (!result) {
    await logPipeline(db, script, 'failed', `HeyGen video ${videoId} timed out or failed`)
    return { success: false, error: 'Video rendering timed out' }
  }

  // Step 4: Upload to platform
  let uploaded = false
  if (script.platform === 'tiktok' || script.platform === 'youtube_shorts') {
    uploaded = await uploadToTiktok(result.url, script.description, script.hashtags)
  }
  // YouTube uploads handled by youtube.ts

  // Step 5: Record to DB
  await db.query(
    `INSERT INTO growth_agent_posts (id, platform, content, content_type, hashtags, engagement, posted_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
    [
      script.platform,
      `[VIDEO] ${script.title}\n\n${script.description}`,
      script.format,
      script.hashtags,
      JSON.stringify({ video_id: videoId, video_url: result.url, duration: result.duration, uploaded }),
    ]
  ).catch(() => {})

  // Step 6: Save last format for learning loop
  await rememberFact(db, 'last_script_format', script.format, 'performance')

  await logPipeline(db, script, 'success', `Video created: ${videoId}, URL: ${result.url.slice(0, 80)}..., Uploaded: ${uploaded}`)

  console.log(`[video-pipeline] Complete: "${script.title}" → ${uploaded ? 'UPLOADED' : 'READY (no platform token)'}`)

  return { success: true, videoUrl: result.url }
}

// ─── CHECK PENDING VIDEOS ───────────────────────────────────────────────────

export async function checkPendingVideos(db: Pool): Promise<void> {
  /**
   * Called hourly. Checks if any videos that were submitted to HeyGen
   * have finished rendering. This handles the case where the daily cycle
   * submitted a video but it wasn't ready in time.
   */
  const pendingKeys = await db.query(
    `SELECT key, value FROM growth_agent_memory WHERE key LIKE 'pending_video_%'`
  ).catch(() => ({ rows: [] }))

  for (const row of pendingKeys.rows) {
    const pending = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    const result = await getVideoUrl(pending.videoId)

    if (result) {
      console.log(`[video-pipeline] Pending video ${pending.videoId} is ready!`)

      // Upload if we have platform tokens
      if (pending.platform === 'tiktok' && TIKTOK_TOKEN) {
        await uploadToTiktok(result, pending.title, [])
      }

      // Clean up pending record
      await db.query(`DELETE FROM growth_agent_memory WHERE key = $1`, [row.key])
    }
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function logPipeline(db: Pool, script: VideoScript, status: string, detail: string): Promise<void> {
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'video_pipeline', $2, $3, now())`,
    [script.id, status, detail]
  ).catch(() => {})
}

/**
 * ─── ENGAGEMENT FETCHER ─────────────────────────────────────────────────────
 *
 * Session 24 — the other half of Session 23's engagement tracking. Session 23
 * shipped the `post_engagement` table + seed-on-publish hook. This module
 * adds the hourly cron that samples real metrics from each platform's API
 * and writes a fresh snapshot row per post.
 *
 * Time-series design: every fetch adds a NEW row. We don't update existing
 * rows. This lets the learning-loop consumer see engagement curves over
 * time (e.g. "did this post grow fast then flatten, or grow steadily?").
 *
 * APIs used:
 *   - Moltbook: GET /posts/{id}/metrics (already wrapped in moltbook.ts)
 *   - Twitter:  GET /2/tweets/{id}?tweet.fields=public_metrics
 *   - Telegram: channel view counts are limited; skip for now
 *
 * Dedup: if the last snapshot for a post was < 15 min ago, skip. Avoids
 * hammering the APIs during the hourly cycle.
 *
 * Scope: only fetch posts published in the last 7 days. Older posts have
 * usually plateaued and the API cost isn't justified.
 */

import { Pool } from 'pg'
import axios from 'axios'
import { getMoltbookPostMetrics } from './moltbook'

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface RecentPost {
    post_uuid: string
    platform: string
    external_post_id: string | null
    posted_at: Date
}

interface EngagementSnapshot {
    likes: number
    retweets: number
    replies: number
    impressions: number
    clicks: number
}

// ─── PLATFORM FETCHERS ──────────────────────────────────────────────────────

async function fetchMoltbookEngagement(externalId: string): Promise<EngagementSnapshot | null> {
    const m = await getMoltbookPostMetrics(externalId)
    if (!m) return null
    // Moltbook metrics shape (best-effort — normalize common field names)
    return {
        likes:       Number(m.likes ?? m.upvotes ?? m.reactions ?? 0),
        retweets:    Number(m.reposts ?? m.shares ?? 0),
        replies:     Number(m.replies ?? m.comments ?? 0),
        impressions: Number(m.views ?? m.impressions ?? 0),
        clicks:      Number(m.clicks ?? m.linkClicks ?? 0),
    }
}

async function fetchTwitterEngagement(tweetId: string): Promise<EngagementSnapshot | null> {
    // Twitter API v2 — we only need Bearer for read (public_metrics).
    // Falls back to OAuth1 App-only bearer if TWITTER_BEARER_TOKEN is set,
    // else skips. Per-tweet fetch uses public_metrics field.
    const bearer = process.env.TWITTER_BEARER_TOKEN || ''
    if (!bearer) return null
    try {
        const res = await axios.get(
            `https://api.twitter.com/2/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics`,
            { headers: { Authorization: `Bearer ${bearer}` }, timeout: 10000 }
        )
        const m = res.data?.data?.public_metrics || {}
        return {
            likes:       Number(m.like_count ?? 0),
            retweets:    Number(m.retweet_count ?? 0) + Number(m.quote_count ?? 0),
            replies:     Number(m.reply_count ?? 0),
            impressions: Number(m.impression_count ?? 0),
            clicks:      0,  // not in public_metrics; needs enterprise tier
        }
    } catch (err: any) {
        // 404 = tweet deleted / private. Don't spam logs with each miss.
        if (err?.response?.status !== 404) {
            console.warn(`[engagement:twitter] ${tweetId}: ${err?.response?.data?.title || err.message?.slice(0, 60)}`)
        }
        return null
    }
}

// ─── MAIN POLL ──────────────────────────────────────────────────────────────

const SAMPLE_DEDUP_MS = 15 * 60 * 1000  // skip if last sample < 15 min ago
const MAX_AGE_DAYS = 7                   // only poll posts from last 7 days

export interface PollOptions {
    /**
     * Dry-run: perform the SELECT and the fetch API calls, BUT do not
     * INSERT new rows. Logs what would be written. Useful for verifying
     * Twitter bearer / Moltbook API auth without polluting the table.
     *
     * Session 28 Task 5 (engagement-fetcher verification): invoke
     * pollPostEngagement(db, { dryRun: true }) from the admin panel or
     * an ops script to smoke-test the full pipeline end-to-end.
     */
    dryRun?: boolean
}

export interface PollResult {
    sampled: number                 // snapshots inserted (or would-be-inserted in dry-run)
    skipped: number                 // posts returned by SELECT but fetch returned null
    errors: number                  // per-post fetch/insert errors
    dryRun: boolean
    byPlatform: Record<string, number>
}

/**
 * Main engagement poll. Intended to be called hourly (or on-demand from
 * admin). Iterates recent posts with external ids, fetches current
 * metrics per platform, writes fresh snapshot row to post_engagement.
 *
 * Session 28 — now returns a richer PollResult for admin observability.
 * The previous `Promise<number>` signature is preserved by the wrapper
 * below (pollPostEngagementCount) for existing call sites.
 */
export async function pollPostEngagementDetailed(db: Pool, opts: PollOptions = {}): Promise<PollResult> {
    const result: PollResult = {
        sampled: 0,
        skipped: 0,
        errors: 0,
        dryRun: Boolean(opts.dryRun),
        byPlatform: {},
    }
    const _countByPlatform = (platform: string) => {
        result.byPlatform[platform] = (result.byPlatform[platform] || 0) + 1
    }
    try {
        return await _pollInner(db, opts, result, _countByPlatform)
    } catch (err: any) {
        console.error(`[engagement] poll error: ${err.message?.slice(0, 80)}`)
        result.errors++
        return result
    }
}

/**
 * Thin wrapper preserving the legacy `Promise<number>` return for
 * scheduler call sites that only need the count.
 */
export async function pollPostEngagement(db: Pool): Promise<number> {
    const r = await pollPostEngagementDetailed(db)
    return r.sampled
}

async function _pollInner(
    db: Pool,
    opts: PollOptions,
    result: PollResult,
    _countByPlatform: (p: string) => void,
): Promise<PollResult> {
    // 1. Find recent posts we have external ids for. Join through
    //    post_engagement to get the t=0 seed row's metadata (category,
    //    tone, format). Exclude posts where we sampled < 15 min ago.
    const selectResult = await db.query<RecentPost>(
        `SELECT DISTINCT ON (pe.post_uuid, pe.platform, pe.external_post_id)
                pe.post_uuid, pe.platform, pe.external_post_id,
                gap.posted_at
         FROM post_engagement pe
         LEFT JOIN growth_agent_posts gap ON gap.id = pe.post_uuid
         WHERE pe.external_post_id IS NOT NULL
           AND pe.platform IN ('moltbook', 'twitter')
           AND (gap.posted_at IS NULL OR gap.posted_at > now() - interval '${MAX_AGE_DAYS} days')
           AND NOT EXISTS (
             SELECT 1 FROM post_engagement pe2
             WHERE pe2.post_uuid = pe.post_uuid
               AND pe2.platform = pe.platform
               AND pe2.sampled_at > now() - interval '${Math.floor(SAMPLE_DEDUP_MS / 60000)} minutes'
               AND pe2.likes + pe2.retweets + pe2.replies + pe2.impressions + pe2.clicks > 0
           )
         ORDER BY pe.post_uuid, pe.platform, pe.external_post_id, pe.sampled_at DESC
         LIMIT 50`  // safety cap — never poll more than 50 posts per cycle
    )

    if (selectResult.rows.length === 0) {
        return result
    }

    for (const post of selectResult.rows) {
        const externalId = post.external_post_id
        if (!externalId) continue

        let metrics: EngagementSnapshot | null = null
        try {
            if (post.platform === 'moltbook') {
                metrics = await fetchMoltbookEngagement(externalId)
            } else if (post.platform === 'twitter') {
                metrics = await fetchTwitterEngagement(externalId)
            }
        } catch (err: any) {
            console.warn(`[engagement] ${post.platform}/${externalId} fetch error: ${err.message?.slice(0, 80)}`)
            result.errors++
            continue
        }

        if (!metrics) {
            // skipped (no token, 404, etc.) — don't write an empty row
            result.skipped++
            continue
        }

        // Engagement rate: (likes + retweets + replies) / max(impressions, 1).
        // We wrap in a ternary so no-impressions cases don't divide by zero.
        const interactions = metrics.likes + metrics.retweets + metrics.replies
        const rate = metrics.impressions > 0
            ? interactions / metrics.impressions
            : null

        if (opts.dryRun) {
            console.log(`[engagement:dry] ${post.platform}/${externalId} would write: likes=${metrics.likes} rt=${metrics.retweets} replies=${metrics.replies} imp=${metrics.impressions} clicks=${metrics.clicks} rate=${rate?.toFixed(4) ?? 'null'}`)
            result.sampled++
            _countByPlatform(post.platform)
            continue
        }

        try {
            await db.query(
                `INSERT INTO post_engagement
                 (post_uuid, platform, external_post_id,
                  category, tone, post_format,
                  likes, retweets, replies, impressions, clicks, engagement_rate,
                  sampled_at)
                 SELECT $1, $2, $3,
                        category, tone, post_format,
                        $4, $5, $6, $7, $8, $9,
                        now()
                 FROM post_engagement
                 WHERE post_uuid = $1 AND platform = $2
                 ORDER BY sampled_at ASC LIMIT 1`,
                [
                    post.post_uuid,
                    post.platform,
                    externalId,
                    metrics.likes,
                    metrics.retweets,
                    metrics.replies,
                    metrics.impressions,
                    metrics.clicks,
                    rate,
                ]
            )
            result.sampled++
            _countByPlatform(post.platform)
        } catch (e: any) {
            console.warn(`[engagement] insert failed for ${post.platform}/${externalId}: ${e.message?.slice(0, 80)}`)
            result.errors++
        }
    }

    if (result.sampled > 0) {
        const prefix = opts.dryRun ? '[engagement:dry]' : '[engagement]'
        console.log(`${prefix} Sampled ${result.sampled}/${selectResult.rows.length} posts (skipped=${result.skipped} errors=${result.errors})`)
    }
    return result
}

/**
 * On-demand single-post poll. Useful for admin UI "refresh metrics now" button.
 */
export async function pollSinglePost(db: Pool, postUuid: string): Promise<boolean> {
    try {
        const result = await db.query<RecentPost>(
            `SELECT post_uuid, platform, external_post_id, now() as posted_at
             FROM post_engagement
             WHERE post_uuid = $1 AND external_post_id IS NOT NULL
             ORDER BY sampled_at ASC LIMIT 1`,
            [postUuid]
        )
        if (result.rows.length === 0) return false
        const post = result.rows[0]
        const externalId = post.external_post_id
        if (!externalId) return false

        let metrics: EngagementSnapshot | null = null
        if (post.platform === 'moltbook') metrics = await fetchMoltbookEngagement(externalId)
        else if (post.platform === 'twitter') metrics = await fetchTwitterEngagement(externalId)
        if (!metrics) return false

        const interactions = metrics.likes + metrics.retweets + metrics.replies
        const rate = metrics.impressions > 0 ? interactions / metrics.impressions : null

        await db.query(
            `INSERT INTO post_engagement
             (post_uuid, platform, external_post_id,
              category, tone, post_format,
              likes, retweets, replies, impressions, clicks, engagement_rate)
             SELECT $1, $2, $3, category, tone, post_format, $4, $5, $6, $7, $8, $9
             FROM post_engagement WHERE post_uuid = $1 AND platform = $2
             ORDER BY sampled_at ASC LIMIT 1`,
            [post.post_uuid, post.platform, externalId,
             metrics.likes, metrics.retweets, metrics.replies, metrics.impressions, metrics.clicks, rate]
        )
        return true
    } catch {
        return false
    }
}

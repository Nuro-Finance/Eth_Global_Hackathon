/**
 * ─── LEARNING LOOP v1 ────────────────────────────────────────────────────────
 *
 * Session 26 groundwork — post-engagement-weighted tone + format selection.
 *
 * The thought-engine + content generator already emit `tone` and `format`
 * per post (logged to post_engagement.tone + post_format when a post
 * goes live). After ~1 week of live-token engagement data, we can start
 * weighting future selections by measured performance.
 *
 * This module is the "even without data" foundation:
 *   - reads post_engagement aggregates
 *   - computes per-(tone, format, category) engagement-rate percentiles
 *   - exposes `selectWeightedTone()` + `selectWeightedFormat()` that
 *     prefer high-performers but keep 20% exploration to avoid
 *     premature optimization on small samples
 *
 * The content generator doesn't import this yet — it still uses
 * deterministic template-driven tone/format. When engagement data starts
 * flowing (TWITTER_BEARER_TOKEN + MOLTBOOK_AGENT_TOKEN configured), wire
 * `selectWeightedTone()` into thought-engine.decideStrategy() and the
 * loop closes.
 *
 * Safe when post_engagement is empty: falls back to uniform random.
 */

import type { Pool } from 'pg'

export interface ToneFormatPerformance {
  tone: string
  format: string
  category: string | null
  sample_count: number
  avg_engagement_rate: number
  avg_likes: number
  percentile: number  // 0-100, computed within same category
}

const EXPLORATION_RATE = 0.2  // 20% of selections ignore performance

/**
 * Aggregate post_engagement into per-(tone, format, category) stats.
 * Only looks at rows >= 24h old (need time for engagement to accrue).
 */
export async function computePerformance(
  db: Pool,
  windowDays: number = 30
): Promise<ToneFormatPerformance[]> {
  const result = await db.query(
    `WITH ranked AS (
       SELECT tone, post_format AS format, category,
              AVG(COALESCE(engagement_rate, 0)) AS avg_engagement_rate,
              AVG(COALESCE(likes, 0)) AS avg_likes,
              COUNT(*) AS sample_count
       FROM post_engagement
       WHERE tone IS NOT NULL AND post_format IS NOT NULL
         AND sampled_at >= now() - interval '${windowDays} days'
         AND sampled_at <= now() - interval '24 hours'
       GROUP BY tone, post_format, category
       HAVING COUNT(*) >= 2
     )
     SELECT tone, format, category, sample_count,
            avg_engagement_rate, avg_likes,
            PERCENT_RANK() OVER (
              PARTITION BY category
              ORDER BY avg_engagement_rate
            ) * 100 AS percentile
     FROM ranked
     ORDER BY category NULLS LAST, percentile DESC`
  ).catch(() => ({ rows: [] }))

  return result.rows.map((r: any) => ({
    tone: r.tone,
    format: r.format,
    category: r.category,
    sample_count: parseInt(r.sample_count) || 0,
    avg_engagement_rate: parseFloat(r.avg_engagement_rate) || 0,
    avg_likes: parseFloat(r.avg_likes) || 0,
    percentile: parseFloat(r.percentile) || 0,
  }))
}

/**
 * Given a candidate list of tones + a category context, pick one weighted
 * by historical engagement. 20% of the time, ignore history (exploration).
 *
 * Returns null if candidates is empty.
 */
export async function selectWeightedTone(
  db: Pool,
  candidates: string[],
  category: string | null = null
): Promise<string | null> {
  if (candidates.length === 0) return null

  // Exploration lane — uniform random, ignores history
  if (Math.random() < EXPLORATION_RATE) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  // Exploitation — fetch category-matched stats, weight by percentile
  const perf = await computePerformance(db)
  const byTone = new Map<string, number>()
  for (const row of perf) {
    if (category && row.category !== category) continue
    // Percentile is 0-100 — use as weight, but floor at 10 so zero-stat
    // options still get some chance.
    const existing = byTone.get(row.tone) || 0
    byTone.set(row.tone, Math.max(existing, Math.max(row.percentile, 10)))
  }

  // Build weighted list. Unknown tones get default weight of 25 (slightly
  // below median so known-good slightly preferred but we still try new ones).
  const weights = candidates.map(c => byTone.get(c) ?? 25)
  const total = weights.reduce((s, w) => s + w, 0)
  if (total === 0) return candidates[Math.floor(Math.random() * candidates.length)]

  let pick = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i]
    if (pick <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

/**
 * Mirror of selectWeightedTone() for post format (e.g. 'short' | 'thread' |
 * 'listicle' | 'image' | 'video'). Same exploration/exploitation split.
 */
export async function selectWeightedFormat(
  db: Pool,
  candidates: string[],
  category: string | null = null
): Promise<string | null> {
  if (candidates.length === 0) return null

  if (Math.random() < EXPLORATION_RATE) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  const perf = await computePerformance(db)
  const byFormat = new Map<string, number>()
  for (const row of perf) {
    if (category && row.category !== category) continue
    const existing = byFormat.get(row.format) || 0
    byFormat.set(row.format, Math.max(existing, Math.max(row.percentile, 10)))
  }

  const weights = candidates.map(c => byFormat.get(c) ?? 25)
  const total = weights.reduce((s, w) => s + w, 0)
  if (total === 0) return candidates[Math.floor(Math.random() * candidates.length)]

  let pick = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i]
    if (pick <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

/**
 * Admin console read — summarise performance for dashboard display.
 * Returns top 5 + bottom 5 by engagement rate within the category.
 */
export async function getPerformanceSummary(
  db: Pool
): Promise<{ top: ToneFormatPerformance[]; bottom: ToneFormatPerformance[]; sample_count: number }> {
  const perf = await computePerformance(db)
  const sorted = [...perf].sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)
  return {
    top: sorted.slice(0, 5),
    bottom: sorted.slice(-5).reverse(),
    sample_count: perf.reduce((s, r) => s + r.sample_count, 0),
  }
}

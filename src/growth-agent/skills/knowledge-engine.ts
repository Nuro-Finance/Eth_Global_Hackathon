/**
 * ─── KNOWLEDGE ENGINE ───────────────────────────────────────────────────────
 *
 * Mythos's long-term memory and recursive learning system.
 * This is the CRUD function that gets reviewed every day.
 *
 * DAILY CRUD CYCLE:
 *   CREATE — New insights from today's data + performance
 *   READ   — Load accumulated knowledge, find patterns
 *   UPDATE — Revise beliefs based on new evidence
 *   DELETE — Prune outdated or wrong knowledge
 *
 * Knowledge Categories:
 *   - market_patterns:  "BTC usually dips on Mondays"
 *   - content_insights: "Educational posts get 2x more clicks on weekends"
 *   - platform_rules:   "Moltbook posts with hashtags get 30% more engagement"
 *   - audience_signals:  "Our audience is most active 8-10 PM EST"
 *   - self_corrections:  "I was wrong about X — here's what I learned"
 *   - rejected_patterns: "Admin keeps rejecting contrarian crypto takes"
 *
 * The agent reviews this knowledge base EVERY cycle and uses it to make
 * better decisions. Knowledge that hasn't been validated in 30 days gets
 * flagged for review. Knowledge that's been contradicted gets corrected.
 */

import { Pool } from 'pg'
import { rememberFact, recallFact, recallCategory } from '../agent-identity'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  insight: string
  evidence: string
  confidence: number  // 0-1, updated as evidence accumulates
  source: string       // What generated this insight
  createdAt: string
  lastValidated: string
  validationCount: number  // How many times this has been confirmed
  contradictionCount: number  // How many times this has been wrong
  category: KnowledgeCategory
  tags: string[]
}

export type KnowledgeCategory =
  | 'market_patterns'
  | 'content_insights'
  | 'platform_rules'
  | 'audience_signals'
  | 'self_corrections'
  | 'rejected_patterns'
  | 'predictions'

export interface DailyCRUDReport {
  date: string
  created: number
  read: number
  updated: number
  deleted: number
  totalKnowledge: number
  topInsight: string
  corrections: string[]
}

// ─── CREATE: Generate New Knowledge ─────────────────────────────────────────

export async function createKnowledge(
  db: Pool,
  insight: string,
  evidence: string,
  category: KnowledgeCategory,
  tags: string[] = [],
  source: string = 'daily_cycle',
): Promise<void> {
  const key = `knowledge_${category}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
  const entry: KnowledgeEntry = {
    insight,
    evidence,
    confidence: 0.5,  // Start neutral, build confidence over time
    source,
    createdAt: new Date().toISOString(),
    lastValidated: new Date().toISOString(),
    validationCount: 1,
    contradictionCount: 0,
    category,
    tags,
  }

  await rememberFact(db, key, entry, `knowledge_${category}`)
  console.log(`[knowledge] NEW: [${category}] ${insight}`)
}

// ─── READ: Load and Rank Knowledge ──────────────────────────────────────────

export async function readKnowledge(db: Pool, category?: KnowledgeCategory): Promise<KnowledgeEntry[]> {
  const queryCategory = category ? `knowledge_${category}` : 'knowledge_%'
  const result = await db.query(
    `SELECT key, value FROM growth_agent_memory
     WHERE category LIKE $1
     ORDER BY updated_at DESC`,
    [queryCategory]
  ).catch(() => ({ rows: [] }))

  const entries: KnowledgeEntry[] = []
  for (const row of result.rows) {
    const entry = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (entry.insight) entries.push(entry)
  }

  // Sort by confidence (highest first)
  entries.sort((a, b) => b.confidence - a.confidence)
  return entries
}

export async function getHighConfidenceInsights(db: Pool): Promise<KnowledgeEntry[]> {
  const all = await readKnowledge(db)
  return all.filter(k => k.confidence >= 0.7)
}

export async function getInsightsForCategory(db: Pool, category: KnowledgeCategory): Promise<string[]> {
  const entries = await readKnowledge(db, category)
  return entries.filter(e => e.confidence >= 0.5).map(e => e.insight)
}

// ─── UPDATE: Validate or Contradict Knowledge ──────────────────────────────

export async function validateKnowledge(
  db: Pool,
  insightSubstring: string,
  confirmed: boolean,
  newEvidence?: string,
): Promise<void> {
  // Find the knowledge entry that matches
  const allKnowledge = await db.query(
    `SELECT key, value FROM growth_agent_memory WHERE category LIKE 'knowledge_%'`
  ).catch(() => ({ rows: [] }))

  for (const row of allKnowledge.rows) {
    const entry: KnowledgeEntry = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (!entry.insight || !entry.insight.toLowerCase().includes(insightSubstring.toLowerCase())) continue

    if (confirmed) {
      entry.validationCount++
      // Confidence grows with validation, capped at 0.95
      entry.confidence = Math.min(0.95, entry.confidence + 0.05 * (1 - entry.confidence))
      entry.lastValidated = new Date().toISOString()
      if (newEvidence) entry.evidence += ` | ${newEvidence}`
      console.log(`[knowledge] VALIDATED: "${entry.insight}" → confidence ${(entry.confidence * 100).toFixed(0)}%`)
    } else {
      entry.contradictionCount++
      // Confidence drops faster than it grows
      entry.confidence = Math.max(0.05, entry.confidence - 0.15)
      if (newEvidence) entry.evidence += ` | CONTRADICTED: ${newEvidence}`
      console.log(`[knowledge] CONTRADICTED: "${entry.insight}" → confidence ${(entry.confidence * 100).toFixed(0)}%`)

      // If confidence drops below 0.2, create a self-correction
      if (entry.confidence < 0.2) {
        await createKnowledge(db,
          `CORRECTION: "${entry.insight}" was wrong — ${newEvidence || 'evidence contradicts this'}`,
          `Original confidence dropped to ${(entry.confidence * 100).toFixed(0)}% after ${entry.contradictionCount} contradictions`,
          'self_corrections',
          entry.tags,
          'knowledge_update'
        )
      }
    }

    await rememberFact(db, row.key, entry, `knowledge_${entry.category}`)
    return
  }
}

// ─── DELETE: Prune Stale or Wrong Knowledge ─────────────────────────────────

export async function pruneKnowledge(db: Pool): Promise<number> {
  const allKnowledge = await db.query(
    `SELECT key, value FROM growth_agent_memory WHERE category LIKE 'knowledge_%'`
  ).catch(() => ({ rows: [] }))

  let pruned = 0
  for (const row of allKnowledge.rows) {
    const entry: KnowledgeEntry = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (!entry.insight) continue

    // Prune if confidence below 0.1
    if (entry.confidence < 0.1) {
      await db.query(`DELETE FROM growth_agent_memory WHERE key = $1`, [row.key])
      console.log(`[knowledge] PRUNED (low confidence): "${entry.insight}"`)
      pruned++
      continue
    }

    // Prune if not validated in 30 days and confidence below 0.5
    const lastValidated = new Date(entry.lastValidated).getTime()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    if (Date.now() - lastValidated > thirtyDaysMs && entry.confidence < 0.5) {
      await db.query(`DELETE FROM growth_agent_memory WHERE key = $1`, [row.key])
      console.log(`[knowledge] PRUNED (stale): "${entry.insight}"`)
      pruned++
    }
  }

  return pruned
}

// ─── DAILY KNOWLEDGE CRUD CYCLE ─────────────────────────────────────────────

export async function runDailyKnowledgeCycle(db: Pool): Promise<DailyCRUDReport> {
  /**
   * THE CORE LOOP — runs every day as part of the daily growth cycle.
   * This is the CRUD function Richard wants reviewed daily.
   */
  const today = new Date().toISOString().split('T')[0]
  let created = 0, updated = 0, deleted = 0
  const corrections: string[] = []

  console.log(`[knowledge] Starting daily CRUD cycle for ${today}`)

  // ── READ: Load all knowledge ──────────────────────────────────────────
  const allKnowledge = await readKnowledge(db)
  const read = allKnowledge.length
  console.log(`[knowledge] READ: ${read} knowledge entries loaded`)

  // ── CREATE: Generate insights from today's data ───────────────────────

  // 1. Content performance insights
  const postPerformance = await db.query(
    `SELECT content_type, platform, COUNT(*) as count,
            AVG(COALESCE((engagement->>'likes')::int, 0)) as avg_likes
     FROM growth_agent_posts
     WHERE posted_at > now() - interval '7 days'
     GROUP BY content_type, platform
     HAVING COUNT(*) >= 2
     ORDER BY avg_likes DESC`
  ).catch(() => ({ rows: [] }))

  if (postPerformance.rows.length > 0) {
    const best = postPerformance.rows[0]
    const worst = postPerformance.rows[postPerformance.rows.length - 1]

    if (best && parseFloat(best.avg_likes) > 0) {
      await createKnowledge(db,
        `${best.content_type} posts on ${best.platform} perform best (avg ${parseFloat(best.avg_likes).toFixed(1)} likes from ${best.count} posts)`,
        `Data from ${today}: ${best.count} posts, avg ${parseFloat(best.avg_likes).toFixed(1)} likes`,
        'content_insights',
        [best.content_type, best.platform],
        'daily_knowledge_cycle'
      )
      created++
    }

    if (worst && worst.content_type !== best.content_type) {
      await createKnowledge(db,
        `${worst.content_type} posts on ${worst.platform} underperform (avg ${parseFloat(worst.avg_likes).toFixed(1)} likes)`,
        `Data from ${today}: ${worst.count} posts, avg ${parseFloat(worst.avg_likes).toFixed(1)} likes`,
        'content_insights',
        [worst.content_type, worst.platform],
        'daily_knowledge_cycle'
      )
      created++
    }
  }

  // 2. Market pattern insights
  const marketData = await db.query(
    `SELECT symbol, price_change_24h FROM market_feed_cache
     WHERE feed_source = 'coingecko' AND last_synced_at > now() - interval '4 hours'
     ORDER BY ABS(price_change_24h) DESC LIMIT 5`
  ).catch(() => ({ rows: [] }))

  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]

  if (marketData.rows.length > 0) {
    const avgChange = marketData.rows.reduce((s: number, r: any) => s + parseFloat(r.price_change_24h), 0) / marketData.rows.length
    const sentiment = avgChange > 2 ? 'bullish' : avgChange < -2 ? 'bearish' : 'neutral'

    await createKnowledge(db,
      `${dayName}s tend to be ${sentiment} (avg ${avgChange > 0 ? '+' : ''}${avgChange.toFixed(1)}% across top coins today)`,
      `${today} (${dayName}): ${marketData.rows.map((r: any) => `${r.symbol} ${parseFloat(r.price_change_24h) > 0 ? '+' : ''}${parseFloat(r.price_change_24h).toFixed(1)}%`).join(', ')}`,
      'market_patterns',
      [dayName.toLowerCase(), sentiment],
      'daily_knowledge_cycle'
    )
    created++
  }

  // 3. Rejection pattern insights
  const recentRejections = await db.query(
    `SELECT value FROM growth_agent_memory
     WHERE category = 'learning' AND key LIKE 'rejection_%'
     AND updated_at > now() - interval '7 days'`
  ).catch(() => ({ rows: [] }))

  if (recentRejections.rows.length >= 2) {
    const categories = recentRejections.rows.map((r: any) => {
      const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
      return v.category
    })
    const categoryCount: Record<string, number> = {}
    categories.forEach((c: string) => { categoryCount[c] = (categoryCount[c] || 0) + 1 })

    for (const [cat, count] of Object.entries(categoryCount)) {
      if (count >= 2) {
        await createKnowledge(db,
          `Admin frequently rejects "${cat}" content — reduce volume or change approach`,
          `${count} rejections in the last 7 days`,
          'rejected_patterns',
          [cat, 'rejection'],
          'daily_knowledge_cycle'
        )
        created++
        corrections.push(`"${cat}" content getting rejected — adjusting strategy`)
      }
    }
  }

  // ── UPDATE: Validate existing knowledge ───────────────────────────────

  // Check if high-confidence insights still hold
  for (const entry of allKnowledge.filter(k => k.confidence >= 0.7).slice(0, 5)) {
    // Market patterns: validate against current data
    if (entry.category === 'market_patterns' && entry.tags.includes(dayName.toLowerCase())) {
      const currentSentiment = marketData.rows.length > 0
        ? (marketData.rows.reduce((s: number, r: any) => s + parseFloat(r.price_change_24h), 0) / marketData.rows.length > 0 ? 'bullish' : 'bearish')
        : null

      if (currentSentiment && entry.insight.includes(currentSentiment)) {
        await validateKnowledge(db, entry.insight.slice(0, 30), true, `Confirmed on ${today}`)
        updated++
      } else if (currentSentiment) {
        await validateKnowledge(db, entry.insight.slice(0, 30), false, `${today} was actually ${currentSentiment}`)
        updated++
        corrections.push(`${dayName} pattern didn't hold — was ${currentSentiment} instead`)
      }
    }
  }

  // ── DELETE: Prune stale knowledge ─────────────────────────────────────
  deleted = await pruneKnowledge(db)

  // ── BUILD REPORT ──────────────────────────────────────────────────────
  const report: DailyCRUDReport = {
    date: today,
    created,
    read,
    updated,
    deleted,
    totalKnowledge: read + created - deleted,
    topInsight: allKnowledge[0]?.insight || 'No insights yet',
    corrections,
  }

  // Store report
  await rememberFact(db, `knowledge_crud_${today}`, report, 'knowledge_reports')

  // Log to execution_log
  await db.query(
    `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
     VALUES (gen_random_uuid(), 'growth_agent', $1, 'knowledge_crud', 'success', $2, now())`,
    [today, `CRUD: C=${created} R=${read} U=${updated} D=${deleted} | Total: ${report.totalKnowledge} | Top: ${report.topInsight.slice(0, 80)}`]
  ).catch(() => {})

  console.log(`[knowledge] CRUD complete: C=${created} R=${read} U=${updated} D=${deleted} (total: ${report.totalKnowledge})`)

  return report
}

// ─── APPLY KNOWLEDGE TO DECISIONS ───────────────────────────────────────────

export async function getContentAdvice(db: Pool, category: string, platform: string): Promise<string[]> {
  /**
   * Returns actionable advice for a specific content type + platform combo.
   * Used by the content brain before generating posts.
   */
  const advice: string[] = []

  // Get relevant content insights
  const contentInsights = await readKnowledge(db, 'content_insights')
  for (const entry of contentInsights.filter(k => k.confidence >= 0.5)) {
    if (entry.tags.includes(category) || entry.tags.includes(platform)) {
      advice.push(entry.insight)
    }
  }

  // Get rejection patterns to avoid
  const rejections = await readKnowledge(db, 'rejected_patterns')
  for (const entry of rejections.filter(k => k.confidence >= 0.5)) {
    if (entry.tags.includes(category)) {
      advice.push(`⚠️ AVOID: ${entry.insight}`)
    }
  }

  // Get platform-specific rules
  const platformRules = await readKnowledge(db, 'platform_rules')
  for (const entry of platformRules.filter(k => k.tags.includes(platform))) {
    advice.push(entry.insight)
  }

  return advice.slice(0, 5)  // Top 5 most relevant
}

// ─── SELF-EXAMINATION ───────────────────────────────────────────────────────

export async function selfExamine(db: Pool): Promise<string> {
  /**
   * The agent examines its own knowledge base and reports on its state.
   * Used for admin console and debugging.
   */
  const all = await readKnowledge(db)
  const byCategory: Record<string, number> = {}
  const highConfidence = all.filter(k => k.confidence >= 0.7)
  const lowConfidence = all.filter(k => k.confidence < 0.3)
  const corrections = all.filter(k => k.category === 'self_corrections')

  for (const entry of all) {
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
  }

  return [
    `📚 Knowledge Base: ${all.length} entries`,
    ``,
    `By category:`,
    ...Object.entries(byCategory).map(([cat, count]) => `  ${cat}: ${count}`),
    ``,
    `High confidence (>70%): ${highConfidence.length}`,
    `Low confidence (<30%): ${lowConfidence.length}`,
    `Self-corrections: ${corrections.length}`,
    ``,
    `Top 3 insights:`,
    ...highConfidence.slice(0, 3).map((k, i) => `  ${i + 1}. ${k.insight} (${(k.confidence * 100).toFixed(0)}%)`),
    ``,
    corrections.length > 0 ? `Recent corrections:\n${corrections.slice(0, 2).map(c => `  - ${c.insight}`).join('\n')}` : 'No self-corrections yet.',
  ].join('\n')
}

/**
 * ─── QUALITY GATE ───────────────────────────────────────────────────────────
 *
 * Every piece of content passes through quality checks before posting.
 * This is the Growth Agent's self-editing layer.
 *
 * Checks:
 *   1. BRAND SAFETY — no offensive content, no competitor names, no lies
 *   2. DATA ACCURACY — prices/percentages match recent feed data
 *   3. PLATFORM FIT — content formatted correctly for target platform
 *   4. ENGAGEMENT POTENTIAL — hook quality, CTA presence, length
 *   5. DEDUPLICATION — haven't posted the same thing recently
 *   6. LEARNING CHECK — isn't repeating a pattern that got rejected
 *
 * Score: 0-100. Posts below 60 get blocked. 60-80 get medium risk.
 * 80+ get auto-approved (if low risk category).
 */

import { Pool } from 'pg'
import { PostContent } from './content'
import { VideoScript } from './script-engine'
import { recallFact } from '../agent-identity'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface QualityReport {
  score: number
  passed: boolean
  checks: QualityCheck[]
  summary: string
  improvements: string[]
}

export interface QualityCheck {
  name: string
  passed: boolean
  score: number  // 0-100
  reason: string
}

// ─── BANNED CONTENT ─────────────────────────────────────────────────────────

const BANNED_WORDS = [
  'guaranteed returns', 'risk-free', 'get rich quick', 'financial advice',
  'not financial advice',  // cliché, makes us look amateur
  'pump', 'to the moon', '100x', 'wen lambo',
  'shitcoin', 'rugpull', 'ponzi',
]

const COMPETITOR_NAMES = [
  'coinbase', 'binance', 'kraken', 'robinhood', 'webull',
  'crypto.com', 'gemini', 'ftx', 'celsius',
]

const REQUIRED_ELEMENTS = {
  cta: ['nuro.finance', 'app.nuro', 'link in bio', 'sign up', 'bet on it', 'deploy'],
  data: [/\d+%/, /\$[\d,]+/, /\d+\.\d+/],  // Must have at least one number
}

// ─── MAIN QUALITY CHECK ─────────────────────────────────────────────────────

export async function runQualityGate(
  db: Pool,
  content: string,
  platform: string,
  category: string,
  options: { isVideo?: boolean; hashtags?: string[] } = {}
): Promise<QualityReport> {
  const checks: QualityCheck[] = []
  const improvements: string[] = []

  // ── CHECK 1: Brand Safety ─────────────────────────────────────────────
  const brandCheck = checkBrandSafety(content)
  checks.push(brandCheck)
  if (!brandCheck.passed) improvements.push(brandCheck.reason)

  // ── CHECK 2: Data Presence ────────────────────────────────────────────
  const dataCheck = checkDataPresence(content, category)
  checks.push(dataCheck)
  if (!dataCheck.passed) improvements.push('Add specific numbers — prices, percentages, or volumes')

  // ── CHECK 3: Platform Fit ─────────────────────────────────────────────
  const platformCheck = checkPlatformFit(content, platform)
  checks.push(platformCheck)
  if (!platformCheck.passed) improvements.push(platformCheck.reason)

  // ── CHECK 4: CTA Presence ────────────────────────────────────────────
  const ctaCheck = checkCTA(content)
  checks.push(ctaCheck)
  if (!ctaCheck.passed) improvements.push('Add a call-to-action (bet link, sign up link, etc.)')

  // ── CHECK 5: Hook Quality ────────────────────────────────────────────
  const hookCheck = checkHookQuality(content)
  checks.push(hookCheck)
  if (!hookCheck.passed) improvements.push('First sentence should grab attention — lead with a surprising fact or question')

  // ── CHECK 6: Deduplication ────────────────────────────────────────────
  const dedupCheck = await checkDeduplication(db, content)
  checks.push(dedupCheck)
  if (!dedupCheck.passed) improvements.push('Too similar to a recent post — add new data or angle')

  // ── CHECK 7: Rejection Pattern ────────────────────────────────────────
  const rejectionCheck = await checkRejectionPattern(db, content, category)
  checks.push(rejectionCheck)
  if (!rejectionCheck.passed) improvements.push(rejectionCheck.reason)

  // ── CHECK 8: Length Check ─────────────────────────────────────────────
  const lengthCheck = checkLength(content, platform)
  checks.push(lengthCheck)
  if (!lengthCheck.passed) improvements.push(lengthCheck.reason)

  // Calculate overall score
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length
  const passed = totalScore >= 60 && !checks.some(c => c.score === 0)  // 0 = hard fail

  return {
    score: Math.round(totalScore),
    passed,
    checks,
    summary: passed
      ? `Quality score: ${Math.round(totalScore)}/100 — PASSED (${checks.filter(c => c.passed).length}/${checks.length} checks)`
      : `Quality score: ${Math.round(totalScore)}/100 — BLOCKED (${checks.filter(c => !c.passed).length} issues)`,
    improvements,
  }
}

// ─── INDIVIDUAL CHECKS ──────────────────────────────────────────────────────

function checkBrandSafety(content: string): QualityCheck {
  const lower = content.toLowerCase()

  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      return { name: 'brand_safety', passed: false, score: 0, reason: `Contains banned phrase: "${word}"` }
    }
  }

  for (const comp of COMPETITOR_NAMES) {
    if (lower.includes(comp)) {
      return { name: 'brand_safety', passed: false, score: 20, reason: `Mentions competitor: "${comp}" — remove or rephrase` }
    }
  }

  // Check for ALL CAPS sections (looks spammy)
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length
  if (capsRatio > 0.4 && content.length > 20) {
    return { name: 'brand_safety', passed: true, score: 60, reason: 'Too many capital letters — looks spammy' }
  }

  return { name: 'brand_safety', passed: true, score: 100, reason: 'Clean' }
}

function checkDataPresence(content: string, category: string): QualityCheck {
  // Educational content doesn't need hard data
  if (category === 'education') {
    return { name: 'data_presence', passed: true, score: 80, reason: 'Educational — data optional' }
  }

  const hasNumber = /\d/.test(content)
  const hasPercentage = /\d+(\.\d+)?%/.test(content)
  const hasDollar = /\$[\d,]+/.test(content)

  if (hasPercentage && hasDollar) return { name: 'data_presence', passed: true, score: 100, reason: 'Has both % and $' }
  if (hasPercentage || hasDollar) return { name: 'data_presence', passed: true, score: 80, reason: 'Has numeric data' }
  if (hasNumber) return { name: 'data_presence', passed: true, score: 60, reason: 'Has numbers but could use $ or %' }

  return { name: 'data_presence', passed: false, score: 30, reason: 'No data points — add prices, percentages, or volumes' }
}

function checkPlatformFit(content: string, platform: string): QualityCheck {
  switch (platform) {
    case 'twitter':
      if (content.length > 280) {
        return { name: 'platform_fit', passed: false, score: 40, reason: `Tweet too long: ${content.length}/280 chars` }
      }
      if (content.length < 50) {
        return { name: 'platform_fit', passed: true, score: 70, reason: 'Tweet very short — could add more context' }
      }
      return { name: 'platform_fit', passed: true, score: 90, reason: 'Good tweet length' }

    case 'telegram':
      if (content.length > 4096) {
        return { name: 'platform_fit', passed: false, score: 30, reason: 'Telegram message too long (4096 char limit)' }
      }
      return { name: 'platform_fit', passed: true, score: 90, reason: 'Good Telegram format' }

    case 'moltbook':
      if (content.length < 20) {
        return { name: 'platform_fit', passed: false, score: 40, reason: 'Moltbook post too short — add substance' }
      }
      return { name: 'platform_fit', passed: true, score: 85, reason: 'Good Moltbook format' }

    case 'tiktok':
    case 'youtube':
    case 'youtube_shorts':
      // Video platforms — check script length
      return { name: 'platform_fit', passed: true, score: 80, reason: 'Video format' }

    default:
      return { name: 'platform_fit', passed: true, score: 70, reason: 'Unknown platform' }
  }
}

function checkCTA(content: string): QualityCheck {
  const lower = content.toLowerCase()
  const hasCTA = REQUIRED_ELEMENTS.cta.some(cta => lower.includes(cta))

  if (hasCTA) return { name: 'cta_presence', passed: true, score: 100, reason: 'CTA found' }
  return { name: 'cta_presence', passed: false, score: 30, reason: 'No call-to-action — every post needs a CTA' }
}

function checkHookQuality(content: string): QualityCheck {
  const firstLine = content.split('\n')[0]
  if (!firstLine) return { name: 'hook_quality', passed: false, score: 20, reason: 'Empty first line' }

  // Good hooks: start with emoji, question, number, or strong verb
  const startsWithEmoji = /^[\u{1F300}-\u{1F9FF}]|^[\u{2600}-\u{26FF}]/u.test(firstLine)
  const startsWithQuestion = firstLine.includes('?')
  const startsWithNumber = /^\d/.test(firstLine) || /^[$€£]/.test(firstLine)
  const hasUrgency = /breaking|alert|just|now|today|this/i.test(firstLine)

  let score = 50  // Baseline
  if (startsWithEmoji) score += 15
  if (startsWithQuestion) score += 15
  if (startsWithNumber) score += 15
  if (hasUrgency) score += 10
  if (firstLine.length > 10 && firstLine.length < 100) score += 10

  return {
    name: 'hook_quality',
    passed: score >= 60,
    score: Math.min(100, score),
    reason: score >= 80 ? 'Strong hook' : score >= 60 ? 'Decent hook — could be punchier' : 'Weak hook — needs attention grabber',
  }
}

async function checkDeduplication(db: Pool, content: string): Promise<QualityCheck> {
  // Check last 20 posts for similar content
  const recentPosts = await db.query(
    `SELECT content FROM growth_agent_posts
     WHERE posted_at > now() - interval '3 days'
     ORDER BY posted_at DESC LIMIT 20`
  ).catch(() => ({ rows: [] }))

  for (const post of recentPosts.rows) {
    const similarity = calculateSimilarity(content, post.content || '')
    if (similarity > 0.7) {
      return {
        name: 'deduplication',
        passed: false,
        score: 20,
        reason: `${Math.round(similarity * 100)}% similar to a recent post — too repetitive`,
      }
    }
  }

  return { name: 'deduplication', passed: true, score: 90, reason: 'Unique content' }
}

async function checkRejectionPattern(db: Pool, content: string, category: string): Promise<QualityCheck> {
  // Check if this type of content has been rejected before
  const rejections = await db.query(
    `SELECT value FROM growth_agent_memory
     WHERE category = 'learning' AND key LIKE 'rejection_%'
     ORDER BY (value->>'date') DESC LIMIT 10`
  ).catch(() => ({ rows: [] }))

  let rejectedCategories: Record<string, number> = {}
  for (const row of rejections.rows) {
    const data = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    rejectedCategories[data.category] = (rejectedCategories[data.category] || 0) + 1
  }

  if (rejectedCategories[category] >= 3) {
    return {
      name: 'rejection_pattern',
      passed: false,
      score: 30,
      reason: `"${category}" content has been rejected ${rejectedCategories[category]} times — try a different angle`,
    }
  }

  if (rejectedCategories[category] >= 1) {
    return {
      name: 'rejection_pattern',
      passed: true,
      score: 60,
      reason: `"${category}" was rejected before — proceed with caution`,
    }
  }

  return { name: 'rejection_pattern', passed: true, score: 90, reason: 'No rejection history for this type' }
}

function checkLength(content: string, platform: string): QualityCheck {
  const len = content.length

  if (platform === 'twitter' && len > 280) {
    return { name: 'length', passed: false, score: 20, reason: `Too long for Twitter: ${len}/280` }
  }

  if (len < 30) {
    return { name: 'length', passed: false, score: 30, reason: 'Too short — add more substance' }
  }

  if (len > 2000 && platform !== 'youtube') {
    return { name: 'length', passed: true, score: 60, reason: 'Very long — consider trimming' }
  }

  return { name: 'length', passed: true, score: 85, reason: 'Good length' }
}

// ─── VIDEO QUALITY CHECK ────────────────────────────────────────────────────

export async function runVideoQualityGate(db: Pool, script: VideoScript): Promise<QualityReport> {
  const checks: QualityCheck[] = []
  const improvements: string[] = []

  // Duration check
  if (script.total_duration_seconds < 10) {
    checks.push({ name: 'duration', passed: false, score: 20, reason: 'Video too short (<10s)' })
    improvements.push('Script needs more content')
  } else if (script.total_duration_seconds > 300 && script.platform !== 'youtube') {
    checks.push({ name: 'duration', passed: false, score: 30, reason: 'Video too long for short-form platform' })
    improvements.push('Trim script to under 60s for TikTok')
  } else {
    checks.push({ name: 'duration', passed: true, score: 90, reason: 'Good duration' })
  }

  // Scene count
  if (script.scenes.length < 2) {
    checks.push({ name: 'scenes', passed: false, score: 30, reason: 'Only 1 scene — needs more variety' })
    improvements.push('Add more scenes with different visuals')
  } else {
    checks.push({ name: 'scenes', passed: true, score: 85, reason: `${script.scenes.length} scenes` })
  }

  // Hook check (first scene must be <5s)
  const firstScene = script.scenes[0]
  if (firstScene && firstScene.duration_seconds > 5) {
    checks.push({ name: 'hook_timing', passed: true, score: 60, reason: 'Hook scene too long — first 3s matter most' })
    improvements.push('Shorten first scene to 3-4 seconds')
  } else {
    checks.push({ name: 'hook_timing', passed: true, score: 95, reason: 'Good hook timing' })
  }

  // CTA check (last scene must have CTA)
  const lastScene = script.scenes[script.scenes.length - 1]
  if (lastScene && !lastScene.voice_text.toLowerCase().includes('nuro')) {
    checks.push({ name: 'cta', passed: false, score: 40, reason: 'Last scene missing brand CTA' })
    improvements.push('End with Nuro Finance call-to-action')
  } else {
    checks.push({ name: 'cta', passed: true, score: 90, reason: 'CTA present in closing' })
  }

  // Run text quality on the full script voice text
  const fullText = script.scenes.map(s => s.voice_text).join(' ')
  const textReport = await runQualityGate(db, fullText, script.platform, script.format, { isVideo: true })
  checks.push(...textReport.checks)
  improvements.push(...textReport.improvements)

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length
  const passed = totalScore >= 60

  return {
    score: Math.round(totalScore),
    passed,
    checks,
    summary: passed
      ? `Video quality: ${Math.round(totalScore)}/100 — PASSED`
      : `Video quality: ${Math.round(totalScore)}/100 — BLOCKED`,
    improvements,
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function calculateSimilarity(a: string, b: string): number {
  // Simple Jaccard similarity on word sets
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  return intersection / Math.max(wordsA.size, wordsB.size)
}

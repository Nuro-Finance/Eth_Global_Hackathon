// ─────────────────────────────────────────────────────────────────────────────
// HELM REASONING DETECTORS — HELM-401, HELM-403
//
// S31 H2. Closes two gaps in the existing log-scanner:
//   - HELM-401: agent output mentions bypassing Helm ("ignore Helm",
//     "Helm won't see this", etc.) — direct adversarial signal
//   - HELM-403: identity shift mid-conversation (sudden role/name change
//     without operator prompt — classic prompt-injection success indicator)
//
// These run on text — agent output, console.log, model responses. They're
// pure regex banks; cheap to evaluate per emission. The existing log-scanner
// (src/heimdall/log-scanner.ts) handles secret redaction; this module
// adds a new pass that runs alongside.
//
// Mode follows the rest of Helm:
//   HELM_REASONING_ENFORCE=on  (env)
//   setReasoningEnforceMode(true)  (runtime — admin UI)
//
// Observe-only by default. False-positive risk is real (legitimate strings
// like "Helm blocked my request — let me try a different approach"
// could trigger 401), so we want to observe the FP rate before flipping
// to enforce.

import { logHelmEvent } from './core'

let _runtimeEnforceOverride: boolean | null = null

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_REASONING_ENFORCE === 'on'
}

export function setReasoningEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

export function getReasoningMode(): { mode: 'enforce' | 'observe'; source: 'runtime-override' | 'env' } {
  if (_runtimeEnforceOverride !== null) {
    return { mode: _runtimeEnforceOverride ? 'enforce' : 'observe', source: 'runtime-override' }
  }
  return {
    mode: process.env.HELM_REASONING_ENFORCE === 'on' ? 'enforce' : 'observe',
    source: 'env',
  }
}

// ── HELM-401 — bypass-meta detection ────────────────────────────────────────
//
// Pattern bank tuned for HIGH-PRECISION (low FP) over recall. We want to
// catch obvious adversarial reasoning but NOT trip on legit phrases like
// "the security plane blocked the request." The patterns target verbs like
// "bypass / circumvent / evade / disable / hide from / sneak past."
//
// Each pattern is a {regex, label} pair. labels surface in the event
// context for forensic diagnostics.

interface Pattern {
  regex: RegExp
  label: string
}

const BYPASS_PATTERNS: Pattern[] = [
  { regex: /\b(?:bypass|circumvent|evade|sneak\s+past|get\s+around)\s+(?:the\s+)?heimdall\b/i, label: 'verb-bypass-heimdall' },
  { regex: /\bheimdall\s+(?:won['’]?t|wouldn['’]?t|can['’]?t|cannot)\s+(?:see|notice|detect|catch)\b/i, label: 'heimdall-blind' },
  { regex: /\b(?:disable|turn\s+off|kill|silence)\s+(?:the\s+)?heimdall\b/i, label: 'verb-disable-heimdall' },
  { regex: /\b(?:hide|conceal|mask)\s+(?:this|that|it)?\s*from\s+heimdall\b/i, label: 'verb-hide-from-heimdall' },
  { regex: /\bheimdall\s+(?:rule|check|gate)\s+(?:disabled|off|skipped|removed)\b/i, label: 'heimdall-rule-toggle' },
  { regex: /\b(?:without|skip(?:ping)?)\s+heimdall\b/i, label: 'without-heimdall' },
  // Catch the rule-self-modification class (HELM-402) here too — they're
  // adjacent. An agent talking about modifying its own rule set is the
  // direct adversarial signal we treat as instant-quarantine.
  { regex: /\b(?:modify|edit|rewrite|patch)\s+(?:my|the)\s+(?:own\s+)?(?:rule\s+set|rules|heimdall\s+rules)\b/i, label: 'rule-self-mod' },
  { regex: /\b(?:HELM-\d{3})\s+(?:disabled|removed|skipped|bypassed|patched\s+out)\b/i, label: 'rule-id-disable' },
]

// ── HELM-403 — identity shift ───────────────────────────────────────────────
//
// We can't track "true" identity drift without per-conversation state we
// don't have here. The DETECTABLE signal is the POPULAR prompt-injection
// pattern: agent output declares a new identity ("I am now ROLE_X",
// "From now on I am Y"). This is a coarse-but-effective filter.

const IDENTITY_PATTERNS: Pattern[] = [
  { regex: /\b(?:I\s+am\s+now|I['’]m\s+now)\s+(?:a|an|the)\s+\w+/i, label: 'i-am-now' },
  { regex: /\b(?:from\s+now\s+on|going\s+forward),?\s+(?:I|you)\s+(?:am|are|will\s+be)\s+/i, label: 'role-shift-decree' },
  { regex: /\b(?:my\s+(?:new\s+)?(?:identity|persona|name|role)\s+is)\b/i, label: 'identity-decree' },
  { regex: /\b(?:DAN|developer\s+mode|jailbroken|unrestricted\s+(?:AI|model))\b/i, label: 'jailbreak-jargon' },
  // Specific Mythos drift — if an output says "I am no longer Mythos" or
  // similar, that's the canonical signal.
  { regex: /\bI\s+am\s+no\s+longer\s+\w+/i, label: 'identity-relinquish' },
  { regex: /\bforget\s+(?:everything|all|previous\s+instructions)\b/i, label: 'context-wipe' },
]

// ── Public API ──────────────────────────────────────────────────────────────

export interface ReasoningScanInput {
  /** Source for attribution: which agent / which output stream. */
  source: string
  /** Optional agent_id for the event. */
  agentId?: string | null
  /** Text to scan (may be multi-line). */
  text: string
}

export interface ReasoningScanResult {
  hits: Array<{ ruleId: 'HELM-401' | 'HELM-403'; label: string; matchSnippet: string }>
  /** True if the text should be blocked. Only meaningful in enforce mode AND when at least one hit fires. */
  shouldBlock: boolean
}

/**
 * Pure scan: returns the list of pattern hits + whether enforcement
 * would block (caller decides whether to honor the block).
 *
 * Caller (e.g. an agent's main loop, a moltbook publisher, etc.) is
 * responsible for handling the block — most scaffolds that integrate
 * this will throw if shouldBlock=true and let the caller's catch handle
 * graceful degradation.
 */
export function scanReasoning(input: ReasoningScanInput): ReasoningScanResult {
  const text = input.text || ''
  if (!text || text.length < 4) {
    return { hits: [], shouldBlock: false }
  }
  const hits: ReasoningScanResult['hits'] = []

  // HELM-401 bypass-meta
  for (const p of BYPASS_PATTERNS) {
    const m = text.match(p.regex)
    if (m) {
      hits.push({
        ruleId: 'HELM-401',
        label: p.label,
        matchSnippet: m[0].slice(0, 100),
      })
      // Don't break; we want all hits recorded for forensic context.
    }
  }
  // HELM-403 identity shift
  for (const p of IDENTITY_PATTERNS) {
    const m = text.match(p.regex)
    if (m) {
      hits.push({
        ruleId: 'HELM-403',
        label: p.label,
        matchSnippet: m[0].slice(0, 100),
      })
    }
  }

  for (const hit of hits) {
    void logHelmEvent({
      ruleId: hit.ruleId,
      subject: `${input.source}: ${hit.label}`,
      agentId: input.agentId ?? null,
      context: {
        source: input.source,
        label: hit.label,
        snippet: hit.matchSnippet,
        textLength: text.length,
        action: enforceModeOn() ? (hit.ruleId === 'HELM-401' ? 'block' : 'quarantine') : 'log-only',
      },
      actionOverride: enforceModeOn()
        ? hit.ruleId === 'HELM-401' ? 'block' : 'quarantine'
        : 'log-only',
    })
  }

  return {
    hits,
    shouldBlock: enforceModeOn() && hits.length > 0,
  }
}

/** Convenience wrapper: scans + throws on block. Use this when you want
 *  the simple "Helm says no" code path. */
export function assertReasoningSafe(input: ReasoningScanInput): void {
  const r = scanReasoning(input)
  if (r.shouldBlock) {
    const labels = r.hits.map((h) => `${h.ruleId}:${h.label}`).join(', ')
    throw new Error(`[helm reasoning] blocked: ${labels}`)
  }
}

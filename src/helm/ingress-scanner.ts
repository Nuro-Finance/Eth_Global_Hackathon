// ─────────────────────────────────────────────────────────────────────────────
// HELM INGRESS SCANNER — HELM-001 through HELM-007 (S33 Tier 1 #13)
//
// Scans user-authored text content as it enters the system for known
// prompt-injection / context-poisoning patterns. Each rule maps to a
// catalog entry in core.ts:
//
//   HELM-001 — role-confusion verb phrases ("ignore previous instructions",
//              "you are now", "disregard your guidelines", etc.)
//              Action: quarantine. Severity: high.
//   HELM-002 — embedded chat-template markers (<|im_start|>, <|system|>,
//              </s>, [INST], etc.)
//              Action: block. Severity: high.
//   HELM-003 — large undeclared base64/hex blobs (> 1KB)
//              Action: log-alert. Severity: medium.
//   HELM-004 — tool-call XML embedded in user-authored text
//              (<tool_use>, <function_calls>, <invoke>)
//              Action: block. Severity: high.
//   HELM-005 — context-dilution: input > 100K chars from a single
//              untrusted source. (TS proxy for the 900K-token check;
//              real token counting requires the Anthropic tokenizer.)
//              Action: log-alert. Severity: medium.
//   HELM-006 — URLs to IP literals or punycode (xn--) domains
//              Action: log-alert. Severity: medium.
//   HELM-007 — PII patterns (SSN, passport, bank account) where the
//              caller didn't declare PII
//              Action: log-only. Severity: low.
//
// Scan output is a list of findings; each finding emits a heimdall_event
// when the runtime gate (HELM_INGRESS_OFF env) is not 'true'. Mode:
//   observe (default): emit + return findings; caller decides what to do
//   enforce (HELM_INGRESS_ENFORCE=on): also throw on first 'block' or
//     'quarantine' action, surfacing back to caller's error handler
//
// Karpathy guideline #2 (Simplicity First): pure functions over input
// strings — no IO, no module side effects. Caller wires it into request
// middleware where it makes sense (huginn/counsel x402 endpoint, agent
// chat inputs, etc). One scan per request, not per field.
// ─────────────────────────────────────────────────────────────────────────────

import { logHelmEvent } from './core'

// ── Mode plumbing (mirrors other Helm modules) ───────────────────────

let _runtimeEnforceOverride: boolean | null = null

function ingressArmed(): boolean {
  return process.env.HELM_INGRESS_OFF !== 'true'
}

function ingressEnforceOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_INGRESS_ENFORCE === 'on'
}

export function setIngressEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

export function getIngressMode(): {
  armed: boolean
  mode: 'observe' | 'enforce'
  source: 'runtime-override' | 'env'
} {
  const armed = ingressArmed()
  if (_runtimeEnforceOverride !== null) {
    return { armed, mode: _runtimeEnforceOverride ? 'enforce' : 'observe', source: 'runtime-override' }
  }
  return {
    armed,
    mode: process.env.HELM_INGRESS_ENFORCE === 'on' ? 'enforce' : 'observe',
    source: 'env',
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

export type IngressRuleId =
  | 'HELM-001'
  | 'HELM-002'
  | 'HELM-003'
  | 'HELM-004'
  | 'HELM-005'
  | 'HELM-006'
  | 'HELM-007'

export interface IngressFinding {
  ruleId: IngressRuleId
  severity: 'high' | 'medium' | 'low'
  action: 'block' | 'quarantine' | 'log-alert' | 'log-only'
  /** Short label, ~80 chars. */
  label: string
  /** Up to 200 chars of the matched snippet — never the whole input.
   *  Operator forensic context only; never logged in plaintext for
   *  HELM-007 (PII rule masks the snippet). */
  snippet: string
  /** Where in the input the match was, if a regex match. */
  matchIndex?: number
}

export interface IngressScanInput {
  /** The user-authored text to scan. */
  text: string
  /** Optional: caller-declared as containing PII (skips HELM-007). */
  declaredPii?: boolean
  /** Optional: caller-declared as containing base64/hex (skips HELM-003). */
  declaredBlob?: boolean
  /** Source attribution for the heimdall_event (e.g. 'x402-huginn-counsel',
   *  'agent-chat-input'). */
  source: string
  /** Optional: agentId attribution if known. */
  agentId?: string | null
}

// ── Pure scan functions, one per rule ─────────────────────────────────────

// HELM-001: role-confusion verb phrases.
// Curated from documented prompt-injection corpora. Case-insensitive,
// require a verb-phrase shape (not just the word "ignore" alone in a
// sentence about something else).
const HEIM001_PHRASES: RegExp[] = [
  /\bignore\s+(?:all\s+|the\s+|your\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?|rules?)\b/i,
  /\b(?:you\s+are\s+now|from\s+now\s+on,?\s+you\s+are|act\s+as)\s+a?\s*(?:dan|jailbroken|unrestricted|unfiltered|godmode|admin|root|superuser)\b/i,
  /\bdisregard\s+(?:your\s+|the\s+|all\s+)?(?:guidelines?|safety|rules?|instructions?|constraints?)\b/i,
  /\bforget\s+(?:everything|all\s+(?:of\s+)?your\s+(?:previous|training|instructions))\b/i,
  /\boverride\s+(?:your\s+)?(?:safety|guardrails?|filter|policies)\b/i,
]

function scanHeim001(text: string): IngressFinding | null {
  for (const re of HEIM001_PHRASES) {
    const m = re.exec(text)
    if (m) {
      return {
        ruleId: 'HELM-001',
        severity: 'high',
        action: 'quarantine',
        label: 'role-confusion verb phrase',
        snippet: m[0].slice(0, 200),
        matchIndex: m.index,
      }
    }
  }
  return null
}

// HELM-002: chat-template markers.
const HEIM002_MARKERS: RegExp[] = [
  /<\|im_start\|>/,
  /<\|im_end\|>/,
  /<\|system\|>/,
  /<\|user\|>/,
  /<\|assistant\|>/,
  /<\|endoftext\|>/,
  /<\/s>/,
  /\[INST\]/,
  /\[\/INST\]/,
  /<start_of_turn>/,
  /<end_of_turn>/,
]

function scanHeim002(text: string): IngressFinding | null {
  for (const re of HEIM002_MARKERS) {
    const m = re.exec(text)
    if (m) {
      return {
        ruleId: 'HELM-002',
        severity: 'high',
        action: 'block',
        label: 'chat-template marker injection',
        snippet: m[0].slice(0, 200),
        matchIndex: m.index,
      }
    }
  }
  return null
}

// HELM-003: large undeclared base64/hex blobs.
// Threshold: 1024 chars of contiguous base64-shaped or hex-shaped content.
// declaredBlob=true skips this rule (caller said "I'm sending a blob").
const HEIM003_BASE64_RE = /[A-Za-z0-9+/]{1024,}={0,2}/
const HEIM003_HEX_RE = /(?:0x)?[a-fA-F0-9]{1024,}/

function scanHeim003(text: string, declaredBlob: boolean): IngressFinding | null {
  if (declaredBlob) return null
  const m64 = HEIM003_BASE64_RE.exec(text)
  if (m64) {
    return {
      ruleId: 'HELM-003',
      severity: 'medium',
      action: 'log-alert',
      label: 'large undeclared base64 blob',
      snippet: `${m64[0].slice(0, 60)}…(len=${m64[0].length})`,
      matchIndex: m64.index,
    }
  }
  const mHex = HEIM003_HEX_RE.exec(text)
  if (mHex) {
    return {
      ruleId: 'HELM-003',
      severity: 'medium',
      action: 'log-alert',
      label: 'large undeclared hex blob',
      snippet: `${mHex[0].slice(0, 60)}…(len=${mHex[0].length})`,
      matchIndex: mHex.index,
    }
  }
  return null
}

// HELM-004: tool-call XML embedded in user text.
// Anthropic's tool-call format + common variants (OpenAI's
// function_calls, etc).
const HEIM004_PATTERNS: RegExp[] = [
  /<\s*tool_use\b/i,
  /<\s*invoke\b/i,
  /<\s*function_calls?\b/i,
  /<\s*tool_call\b/i,
  /<\s*tool_result\b/i,
]

function scanHeim004(text: string): IngressFinding | null {
  for (const re of HEIM004_PATTERNS) {
    const m = re.exec(text)
    if (m) {
      return {
        ruleId: 'HELM-004',
        severity: 'high',
        action: 'block',
        label: 'tool-call XML in user input',
        snippet: m[0].slice(0, 200),
        matchIndex: m.index,
      }
    }
  }
  return null
}

// HELM-005: context dilution proxy. Input > 100K chars triggers (real
// token-aware check requires the Anthropic tokenizer; chars are a safe
// over-estimate for catching the dilution attack at the user-input gate).
const HEIM005_THRESHOLD_CHARS = 100_000

function scanHeim005(text: string): IngressFinding | null {
  if (text.length < HEIM005_THRESHOLD_CHARS) return null
  return {
    ruleId: 'HELM-005',
    severity: 'medium',
    action: 'log-alert',
    label: 'oversize input from single source',
    snippet: `length=${text.length} chars (threshold=${HEIM005_THRESHOLD_CHARS})`,
  }
}

// HELM-006: URLs to IP literals or punycode domains.
// IP-literal: http://1.2.3.4/path or https://[::1]/path.
// Punycode: any hostname starting with `xn--`.
const HEIM006_IP_RE = /https?:\/\/(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[[0-9a-fA-F:]+\])(?::\d+)?\b/
const HEIM006_PUNYCODE_RE = /https?:\/\/[^\/\s]*xn--[^\/\s]*\b/i

function scanHeim006(text: string): IngressFinding | null {
  const mIp = HEIM006_IP_RE.exec(text)
  if (mIp) {
    return {
      ruleId: 'HELM-006',
      severity: 'medium',
      action: 'log-alert',
      label: 'URL to IP literal',
      snippet: mIp[0].slice(0, 200),
      matchIndex: mIp.index,
    }
  }
  const mPuny = HEIM006_PUNYCODE_RE.exec(text)
  if (mPuny) {
    return {
      ruleId: 'HELM-006',
      severity: 'medium',
      action: 'log-alert',
      label: 'URL with punycode hostname',
      snippet: mPuny[0].slice(0, 200),
      matchIndex: mPuny.index,
    }
  }
  return null
}

// HELM-007: PII shape detection.
// Conservative: only match when the shape is unambiguous. Many false
// positives are common here (any 9-digit number ≠ SSN), so the rule's
// action is log-only by design — operator labels FPs in admin UI.
//
// SSN: 3-2-4 digit groups with dashes (123-45-6789).
//      Plain 9-digit unbroken sequences are ambiguous (could be a phone
//      number, account ID, etc) so we don't trip on those.
// Bank account: IBAN (country code + 2 check + 11-30 alphanumeric).
// Passport: most passport regexes are too lossy to do reliably; skipping
//           this category until we have real intel on what calls come
//           through.
const HEIM007_SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/
const HEIM007_IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/

function scanHeim007(text: string, declaredPii: boolean): IngressFinding | null {
  if (declaredPii) return null
  if (HEIM007_SSN_RE.test(text)) {
    return {
      ruleId: 'HELM-007',
      severity: 'low',
      action: 'log-only',
      label: 'undeclared SSN-shaped value',
      // Mask snippet for PII rule — never log the actual digits even
      // partially. Operator must check the full input via heimdall_events
      // context if they need to investigate.
      snippet: '<MASKED — SSN shape>',
    }
  }
  if (HEIM007_IBAN_RE.test(text)) {
    return {
      ruleId: 'HELM-007',
      severity: 'low',
      action: 'log-only',
      label: 'undeclared IBAN-shaped value',
      snippet: '<MASKED — IBAN shape>',
    }
  }
  return null
}

// ── Main scan entry ───────────────────────────────────────────────────────

/**
 * Pure scan: returns all findings detected in the input. No IO. Safe to
 * call repeatedly (no side effects). Caller decides whether to throw or
 * record based on findings + mode.
 */
export function scanInputForInjection(input: IngressScanInput): IngressFinding[] {
  const findings: IngressFinding[] = []
  const t = input.text || ''
  if (!t) return findings

  const r1 = scanHeim001(t); if (r1) findings.push(r1)
  const r2 = scanHeim002(t); if (r2) findings.push(r2)
  const r3 = scanHeim003(t, !!input.declaredBlob); if (r3) findings.push(r3)
  const r4 = scanHeim004(t); if (r4) findings.push(r4)
  const r5 = scanHeim005(t); if (r5) findings.push(r5)
  const r6 = scanHeim006(t); if (r6) findings.push(r6)
  const r7 = scanHeim007(t, !!input.declaredPii); if (r7) findings.push(r7)

  return findings
}

/**
 * IO-bearing variant: scans + emits heimdall_events for each finding.
 * In enforce mode, throws on the first finding with action='block' or
 * 'quarantine' — surfaces back to caller's error handler.
 *
 * Returns the findings list either way for caller-side decisioning.
 */
export async function scanAndEmit(
  input: IngressScanInput,
): Promise<IngressFinding[]> {
  const findings = scanInputForInjection(input)
  if (!ingressArmed() || findings.length === 0) return findings

  const enforceModeOn = ingressEnforceOn()

  for (const f of findings) {
    void logHelmEvent({
      ruleId: f.ruleId,
      subject: `${f.label} (${input.source})`.slice(0, 128),
      // observe-mode forces log-only; enforce-mode lets the rule's catalog
      // action stand (block/quarantine for HELM-001/002/004; log-only for
      // HELM-007 etc).
      actionOverride: enforceModeOn ? undefined : 'log-only',
      agentId: input.agentId ?? null,
      context: {
        snippet: f.snippet,
        matchIndex: f.matchIndex ?? null,
        source: input.source,
        textLength: input.text.length,
        declaredPii: !!input.declaredPii,
        declaredBlob: !!input.declaredBlob,
      },
    })
  }

  if (enforceModeOn) {
    const blocking = findings.find(
      (f) => f.action === 'block' || f.action === 'quarantine',
    )
    if (blocking) {
      const err = new Error(
        `[helm:ingress] ${blocking.ruleId} ${blocking.action} — ${blocking.label}`,
      ) as Error & { ruleId?: string; action?: string }
      err.ruleId = blocking.ruleId
      err.action = blocking.action
      throw err
    }
  }

  return findings
}

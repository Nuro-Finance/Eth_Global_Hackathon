// ─────────────────────────────────────────────────────────────────────────────
// HELM-108 LIVE ENFORCEMENT — secret-in-log scanner
//
// Wraps console.log / console.warn / console.error / process.stdout.write to
// detect known secret-material patterns (Google OAuth client secrets, Slack
// bot tokens, OpenAI-shaped keys, etc.) in our own output stream. On
// detection:
//   1. Redacts the secret before emission (replaces with `[REDACTED:<shape>]`)
//   2. Records a HELM-108 event with a hash of the secret (not the secret
//      itself — we log WHAT shape leaked, never the material)
//
// Why in-process instead of tailing /var/log:
//   - Catches secrets at emission time, before they touch disk/stdout
//   - Zero latency between detection and redaction
//   - Same process boundary means no race between leak and pickup
//
// Hooks install exactly once; installHelmLogScanner() is idempotent.

import { createHash } from 'crypto'
import { logHelmEvent } from './core'

// Secret-shape patterns with labels. Ordered by specificity — longer/more-
// specific patterns first so they win when multiple match.
interface SecretPattern {
  label: string
  regex: RegExp
}

const SECRET_PATTERNS: SecretPattern[] = [
  { label: 'google-oauth-client-secret', regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'openai-api-key',             regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { label: 'slack-bot-token',            regex: /\bxoxb-[A-Za-z0-9-]{20,}\b/g },
  { label: 'slack-user-token',           regex: /\bxoxp-[A-Za-z0-9-]{20,}\b/g },
  { label: 'github-pat',                 regex: /\bghp_[A-Za-z0-9]{36,}\b/g },
  { label: 'github-fine-pat',            regex: /\bgithub_pat_[A-Za-z0-9_]{70,}\b/g },
  { label: 'aws-access-key',             regex: /\bAKIA[0-9A-Z]{16}\b/g },
  // Long-entropy hex/base64 shape without a known prefix is a weak signal;
  // we match only when it follows a suggestive label to avoid false-positives
  // on tx hashes (which contain hex but aren't secrets).
  { label: 'generic-bearer',             regex: /\b(?:bearer|authorization)\s*[:=]\s*[A-Za-z0-9_\-\.]{32,}\b/gi },
]

const REDACT_PLACEHOLDER = (label: string) => `[REDACTED:${label}]`

function scanAndRedact(input: string): { redacted: string; hits: Array<{ label: string; sha8: string }> } {
  let out = input
  const hits: Array<{ label: string; sha8: string }> = []
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat.regex, (match) => {
      const sha8 = createHash('sha256').update(match).digest('hex').slice(0, 8)
      hits.push({ label: pat.label, sha8 })
      return REDACT_PLACEHOLDER(pat.label)
    })
  }
  return { redacted: out, hits }
}

let _installed = false

/** Watchdog hook — true once installHelmLogScanner has run successfully. */
export function isLogScannerInstalled(): boolean {
  return _installed
}

/**
 * Install HELM-108 live enforcement. Wraps console.* and process.stdout/err
 * write with secret scanners. Idempotent — safe to call at boot even if
 * the module is imported twice.
 *
 * Call once from index.ts:
 *   if (process.env.HELM_LOG_SCAN !== 'off') installHelmLogScanner()
 *
 * Off-switch exists because the scanner has overhead on every log line; if
 * we ever see it cause perceptible latency (we won't — regexes are cheap),
 * operators can disable without redeploying.
 */
export function installHelmLogScanner(): void {
  if (_installed) return
  _installed = true

  const originalLog = console.log.bind(console)
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)
  const originalStdoutWrite = process.stdout.write.bind(process.stdout) as typeof process.stdout.write
  const originalStderrWrite = process.stderr.write.bind(process.stderr) as typeof process.stderr.write

  const wrapConsole = (orig: (...args: any[]) => void) => {
    return (...args: any[]) => {
      let hadHits = false
      const redactedArgs = args.map((a) => {
        if (typeof a !== 'string') return a
        const { redacted, hits } = scanAndRedact(a)
        if (hits.length > 0) {
          hadHits = true
          // Fire-and-forget — don't await, don't block log output
          for (const h of hits) {
            void logHelmEvent({
              ruleId: 'HELM-108',
              subject: `secret-shape in log: ${h.label}`,
              context: { label: h.label, sha8: h.sha8 },
            })
          }
        }
        return redacted
      })
      orig(...redactedArgs)
      if (hadHits) {
        // Diagnostic breadcrumb so operators see it without digging in DB
        originalWarn('[helm] HELM-108 — secret redacted from log output')
      }
    }
  }

  console.log = wrapConsole(originalLog)
  console.warn = wrapConsole(originalWarn)
  console.error = wrapConsole(originalError)

  // Also wrap raw stdout/stderr writes since some libraries bypass console.*
  const wrapStreamWrite = (
    stream: NodeJS.WriteStream,
    orig: NodeJS.WriteStream['write'],
    streamName: 'stdout' | 'stderr',
  ): NodeJS.WriteStream['write'] => {
    const wrapped = ((chunk: any, ...rest: any[]) => {
      if (typeof chunk === 'string') {
        const { redacted, hits } = scanAndRedact(chunk)
        if (hits.length > 0) {
          for (const h of hits) {
            void logHelmEvent({
              ruleId: 'HELM-108',
              subject: `secret-shape on ${streamName}: ${h.label}`,
              context: { label: h.label, sha8: h.sha8 },
            })
          }
          return orig.call(stream, redacted, ...rest)
        }
      }
      return orig.call(stream, chunk, ...rest)
    }) as NodeJS.WriteStream['write']
    return wrapped
  }

  process.stdout.write = wrapStreamWrite(process.stdout, originalStdoutWrite, 'stdout')
  process.stderr.write = wrapStreamWrite(process.stderr, originalStderrWrite, 'stderr')

  originalLog('[helm] HELM-108 log-scanner armed — secret redaction active on console + stdout/stderr')
}

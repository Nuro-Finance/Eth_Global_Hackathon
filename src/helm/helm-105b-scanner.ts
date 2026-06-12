// ─────────────────────────────────────────────────────────────────────────────
// HELM-105B — PATCH/PUT/POST authoritative-monetary-field acceptance scanner
//
// Closes the rule-catalog gap surfaced by the S32 balance-spoof exploit
// (Decision Journal 2026-04-25_006.md DJ 2). Static-analysis-at-boot
// scanner that walks designated route files, finds PATCH/PUT/POST
// handlers that destructure authoritative-monetary-shape field names
// from `req.body`, and logs violations to heimdall_events.
//
// Why static-at-boot rather than runtime middleware:
//   - Static catches the bug pattern even if no malicious request ever
//     hits the route — the vulnerability EXISTS regardless of traffic.
//   - Zero per-request overhead.
//   - Boot signal lands in admin Mythos POV the moment a regression ships.
//
// Allowlist mechanism: comment annotation `// HELM-105B-ALLOW: <reason>`
// on the same or previous line as the destructure exempts that specific
// occurrence. Creates an audit trail of intentional exceptions (e.g. an
// admin-only endpoint legitimately moving authoritative state).
//
// Field name catalog: authoritative monetary fields are those that, if
// trusted from a client request, could authorize a spend the server
// otherwise wouldn't have allowed. Catalog grows as we discover new
// field names; pull request to extend AUTH_FIELDS.
//
// Exit semantics:
//   observe (default) — log heimdall_events with action='log-alert',
//                       process boot continues
//   enforce (HELM_105B_ENFORCE=on) — additionally throw at the
//                       end of scan if violations found (PM2 restart-loops)
//
// File scope is intentionally narrow (just the user-facing route files).
// Internal-write paths like execution-dispatch.ts legitimately mutate
// authoritative state from event-driven sources, not request bodies —
// no need to scan there.
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { logHelmEvent } from './core'

// Authoritative monetary field names. If any of these appear in a
// request-body destructure on a PATCH/PUT/POST handler, that's the
// HELM-105B pattern. Sourced from the catalog on the date this scanner
// landed; extend on PR review when new field types appear.
const AUTH_FIELDS = [
  'balance',
  'balance_usd',
  'balance_native',
  'usd_authority',
  'usd_remaining',
  'usd_spent_7d',
  'cached_balance',
  'card_balance',
  'vault_balance',
  'account_balance',
  'total_profit',
  'shares_held',
  'deposit_amount_usdc',
  'closed_amount_usdc',
  'closed_pnl_usdc',
] as const

// Express verb-call patterns we care about.
const VERB_PATTERN = /\brouter\.(patch|put|post)\s*\(\s*['"`]([^'"`]+)['"`]/g

const ALLOW_ANNOTATION = /\/\/\s*HELM-105B-ALLOW(?::\s*(.+?))?$/

// Files to scan. Relative to repo root. Adding files here extends coverage.
const SCANNED_FILES = [
  'src/nuro-routes.ts',
  'src/hl-routes.ts',
  'src/admin-console.ts',
  'src/sandbox/routes.ts',
  'src/agent-bus-routes.ts',
]

interface Helm105BViolation {
  file: string
  line: number
  routeMethod: string
  routePath: string
  fieldName: string
  /** Source line excerpt — for forensics + DJ entry context. */
  excerpt: string
  /** Whether the violation was on an admin-only path (heuristic via path). */
  isAdminPath: boolean
}

/**
 * Run the scanner. Logs heimdall_events for each violation found. Returns
 * the list so the boot path can decide whether to throw (enforce mode).
 */
export async function scanRoutesForHelm105B(repoRoot: string = process.cwd()): Promise<Helm105BViolation[]> {
  const violations: Helm105BViolation[] = []

  for (const relPath of SCANNED_FILES) {
    const abs = resolvePath(repoRoot, relPath)
    let content: string
    try {
      content = await fs.readFile(abs, 'utf8')
    } catch {
      // File doesn't exist (e.g. agent-bus-routes.ts in older trees) — skip.
      continue
    }

    // Find each verb call + its body region. Body region = from the
    // verb-call line until we close out the route handler. Cheap heuristic:
    // find the next `})\s*$` or another `router.<verb>(` from the same line.
    // Imperfect for nested closures but robust for our route style.
    const lines = content.split('\n')
    const matches: { verb: string; path: string; startLine: number }[] = []
    VERB_PATTERN.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = VERB_PATTERN.exec(content)) !== null) {
      const upToMatch = content.slice(0, m.index)
      const startLine = upToMatch.split('\n').length // 1-indexed
      matches.push({ verb: m[1], path: m[2], startLine })
    }

    for (let i = 0; i < matches.length; i++) {
      const route = matches[i]
      const nextRouteLine = i + 1 < matches.length ? matches[i + 1].startLine : lines.length
      const handlerLines = lines.slice(route.startLine - 1, nextRouteLine - 1)

      // Walk each line of the handler. Two independent patterns:
      //   (A) Destructure  `... balance, ... = req.body`
      //   (B) Direct read  `req.body.balance` / `req.body['balance']`
      // Each pattern checked on the SINGLE LINE only — no multi-line merge
      // (which led to false positives where an unrelated line's `req.body.X`
      // pulled an exempt destructure-line's `field: _ignored` into a joint
      // region that no longer obviously matched the exemption).
      for (let li = 0; li < handlerLines.length; li++) {
        const line = handlerLines[li]
        const absoluteLine = route.startLine + li

        // Skip lines explicitly allowed.
        if (ALLOW_ANNOTATION.test(line) || (li > 0 && ALLOW_ANNOTATION.test(handlerLines[li - 1]))) {
          continue
        }

        // ── Pattern A: destructure assigning from req.body ──
        if (/=\s*req\.body\b/.test(line)) {
          // The destructure CAN span multiple lines on rare formatting
          // (operator broke a long destructure across 3 lines). Walk
          // back until we find `const {` or hit the route start. Bounded
          // by route.startLine so we never cross into another handler.
          let regionStart = li
          for (let back = 1; back <= 30 && regionStart - 1 >= 0; back++) {
            const probe = handlerLines[regionStart - 1]
            regionStart--
            if (/(?:const|let|var)\s+\{/.test(probe)) break
          }
          const region = handlerLines.slice(regionStart, li + 1).join(' ')
          checkRegionForFields(region, line, absoluteLine, 'destructure')
        }

        // ── Pattern B: direct read of req.body.<field> ──
        const directRe = /req\.body\.(\w+)/g
        let dm: RegExpExecArray | null
        while ((dm = directRe.exec(line)) !== null) {
          const accessed = dm[1]
          if (!(AUTH_FIELDS as readonly string[]).includes(accessed)) continue
          // Direct-read of authoritative field from req.body. No exemption
          // pattern applies — if you wanted to skip, use a HELM-105B-ALLOW
          // annotation on the line.
          violations.push({
            file: relPath,
            line: absoluteLine,
            routeMethod: route.verb.toUpperCase(),
            routePath: route.path,
            fieldName: accessed,
            excerpt: line.trim().slice(0, 200),
            isAdminPath: route.path.startsWith('/admin'),
          })
        }
      }

      // Closure-scope helper for destructure check: tighter exemption logic.
      // eslint-disable-next-line no-inner-declarations
      function checkRegionForFields(region: string, line: string, absoluteLine: number, _kind: string): void {
        for (const field of AUTH_FIELDS) {
          const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          // Step 1: field appears as identifier in the region?
          if (!new RegExp(`\\b${escapedField}\\b`).test(region)) continue
          // Step 2: exempt — `field: _<anything>` rename-to-ignored
          if (new RegExp(`\\b${escapedField}\\s*:\\s*_`, 'i').test(region)) continue
          // Step 3: exempt — `_<rejected|ignored|unused>?field` direct prefix
          if (new RegExp(`_(?:rejected|ignored|unused)?${escapedField}\\b`, 'i').test(region)) continue
          // Step 4: confirm the field's appearance is in a destructure-key
          // position. Look for `{ ..., field, ... }` or `{ ..., field: <id>, ... }`
          // — NOT `req.body.field` (which is direct-read, handled by Pattern B).
          // The region by construction contains `= req.body`, so a bare
          // identifier inside `{ ... }` IS a destructure key.
          violations.push({
            file: relPath,
            line: absoluteLine,
            routeMethod: route.verb.toUpperCase(),
            routePath: route.path,
            fieldName: field,
            excerpt: line.trim().slice(0, 200),
            isAdminPath: route.path.startsWith('/admin'),
          })
          break
        }
      }
    }
  }

  // Log each violation. Aggregated subject so admin Mythos POV doesn't
  // get swamped on a regression — one event per (file, route).
  const seen = new Set<string>()
  for (const v of violations) {
    const dedupKey = `${v.file}:${v.routeMethod} ${v.routePath}:${v.fieldName}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    void logHelmEvent({
      ruleId: 'HELM-CTRL',
      subject: `HELM-105B: ${v.routeMethod} ${v.routePath} accepts authoritative field '${v.fieldName}' from req.body`,
      agentId: 'helm-105b-scanner',
      context: {
        kind: 'rule-violation',
        ruleId: 'HELM-105B',
        file: v.file,
        line: v.line,
        method: v.routeMethod,
        path: v.routePath,
        fieldName: v.fieldName,
        excerpt: v.excerpt,
        isAdminPath: v.isAdminPath,
      },
      actionOverride: 'log-alert',
    })
  }

  return violations
}

/**
 * Boot-path entry. Logs violations + (in enforce mode) throws so PM2
 * restart-loops the service. Caller controls whether to throw via
 * HELM_105B_ENFORCE=on.
 */
export async function runHelm105BBootCheck(): Promise<void> {
  try {
    const violations = await scanRoutesForHelm105B()
    if (violations.length === 0) {
      console.log('[helm:HELM-105B] scan clean — no PATCH/PUT/POST routes accept authoritative monetary fields from req.body')
      return
    }
    console.warn(`[helm:HELM-105B] ${violations.length} violation(s) found:`)
    for (const v of violations) {
      console.warn(`  • ${v.file}:${v.line} — ${v.routeMethod} ${v.routePath} accepts '${v.fieldName}'`)
    }
    if (process.env.HELM_105B_ENFORCE === 'on') {
      throw new Error(`HELM-105B enforce: ${violations.length} authoritative-monetary-field violation(s). See heimdall_events.`)
    }
  } catch (err: any) {
    if (process.env.HELM_105B_ENFORCE === 'on') {
      console.error('[helm:HELM-105B] enforce mode — boot rejected:', err?.message?.slice(0, 200))
      // Schedule process exit so PM2 visibly restart-loops.
      setTimeout(() => process.exit(1), 100)
      throw err
    }
    console.warn(`[helm:HELM-105B] scan error (observe-mode swallow): ${err?.message?.slice(0, 200)}`)
  }
}

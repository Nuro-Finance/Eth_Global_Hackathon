// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL-DOC MONITOR — generic framework for daily upstream-doc drift checks
//
// S31 H2. The motivating example: Kelp's exploit was foreshadowed by quiet
// hardening guidance in upstream LayerZero docs that we'd missed. We can't
// rely on humans to read every external doc daily — but we CAN rely on a
// cron + a hash + an alert.
//
// This module exposes:
//   - DocSource interface — implement once per upstream (LZ, CCTP, etc.)
//   - runDocScan(source) — the generic loop: fetch, normalize, diff, classify,
//     persist, alert, snapshot-to-disk
//   - Severity routing (breaking → admin Telegram immediately, notable →
//     persisted but no alert, cosmetic → silent)
//
// Design notes:
//   - Fetch is straightforward HTML GET (axios with our usual ~10s timeout).
//     For SPA-rendered content (Next.js statically-generated docs) this works
//     because most doc sites prerender for SEO. For client-only renders we'd
//     need Playwright; defer until we hit one.
//   - Normalization strips dates, build-IDs, CSS classnames, anything that
//     changes on every page render without representing real content drift.
//     classify() works on the normalized text.
//   - Snapshot files are written via helmGuardedWrite to make HELM-201
//     fire on the way through (this is the gate's first real customer).
//     They live in Neural Net/Doc Snapshots/ — appended only, never updated.
//   - Idempotent: safe to run multiple times in a day. Same content → same
//     hash → no new row, no re-alert.

import axios from 'axios'
import * as crypto from 'crypto'
import * as path from 'path'
import type { Pool } from 'pg'
import { sendTelegramMessage } from '../growth-agent/skills/telegram'
import { helmGuardedWrite } from '../helm'

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ''

// Where snapshot markdown files land. Inside Neural Net so they're under
// the HELM-201 guard. Append-only via the helmGuardedWrite gate.
const SNAPSHOT_ROOT =
  process.env.NEURAL_NET_PATH ||
  path.resolve(process.cwd(), '..', 'Neural Net', 'Doc Snapshots')

// ── Public types ─────────────────────────────────────────────────────────────

export type DocSeverity = 'breaking' | 'notable' | 'cosmetic'

export interface DocFetchTarget {
  /** Stable id within this source — used for snapshot filename + DB lookup. */
  key: string
  /** Display label for the alert. */
  label: string
  /** Full URL we GET. Must be on the egress allowlist. */
  url: string
}

export interface DocSource {
  /** Stable id — 'layerzero', 'circle-cctp', etc. Lives in the DB column. */
  id: string
  /** Display name for alerts. */
  name: string
  /** URLs to fetch this scan cycle. May be static or computed. */
  targets(): DocFetchTarget[]
  /**
   * Strip volatile boilerplate (build IDs, timestamps, css hashes, "last
   * updated" strings) so two snapshots taken minutes apart with no real
   * change produce identical hashes. Source-specific because the volatile
   * surface differs by site.
   */
  normalize(rawHtml: string, target: DocFetchTarget): string
  /**
   * Classify the diff. Sources implement this with regex/keyword heuristics
   * tuned to their domain — e.g. LZ returns 'breaking' when the DVN registry
   * shrinks, CCTP returns 'breaking' when an attestation-API endpoint moves.
   *
   * Default-graceful: if a source can't tell, return 'cosmetic' (we still
   * record the row but stay quiet).
   */
  classify(prevContent: string, nextContent: string, target: DocFetchTarget): {
    severity: DocSeverity
    notes?: string
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

/** Tiny unified-diff (line-level) so the alert can quote the change. Not a
 *  full diff impl — strips matching prefix/suffix, returns a few hundred
 *  chars of the differing middle. */
function tinyDiff(prev: string, next: string, maxChars = 1200): string {
  // Find first differing char
  let head = 0
  const minLen = Math.min(prev.length, next.length)
  while (head < minLen && prev[head] === next[head]) head++
  // Find last differing char from the back
  let tailPrev = prev.length
  let tailNext = next.length
  while (
    tailPrev > head &&
    tailNext > head &&
    prev[tailPrev - 1] === next[tailNext - 1]
  ) {
    tailPrev--
    tailNext--
  }
  const removed = prev.slice(head, tailPrev)
  const added = next.slice(head, tailNext)
  // Anchor a few chars of context on each side
  const contextStart = Math.max(0, head - 80)
  const context = prev.slice(contextStart, head).replace(/\n/g, ' ')
  let body = `…${context}…\n- ${removed}\n+ ${added}`
  if (body.length > maxChars) body = body.slice(0, maxChars) + '\n[truncated]'
  return body
}

async function fetchOne(target: DocFetchTarget): Promise<{
  ok: boolean
  status: number
  body: string
  error: string | null
}> {
  try {
    const res = await axios.get(target.url, {
      timeout: 15_000,
      headers: {
        'User-Agent': 'Nuro-DocMonitor/1.0 (+https://app.nuro.finance)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      // Don't follow auth redirects — if a doc page suddenly requires auth
      // that's itself notable. Treat 3xx that go to a login as a soft error.
      maxRedirects: 5,
      validateStatus: (s) => s < 500, // surface 4xx as a soft failure (not throw)
    })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      body: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      error: res.status >= 400 ? `HTTP ${res.status}` : null,
    }
  } catch (err: any) {
    return {
      ok: false,
      status: err?.response?.status ?? 0,
      body: '',
      error: (err?.message || 'fetch_error').slice(0, 200),
    }
  }
}

/** Find the most-recent snapshot row for (source, url). Used as the diff
 *  baseline. Null if this is the first scan ever for that target. */
async function loadPrevSnapshot(
  db: Pool,
  sourceId: string,
  url: string,
): Promise<{ id: string; content_hash: string; content: string } | null> {
  const res = await db.query(
    `SELECT id, content_hash, content
     FROM external_doc_snapshots
     WHERE source_id = $1 AND url = $2
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [sourceId, url],
  )
  return res.rows[0] || null
}

/** Persist a new snapshot row and (when severity > cosmetic) drop a markdown
 *  file into Neural Net/Doc Snapshots/ via helmGuardedWrite. */
async function persistSnapshot(
  db: Pool,
  source: DocSource,
  target: DocFetchTarget,
  fetched: Awaited<ReturnType<typeof fetchOne>>,
  normalized: string,
  prev: { id: string; content_hash: string; content: string } | null,
  severity: DocSeverity,
  notes: string | null,
): Promise<{ id: string; isNew: boolean }> {
  const hash = sha256(normalized)

  // No content change → no new row. Just ensure prev exists (it does) and
  // return early.
  if (prev && prev.content_hash === hash) {
    return { id: prev.id, isNew: false }
  }

  const diff = prev ? tinyDiff(prev.content, normalized) : null

  const ins = await db.query(
    `INSERT INTO external_doc_snapshots
       (source_id, url, content_hash, content, content_bytes,
        diff_from_prev, severity, http_status, fetch_error, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      source.id,
      target.url,
      hash,
      normalized,
      Buffer.byteLength(normalized, 'utf8'),
      diff,
      severity,
      fetched.status,
      fetched.error,
      notes,
    ],
  )

  // Drop a markdown snapshot in Neural Net for human-readable history.
  // Filename is timestamped + content-hash-prefixed so two snapshots taken
  // the same day with different content don't collide. Routing through
  // helmGuardedWrite means HELM-201 fires (observe-only by default —
  // this is the gate's first real customer).
  if (severity !== 'cosmetic' && prev) {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const fname = `${source.id}__${target.key}__${ts}__${hash.slice(0, 8)}.md`
      const filePath = path.join(SNAPSHOT_ROOT, fname)
      const md = renderSnapshotMarkdown(source, target, severity, prev, normalized, diff, notes)
      await helmGuardedWrite(filePath, md, {
        op: 'create',
        source: `doc-monitor:${source.id}`,
      })
    } catch (err: any) {
      // Snapshot-to-disk is best-effort. DB row is the source of truth.
      console.warn(
        `[doc-monitor:${source.id}] snapshot file write failed (continuing): ${err?.message?.slice(0, 120)}`,
      )
    }
  }

  return { id: ins.rows[0].id, isNew: true }
}

function renderSnapshotMarkdown(
  source: DocSource,
  target: DocFetchTarget,
  severity: DocSeverity,
  prev: { content: string },
  next: string,
  diff: string | null,
  notes: string | null,
): string {
  const ts = new Date().toISOString()
  return [
    `---`,
    `type: external-doc-snapshot`,
    `source: ${source.id}`,
    `source_name: ${source.name}`,
    `target_key: ${target.key}`,
    `url: ${target.url}`,
    `severity: ${severity}`,
    `fetched_at: ${ts}`,
    `---`,
    ``,
    `# ${source.name} — ${target.label} change detected`,
    ``,
    `**Severity**: ${severity.toUpperCase()}`,
    `**URL**: ${target.url}`,
    notes ? `**Scanner notes**: ${notes}\n` : '',
    `## Diff (line-level)`,
    '',
    '```diff',
    diff || '(no diff — first snapshot)',
    '```',
    '',
    `## Previous content (last ${Math.min(prev.content.length, 600)} chars)`,
    '',
    '```',
    prev.content.slice(-600),
    '```',
    '',
    `## New content (first ${Math.min(next.length, 1200)} chars)`,
    '',
    '```',
    next.slice(0, 1200),
    '```',
    '',
  ].join('\n')
}

async function maybeAlert(
  db: Pool,
  source: DocSource,
  target: DocFetchTarget,
  severity: DocSeverity,
  notes: string | null,
  rowId: string,
): Promise<boolean> {
  if (severity === 'cosmetic') return false
  if (!ADMIN_CHAT_ID) return false

  const emoji = severity === 'breaking' ? '🚨' : '📢'
  const text = [
    `${emoji} <b>${source.name} doc drift — ${severity.toUpperCase()}</b>`,
    `<b>Target</b>: ${target.label}`,
    `<b>URL</b>: ${target.url}`,
    notes ? `<b>Notes</b>: ${notes}` : '',
    `\nReview snapshot in Neural Net / DB row <code>${rowId.slice(0, 8)}</code>.`,
  ]
    .filter(Boolean)
    .join('\n')

  const sent = await sendTelegramMessage(ADMIN_CHAT_ID, text, 'HTML').catch((err) => {
    console.warn(
      `[doc-monitor:${source.id}] telegram alert failed: ${err?.message?.slice(0, 100)}`,
    )
    return false
  })

  if (sent) {
    await db
      .query(`UPDATE external_doc_snapshots SET alerted = true WHERE id = $1`, [rowId])
      .catch(() => undefined)
  }
  return Boolean(sent)
}

// ── The main loop ────────────────────────────────────────────────────────────

export interface DocScanResult {
  source: string
  targetsScanned: number
  targetsChanged: number
  targetsAlerted: number
  fetchErrors: number
  durationMs: number
}

/**
 * Run one scan cycle for `source`. Idempotent — safe to call multiple times
 * in a day; same content produces no new rows / no alerts.
 *
 * Returns a small summary so the cron driver can log + record metrics.
 * Never throws; internal failures degrade to error counts in the summary.
 */
export async function runDocScan(db: Pool, source: DocSource): Promise<DocScanResult> {
  const start = Date.now()
  const result: DocScanResult = {
    source: source.id,
    targetsScanned: 0,
    targetsChanged: 0,
    targetsAlerted: 0,
    fetchErrors: 0,
    durationMs: 0,
  }

  let targets: DocFetchTarget[]
  try {
    targets = source.targets()
  } catch (err: any) {
    console.error(`[doc-monitor:${source.id}] targets() threw: ${err?.message?.slice(0, 120)}`)
    result.durationMs = Date.now() - start
    return result
  }

  for (const target of targets) {
    result.targetsScanned++
    try {
      const fetched = await fetchOne(target)
      if (!fetched.ok) {
        result.fetchErrors++
        // Record the failure as a row (so we have a paper trail of "scanner
        // tried + failed"), severity=cosmetic so we don't spam alerts.
        await db
          .query(
            `INSERT INTO external_doc_snapshots
               (source_id, url, content_hash, content, content_bytes,
                severity, http_status, fetch_error, notes)
             VALUES ($1, $2, $3, $4, $5, 'cosmetic', $6, $7, $8)`,
            [
              source.id,
              target.url,
              sha256('__fetch_failed__'),
              '',
              0,
              fetched.status,
              fetched.error,
              `fetch failed for ${target.label}`,
            ],
          )
          .catch(() => undefined)
        continue
      }

      const normalized = source.normalize(fetched.body, target)
      const prev = await loadPrevSnapshot(db, source.id, target.url)
      const cls = prev
        ? source.classify(prev.content, normalized, target)
        : { severity: 'notable' as DocSeverity, notes: 'first-ever snapshot — baseline' }

      const persist = await persistSnapshot(
        db,
        source,
        target,
        fetched,
        normalized,
        prev,
        cls.severity,
        cls.notes ?? null,
      )

      if (persist.isNew) {
        result.targetsChanged++
        const alerted = await maybeAlert(db, source, target, cls.severity, cls.notes ?? null, persist.id)
        if (alerted) result.targetsAlerted++

        // S31 H2 — agent-bus integration. Publish breaking + notable
        // changes to the inter-agent bus so other agents (bridge,
        // Helm, future Huginn) can subscribe + react. Topic shape:
        // 'external-doc-drift:<source>:<severity>'. Best-effort —
        // a publish failure must not break the doc-monitor cycle.
        if (cls.severity === 'breaking' || cls.severity === 'notable') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { publish } = require('../agent-bus')
            await publish(db, {
              fromAgentId: 'doc-monitor',
              toAgentId: null, // broadcast
              topic: `external-doc-drift:${cls.severity}`,
              payload: {
                docMonitorSource: source.id,
                sourceName: source.name,
                targetKey: target.key,
                targetLabel: target.label,
                url: target.url,
                severity: cls.severity,
                notes: cls.notes ?? null,
                snapshotId: persist.id,
              },
              ttlSeconds: 7 * 24 * 60 * 60, // 7-day TTL — older drift events go stale
            })
          } catch (err: any) {
            console.warn(
              `[doc-monitor:${source.id}] agent-bus publish failed: ${err?.message?.slice(0, 100)}`,
            )
          }
        }
      }
    } catch (err: any) {
      // One target failing must NOT take down the rest of the scan.
      console.error(
        `[doc-monitor:${source.id}] target ${target.key} threw: ${err?.message?.slice(0, 120)}`,
      )
      result.fetchErrors++
    }
  }

  result.durationMs = Date.now() - start
  console.log(
    `[doc-monitor:${source.id}] scan complete in ${result.durationMs}ms — ` +
      `${result.targetsScanned} scanned, ${result.targetsChanged} changed, ` +
      `${result.targetsAlerted} alerted, ${result.fetchErrors} errors`,
  )
  return result
}

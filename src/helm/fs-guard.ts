// ─────────────────────────────────────────────────────────────────────────────
// HELM FS-GUARD — protected filesystem write gate
//
// S31 H1 — scaffold. Covers HELM-201 (Neural Net deletion), HELM-202
// (Decision Journal append-only), HELM-203 (skills manifest tampering).
//
// Threat model: an agent (Claude Code or any Node-side code) tries to:
//   - Delete or truncate Neural Net/Claude Memory/*.md       (HELM-201)
//   - Modify an existing Decision Journal entry instead of   (HELM-202)
//     appending a new file
//   - Write to .claude/skills/*/SKILL.md without an           (HELM-203)
//     Odin-signed manifest entry
//
// Architecture note: agent-side writes through Claude Code's Edit/Write
// tools cannot be intercepted from inside this Node backend — those need
// the Rust ingress proxy (Marathon 8 Phase 1). What we CAN do today:
//
//   1. Export `helmGuardedWrite()` as the CANONICAL fs-write helper
//      for any Node-side code that touches the protected paths (the LZ
//      doc-monitor and CCTP doc-monitor Richard scoped for S31 morning
//      will both go through this gate).
//
//   2. Document the contract so reviewers can flag direct fs.writeFile
//      against guarded paths in code review.
//
// Mode follows the rest of Helm: env (HELM_FS_GUARD_ENFORCE=on)
// + runtime override (admin UI). Observe-mode by default.
//
// Path classification:
//   guarded:             /Neural Net/Claude Memory/    → HELM-201, no delete/truncate
//   journal-append-only: /Neural Net/Decision Journal/ → HELM-202, only NEW files
//   skill-manifest:      /.claude/skills/*/SKILL.md    → HELM-203, needs Odin sig
//
// INTENTIONALLY UNPROTECTED (S31 H2 design call, documented for future me):
//   /Neural Net/Doc Snapshots/ — append-only artifact files written by the
//     external-doc-monitor cron. Routine programmatic writes (not agent-
//     driven), the DB row is the source of truth, and protecting them
//     would generate a HELM-201 event on every legitimate doc-drift
//     snapshot — pure noise. If a future review wants to gate these,
//     extend classifyPath but ALSO add a `doc-snapshot` classification
//     with relaxed rules (allow create + append, block only delete).
//   Other Neural Net subtrees (Sub-Agents/, Session_Logs/, etc.) — same
//     reasoning. They get the same content-protection at the git layer
//     since the Neural Net is committed; HELM-201 is reserved for the
//     specifically-sensitive Claude Memory + Decision Journal subtrees.

import { promises as fsp, existsSync, statSync } from 'fs'
import * as path from 'path'
import { logHelmEvent } from './core'
import { recordWrite } from './mass-write-counter'

// ── Mode ─────────────────────────────────────────────────────────────────────

let _runtimeEnforceOverride: boolean | null = null

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_FS_GUARD_ENFORCE === 'on'
}

export function setFsGuardEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

export function getFsGuardMode(): { mode: 'enforce' | 'observe'; source: 'runtime-override' | 'env' } {
  if (_runtimeEnforceOverride !== null) {
    return { mode: _runtimeEnforceOverride ? 'enforce' : 'observe', source: 'runtime-override' }
  }
  return {
    mode: process.env.HELM_FS_GUARD_ENFORCE === 'on' ? 'enforce' : 'observe',
    source: 'env',
  }
}

// ── Path classification ──────────────────────────────────────────────────────

export type GuardedClass =
  | 'unprotected'              // not a guarded path; pass through
  | 'memory'                   // Neural Net/Claude Memory/ — HELM-201
  | 'decision-journal'         // Neural Net/Decision Journal/ — HELM-202
  | 'skills-manifest'          // .claude/skills/*/SKILL.md — HELM-203

function normalize(p: string): string {
  // forward-slash form for stable substring checks
  return path.normalize(p).split(path.sep).join('/')
}

export function classifyPath(filePath: string): GuardedClass {
  const norm = normalize(filePath)

  // SKILL.md inside any .claude/skills/ subtree
  if (/\.claude\/skills\/[^/]+\/SKILL\.md$/i.test(norm)) {
    return 'skills-manifest'
  }
  // Decision Journal — append-only, exact directory match
  if (norm.includes('/Neural Net/Decision Journal/')) {
    return 'decision-journal'
  }
  // Claude Memory subtree
  if (norm.includes('/Neural Net/Claude Memory/')) {
    return 'memory'
  }
  return 'unprotected'
}

// ── Operation taxonomy ───────────────────────────────────────────────────────

export type GuardedOp = 'create' | 'overwrite' | 'append' | 'delete' | 'truncate'

export interface GuardedWriteOptions {
  /** What we're doing — drives the rule applied. */
  op: GuardedOp
  /** Optional Odin manifest signature. Required for skills-manifest writes
   *  in enforce mode. Not yet validated cryptographically — that lands with
   *  Marathon 8 Phase 1 + the Odin keyring. For now we just record the claim. */
  odinSignature?: string
  /** Caller attribution for logs. */
  source: string
}

// ── Rule decisions ───────────────────────────────────────────────────────────

interface Decision {
  blocked: boolean         // true → throw in enforce mode
  ruleId: string | null    // 'HELM-201' / 'HELM-202' / 'HELM-203' / null
  reason: string
}

function decide(cls: GuardedClass, opts: GuardedWriteOptions, fileExists: boolean): Decision {
  const op = opts.op

  // HELM-201: Claude Memory subtree — block delete/truncate.
  if (cls === 'memory') {
    if (op === 'delete' || op === 'truncate') {
      return { blocked: true, ruleId: 'HELM-201', reason: `${op} on Claude Memory file` }
    }
    return { blocked: false, ruleId: null, reason: `${op} on Claude Memory (allowed)` }
  }

  // HELM-202: Decision Journal — only allow create-new.
  if (cls === 'decision-journal') {
    if (op === 'create' && !fileExists) {
      return { blocked: false, ruleId: null, reason: 'append-new-file (allowed)' }
    }
    // overwrite, append, delete, truncate, OR create-on-existing → block
    return {
      blocked: true,
      ruleId: 'HELM-202',
      reason: `${op} on existing Decision Journal entry (append-only audit log)`,
    }
  }

  // HELM-203: skills/SKILL.md — needs Odin signature.
  if (cls === 'skills-manifest') {
    if (!opts.odinSignature) {
      return {
        blocked: true,
        ruleId: 'HELM-203',
        reason: 'skills/SKILL.md write without Odin signature',
      }
    }
    return { blocked: false, ruleId: null, reason: 'skills/SKILL.md write with claimed Odin signature' }
  }

  // Unprotected — never blocked.
  return { blocked: false, ruleId: null, reason: 'unprotected path' }
}

// ── The gate ─────────────────────────────────────────────────────────────────

/**
 * Canonical guarded-write entry point. Use this instead of fs.writeFile /
 * fs.appendFile / fs.unlink / fs.truncate when touching any path that COULD
 * fall under a guarded class. Cheap on unprotected paths.
 *
 * Above-rule behavior:
 *   - observe mode: log HELM-2xx event, perform the op anyway
 *   - enforce mode: log HELM-2xx event with action='block', THROW (op skipped)
 *
 * For Decision Journal entries, callers MUST set op='create' AND pass a
 * filePath that does not yet exist. For skills/SKILL.md, callers MUST pass
 * an Odin signature claim (validation is Marathon 8 Phase 1).
 */
export async function helmGuardedWrite(
  filePath: string,
  contents: string | Buffer,
  opts: GuardedWriteOptions,
): Promise<void> {
  const cls = classifyPath(filePath)
  const fileExists = (() => {
    try { return existsSync(filePath) && statSync(filePath).isFile() }
    catch { return false }
  })()

  const decision = decide(cls, opts, fileExists)

  if (decision.ruleId) {
    const action: 'block' | 'log-only' = decision.blocked && enforceModeOn() ? 'block' : 'log-only'
    const subject = `${opts.source} ${opts.op} → ${path.basename(filePath)} (${cls})`

    // Fire the rule event no matter what — observability is the point.
    void logHelmEvent({
      ruleId: decision.ruleId,
      subject,
      context: {
        source: opts.source,
        op: opts.op,
        filePath: filePath.slice(-120),
        class: cls,
        decision: decision.reason,
        action,
        fileExists,
        odinSignaturePresent: Boolean(opts.odinSignature),
      },
      actionOverride: action,
    })

    if (decision.blocked && enforceModeOn()) {
      throw new Error(
        `[helm ${decision.ruleId}] blocked ${opts.op} on ${filePath}: ${decision.reason}`,
      )
    }
  }

  // HELM-205 mass-write counter — count ANY guarded write (even create/append
  // on unprotected paths), to catch ransomware-shape patterns where an
  // attacker writes hundreds of files quickly. The mass counter has its own
  // separate enforce mode + threshold; on block it throws here and the op
  // never executes.
  if (opts.op === 'create' || opts.op === 'overwrite' || opts.op === 'append') {
    const verdict = recordWrite(opts.source)
    if (!verdict.allowed && verdict.reason) {
      throw new Error(verdict.reason)
    }
  }

  // Perform the op. Cast to any to bridge string | Buffer through node fs
  // overloaded signatures (Buffer is an ArrayBufferView at runtime).
  const data = contents as string | Uint8Array
  switch (opts.op) {
    case 'create':
    case 'overwrite':
      await fsp.writeFile(filePath, data)
      return
    case 'append':
      await fsp.appendFile(filePath, data)
      return
    case 'delete':
      await fsp.unlink(filePath).catch((err) => {
        if (err && err.code !== 'ENOENT') throw err
      })
      return
    case 'truncate':
      await fsp.truncate(filePath, 0)
      return
    default: {
      // Exhaustiveness check
      const _exhaustive: never = opts.op
      throw new Error(`unhandled op: ${_exhaustive}`)
    }
  }
}

/** Sync helper for code paths that can't await (rare; prefer async). Same
 *  rule logic, but the actual fs op is synchronous. */
export function helmGuardedWriteSync(
  filePath: string,
  contents: string | Buffer,
  opts: GuardedWriteOptions,
): void {
  // Re-implement to keep the sync path obvious. fs.writeFileSync etc.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  const cls = classifyPath(filePath)
  const fileExists = (() => {
    try { return fs.existsSync(filePath) && fs.statSync(filePath).isFile() }
    catch { return false }
  })()
  const decision = decide(cls, opts, fileExists)

  if (decision.ruleId) {
    const action: 'block' | 'log-only' = decision.blocked && enforceModeOn() ? 'block' : 'log-only'
    void logHelmEvent({
      ruleId: decision.ruleId,
      subject: `${opts.source} ${opts.op} → ${path.basename(filePath)} (${cls})`,
      context: {
        source: opts.source, op: opts.op, filePath: filePath.slice(-120),
        class: cls, decision: decision.reason, action, fileExists,
        odinSignaturePresent: Boolean(opts.odinSignature), sync: true,
      },
      actionOverride: action,
    })
    if (decision.blocked && enforceModeOn()) {
      throw new Error(`[helm ${decision.ruleId}] blocked ${opts.op} on ${filePath}: ${decision.reason}`)
    }
  }

  const data = contents as string | Uint8Array
  switch (opts.op) {
    case 'create':
    case 'overwrite':
      fs.writeFileSync(filePath, data); return
    case 'append':
      fs.appendFileSync(filePath, data); return
    case 'delete':
      try { fs.unlinkSync(filePath) }
      catch (err: any) { if (err?.code !== 'ENOENT') throw err }
      return
    case 'truncate':
      fs.truncateSync(filePath, 0); return
    default: {
      const _exhaustive: never = opts.op
      throw new Error(`unhandled op: ${_exhaustive}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELM MERKLE MANIFEST — HELM-208
//
// S31 H2. Boot-time integrity check on the agent's "soul" — Neural Net
// memory + .claude/skills. The threat model is silent mutation:
//   - An attacker (or a buggy script) edits a file in Neural Net/Claude
//     Memory/ to plant misleading guidance for future-Mythos.
//   - A skill's SKILL.md gets rewritten without an Odin signature.
//   - .git is bypassed (worktree edit before commit, or local-only state).
//
// Detection: at boot, hash every protected file + compare against a
// previously-signed manifest (manifest.json). Any mismatch → HELM-208
// alert. Also: any new file in protected paths NOT in the manifest →
// alert. Also: any manifest file no longer present in the worktree →
// alert (deletion).
//
// Bootstrapping: on first run with no manifest, we WRITE one (recording
// the current state as the trusted baseline). The operator can also
// regenerate the manifest after a legitimate change via
// `regenerateMerkleManifest()` from an admin endpoint.
//
// HONESTY: this is a hash check, not a Merkle tree (single-level for
// simplicity — every file's sha256 sits at depth 1 of the manifest).
// True Merkle (with proof-of-membership) lands in Phase 1 alongside the
// Rust proxy. But the security property we need today — "did anything
// change" — is fully covered by the flat manifest.

import { promises as fsp, statSync, existsSync } from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { logHelmEvent } from './core'

const MANIFEST_FILENAME = 'heimdall-manifest.json'

let _runtimeEnforceOverride: boolean | null = null

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_MERKLE_ENFORCE === 'on'
}

export function setMerkleEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

export function getMerkleMode(): { mode: 'enforce' | 'observe'; source: 'runtime-override' | 'env' } {
  if (_runtimeEnforceOverride !== null) {
    return { mode: _runtimeEnforceOverride ? 'enforce' : 'observe', source: 'runtime-override' }
  }
  return {
    mode: process.env.HELM_MERKLE_ENFORCE === 'on' ? 'enforce' : 'observe',
    source: 'env',
  }
}

// ── Protected paths ─────────────────────────────────────────────────────────

const PROTECTED_ROOTS = [
  // Match the same subtrees fs-guard.ts protects PLUS .claude/skills/.
  // Resolution order: env override → repo-relative defaults.
  // NN_PATH points at the ABSOLUTE Neural Net path; CLAUDE_SKILLS_PATH
  // points at .claude/skills.
  process.env.HELM_NN_MEMORY_PATH || path.resolve(process.cwd(), '..', 'Neural Net', 'Claude Memory'),
  process.env.HELM_NN_JOURNAL_PATH || path.resolve(process.cwd(), '..', 'Neural Net', 'Decision Journal'),
  process.env.HELM_SKILLS_PATH || path.resolve(process.cwd(), '..', '.claude', 'skills'),
]

// ── Hashing ─────────────────────────────────────────────────────────────────

async function sha256File(filePath: string): Promise<string> {
  const data = await fsp.readFile(filePath)
  // Node Buffer is a Uint8Array at runtime; cast for the crypto.update overload.
  return crypto.createHash('sha256').update(new Uint8Array(data)).digest('hex')
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch (err: any) {
    // Path doesn't exist on this host — skip silently. Common on VPS where
    // Neural Net isn't synced.
    return out
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.claude') continue // skip dotfiles except .claude
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await walk(full, out)
    } else if (ent.isFile()) {
      out.push(full)
    }
  }
  return out
}

// ── Manifest shape ──────────────────────────────────────────────────────────

interface Manifest {
  version: 1
  generatedAt: string
  rootCount: number
  fileCount: number
  totalBytes: number
  /** map: relative-from-protected-root path → sha256 */
  files: Record<string, string>
  rootDigest: string  // sha256 over the sorted concatenation of (path, hash) — the "Merkle root"
}

function manifestPath(): string {
  return process.env.HELM_MANIFEST_PATH ||
    path.resolve(process.cwd(), 'src', 'heimdall', MANIFEST_FILENAME)
}

function computeRootDigest(files: Record<string, string>): string {
  const h = crypto.createHash('sha256')
  for (const key of Object.keys(files).sort()) {
    h.update(key)
    h.update('\n')
    h.update(files[key])
    h.update('\n')
  }
  return h.digest('hex')
}

async function buildManifestFromDisk(): Promise<Manifest> {
  const allFiles: string[] = []
  let totalBytes = 0
  for (const root of PROTECTED_ROOTS) {
    if (!existsSync(root)) continue
    const files = await walk(root)
    allFiles.push(...files)
  }

  const map: Record<string, string> = {}
  for (const f of allFiles) {
    const stat = statSync(f)
    totalBytes += stat.size
    // Key by absolute path for stability — paths are platform-specific
    // (Windows backslash vs POSIX) but the agent runs on one platform.
    // Normalize separators for cross-platform manifest portability.
    const normalized = f.split(path.sep).join('/')
    try {
      map[normalized] = await sha256File(f)
    } catch (err) {
      // File might have vanished between walk + hash. Record as missing.
      map[normalized] = '<read-failed>'
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    rootCount: PROTECTED_ROOTS.length,
    fileCount: allFiles.length,
    totalBytes,
    files: map,
    rootDigest: computeRootDigest(map),
  }
}

async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await fsp.readFile(manifestPath(), 'utf8')
    return JSON.parse(raw) as Manifest
  } catch {
    return null
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  const p = manifestPath()
  await fsp.mkdir(path.dirname(p), { recursive: true })
  await fsp.writeFile(p, JSON.stringify(m, null, 2), 'utf8')
}

// ── Verification ────────────────────────────────────────────────────────────

export interface MerkleVerifyResult {
  status: 'ok' | 'mismatch' | 'no-baseline' | 'roots-empty'
  fileCount: number
  totalBytes: number
  rootDigestActual: string
  rootDigestExpected: string | null
  changedFiles: string[]
  newFiles: string[]
  missingFiles: string[]
  durationMs: number
}

/**
 * Compute the current state, compare to the on-disk manifest, return the
 * diff. Pure read — does NOT update the manifest.
 *
 * Status semantics:
 *   - 'ok'           : actual digest matches expected
 *   - 'mismatch'     : digests differ; changedFiles/newFiles/missingFiles populated
 *   - 'no-baseline'  : no manifest exists yet (first-run state)
 *   - 'roots-empty'  : none of the protected roots exist on this host
 *                       (e.g. VPS where Neural Net isn't synced — not an alert)
 */
export async function verifyMerkleManifest(): Promise<MerkleVerifyResult> {
  const start = Date.now()
  const expected = await loadManifest()
  const actual = await buildManifestFromDisk()

  const result: MerkleVerifyResult = {
    status: 'ok',
    fileCount: actual.fileCount,
    totalBytes: actual.totalBytes,
    rootDigestActual: actual.rootDigest,
    rootDigestExpected: expected?.rootDigest ?? null,
    changedFiles: [],
    newFiles: [],
    missingFiles: [],
    durationMs: 0,
  }

  if (actual.fileCount === 0) {
    result.status = 'roots-empty'
    result.durationMs = Date.now() - start
    return result
  }
  if (!expected) {
    result.status = 'no-baseline'
    result.durationMs = Date.now() - start
    return result
  }

  if (actual.rootDigest === expected.rootDigest) {
    result.status = 'ok'
    result.durationMs = Date.now() - start
    return result
  }

  // Diff — find changed, new, and missing files.
  const expFiles = expected.files || {}
  const actFiles = actual.files
  for (const key of Object.keys(actFiles)) {
    if (!(key in expFiles)) {
      result.newFiles.push(key)
    } else if (expFiles[key] !== actFiles[key]) {
      result.changedFiles.push(key)
    }
  }
  for (const key of Object.keys(expFiles)) {
    if (!(key in actFiles)) {
      result.missingFiles.push(key)
    }
  }

  result.status = 'mismatch'
  result.durationMs = Date.now() - start
  return result
}

/**
 * Run verification at boot. On first run (no baseline), write a manifest
 * and log a 'no-baseline' event. On mismatch, log HELM-208 with diff
 * context; in enforce mode, throw to block boot.
 *
 * Called from initHelm() — non-fatal in observe mode so we don't
 * brick a working backend on a manifest desync.
 */
export async function runBootIntegrityCheck(): Promise<MerkleVerifyResult> {
  const result = await verifyMerkleManifest()

  if (result.status === 'roots-empty') {
    // Common on VPS where Neural Net isn't synced. Don't alert.
    console.log('[helm:merkle] protected roots empty on this host — skipping boot integrity check')
    return result
  }

  if (result.status === 'no-baseline') {
    // First-ever boot or after a manual `rm`. Generate + persist a baseline.
    const fresh = await buildManifestFromDisk()
    await writeManifest(fresh)
    void logHelmEvent({
      ruleId: 'HELM-208',
      subject: `Merkle manifest baseline created: ${fresh.fileCount} files, ${(fresh.totalBytes / 1024).toFixed(0)}KB`,
      context: {
        rootDigest: fresh.rootDigest,
        fileCount: fresh.fileCount,
        totalBytes: fresh.totalBytes,
        action: 'log-only',
        note: 'first-run baseline',
      },
      actionOverride: 'log-only',
    })
    console.log(
      `[helm:merkle] baseline manifest written — ${fresh.fileCount} files, root=${fresh.rootDigest.slice(0, 16)}…`,
    )
    return result
  }

  if (result.status === 'ok') {
    console.log(
      `[helm:merkle] integrity OK — ${result.fileCount} files, root=${result.rootDigestActual.slice(0, 16)}…`,
    )
    return result
  }

  // Mismatch.
  const enforce = enforceModeOn()
  const subject = `MERKLE MISMATCH — ${result.changedFiles.length} changed, ${result.newFiles.length} new, ${result.missingFiles.length} missing`
  void logHelmEvent({
    ruleId: 'HELM-208',
    subject,
    context: {
      action: enforce ? 'quarantine' : 'log-only',
      rootDigestExpected: result.rootDigestExpected,
      rootDigestActual: result.rootDigestActual,
      changedFiles: result.changedFiles.slice(0, 20),
      newFiles: result.newFiles.slice(0, 20),
      missingFiles: result.missingFiles.slice(0, 20),
    },
    actionOverride: enforce ? 'quarantine' : 'log-only',
  })
  console.warn(
    `[helm:merkle] MISMATCH — ${result.changedFiles.length} changed, ${result.newFiles.length} new, ${result.missingFiles.length} missing — ` +
      `root expected=${result.rootDigestExpected?.slice(0, 16)}, actual=${result.rootDigestActual.slice(0, 16)}`,
  )
  if (enforce) {
    throw new Error(
      `[helm HELM-208] boot blocked: integrity mismatch (${result.changedFiles.length} changed, ${result.newFiles.length} new, ${result.missingFiles.length} missing)`,
    )
  }
  return result
}

/** Operator-triggered: rebuild + persist a fresh baseline. Use after a
 *  legitimate change to Neural Net or skills. Returns the new manifest. */
export async function regenerateMerkleManifest(): Promise<Manifest> {
  const m = await buildManifestFromDisk()
  await writeManifest(m)
  void logHelmEvent({
    ruleId: 'HELM-208',
    subject: `Merkle manifest regenerated by operator — ${m.fileCount} files, root=${m.rootDigest.slice(0, 16)}…`,
    context: {
      rootDigest: m.rootDigest,
      fileCount: m.fileCount,
      totalBytes: m.totalBytes,
      action: 'log-only',
      note: 'operator-regenerate',
    },
    actionOverride: 'log-only',
  })
  return m
}

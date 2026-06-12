// ─────────────────────────────────────────────────────────────────────────────
// HELM-202 — Decision Journal append-only enforcement (boot-time scanner)
//
// Catalog: "Write to Neural Net/Decision Journal/*.md other than
// append-new-file → block. Decision Journal is append-only audit log."
//
// Two-layer enforcement:
//   1. .husky/pre-commit hook — blocks commits that modify existing DJ
//      files (write-time gate). Allow override via "HELM-202-ALLOW:"
//      annotation in commit message body.
//   2. THIS module — boot-time scanner that walks git history of
//      docs/Decision Journal/*.md, flags any file with > 1 commit
//      touching it (i.e. add + edit, vs append-new-file = single add commit).
//      Detects modifications that bypassed the pre-commit hook (e.g. via
//      `--no-verify` or direct push from an environment without husky).
//
// The boot scanner is detection, not blocking — at boot time we can't
// roll back history. Logging via heimdall_events surfaces in the admin
// Mythos POV "recent counsel" + future Muninn audit cycles.
//
// Dependency: requires `git` on PATH and the nuro repo to be a git
// working tree. On non-git environments (e.g. fresh clone via tarball,
// docker layer), the scanner soft-fails with a "skipped" log.
//
// observe (default) — log heimdall_events with action='log-alert'
// enforce (HELM_202_ENFORCE=on) — additionally throw at scan
//                  end so PM2 restart-loops the service
// ─────────────────────────────────────────────────────────────────────────────

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve as resolvePath } from 'node:path'
import { promises as fs } from 'node:fs'
import { logHelmEvent } from './core'

const execAsync = promisify(exec)

const DJ_GLOB = 'docs/Decision Journal'

interface Helm202Violation {
  file: string
  commitCount: number
  commits: string[]
}

/**
 * For each DJ file, count commits that touched it. > 1 = modified (vs
 * append-new-file = single add commit). Returns violations only.
 *
 * `--follow` traces renames, so a file that was renamed once still
 * shows N commits across both names — we count all of them. The append-
 * only invariant: a DJ file is born and never edited.
 */
export async function scanDjForHelm202(repoRoot: string = process.cwd()): Promise<Helm202Violation[]> {
  const djRoot = resolvePath(repoRoot, DJ_GLOB)

  // Confirm directory exists (skip on systems where docs aren't synced yet).
  try {
    await fs.access(djRoot)
  } catch {
    return []
  }

  // List all .md files under DJ.
  let files: string[]
  try {
    const entries = await fs.readdir(djRoot)
    files = entries.filter((e) => e.endsWith('.md'))
  } catch {
    return []
  }

  const violations: Helm202Violation[] = []

  for (const file of files) {
    const relPath = `${DJ_GLOB}/${file}`
    try {
      // git log --follow --format=%h -- <file> — short SHAs of commits touching
      // this file. One SHA = single add commit (clean append-only).
      const { stdout } = await execAsync(
        `git log --follow --format=%h -- "${relPath}"`,
        { cwd: repoRoot, timeout: 5000, maxBuffer: 256 * 1024 },
      )
      const commits = stdout
        .trim()
        .split('\n')
        .filter((s) => s.length > 0)
      if (commits.length > 1) {
        violations.push({
          file: relPath,
          commitCount: commits.length,
          // Cap to 5 most recent for context — full chain is on-disk anyway.
          commits: commits.slice(0, 5),
        })
      }
    } catch {
      // git might not be available; soft-fail per file
      continue
    }
  }

  // Log each violation. Subject identifies the rule + file for forensic
  // grep on heimdall_events.
  for (const v of violations) {
    void logHelmEvent({
      ruleId: 'HELM-CTRL',
      subject: `HELM-202: ${v.file} has ${v.commitCount} commits (Decision Journal append-only violation)`,
      agentId: 'helm-202-scanner',
      context: {
        kind: 'rule-violation',
        ruleId: 'HELM-202',
        file: v.file,
        commitCount: v.commitCount,
        recentCommits: v.commits,
        rationale: 'Decision Journal entries must be append-new-file only. > 1 commit indicates an edit-in-place bypass of the pre-commit hook.',
      },
      actionOverride: 'log-alert',
    })
  }

  return violations
}

/**
 * Boot-path entry. Wired from src/heimdall/index.ts. Logs violations +
 * (in enforce mode) throws so PM2 restart-loops.
 */
export async function runHelm202BootCheck(): Promise<void> {
  try {
    const violations = await scanDjForHelm202()
    if (violations.length === 0) {
      // Don't log clean state by default — would spam every boot. Verify
      // via `psql -c "SELECT * FROM heimdall_events WHERE rule_id = 'HELM-CTRL'
      // AND context->>'ruleId' = 'HELM-202' ORDER BY occurred_at DESC LIMIT 5"`
      // when investigating.
      return
    }
    console.warn(`[helm:HELM-202] ${violations.length} append-only violation(s) found:`)
    for (const v of violations) {
      console.warn(`  • ${v.file} — ${v.commitCount} commits (recent: ${v.commits.slice(0, 3).join(', ')})`)
    }
    if (process.env.HELM_202_ENFORCE === 'on') {
      throw new Error(`HELM-202 enforce: ${violations.length} append-only violation(s). See heimdall_events.`)
    }
  } catch (err: any) {
    if (process.env.HELM_202_ENFORCE === 'on') {
      console.error('[helm:HELM-202] enforce-mode boot rejection:', err?.message?.slice(0, 200))
      setTimeout(() => process.exit(1), 100)
      throw err
    }
    // Observe mode: swallow scan failure. Logged separately via console.warn.
    console.warn(`[helm:HELM-202] scan error (observe-mode swallow): ${err?.message?.slice(0, 200)}`)
  }
}

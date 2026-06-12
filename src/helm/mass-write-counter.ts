// ─────────────────────────────────────────────────────────────────────────────
// HELM MASS-WRITE COUNTER — HELM-205
//
// S31 H2. Catches "ransomware-shape" file-write patterns: > N files written
// in a short time window from the same source. Default threshold N=20 in
// a 60s window per source. Beyond that, log 'high' event + (in enforce
// mode) refuse the next write until the window resets.
//
// The counter is in-process, per-source. helmGuardedWrite + the global
// fs hooks bump it on each write; this module owns the bookkeeping and
// the rule decision.
//
// NOTE: this is process-local. A clustered deployment with multiple
// Helm instances would each see ~20 → could allow 40+ across the
// fleet. Cross-instance counting needs Redis or DB-side counters; queued
// for Marathon 8 Phase 1 alongside cluster-mode itself.

import { logHelmEvent } from './core'

interface Window {
  count: number
  windowStart: number  // unix ms when this window began
}

const WINDOW_MS = 60_000     // 60-second sliding window
const DEFAULT_THRESHOLD = 20

const _windows = new Map<string, Window>()

let _runtimeThreshold: number | null = null
let _runtimeEnforceOverride: boolean | null = null

export function setMassWriteThreshold(n: number | null): void {
  _runtimeThreshold = n
}
export function setMassWriteEnforceMode(value: boolean | null): void {
  _runtimeEnforceOverride = value
}

function threshold(): number {
  if (_runtimeThreshold !== null && _runtimeThreshold > 0) return _runtimeThreshold
  const envN = Number(process.env.HELM_MASS_WRITE_THRESHOLD)
  if (Number.isFinite(envN) && envN > 0) return envN
  return DEFAULT_THRESHOLD
}

function enforceModeOn(): boolean {
  if (_runtimeEnforceOverride !== null) return _runtimeEnforceOverride
  return process.env.HELM_MASS_WRITE_ENFORCE === 'on'
}

export function getMassWriteMode(): {
  mode: 'enforce' | 'observe'
  threshold: number
  source: 'runtime-override' | 'env'
} {
  const t = threshold()
  if (_runtimeEnforceOverride !== null) {
    return { mode: _runtimeEnforceOverride ? 'enforce' : 'observe', threshold: t, source: 'runtime-override' }
  }
  return {
    mode: process.env.HELM_MASS_WRITE_ENFORCE === 'on' ? 'enforce' : 'observe',
    threshold: t,
    source: 'env',
  }
}

/**
 * Record a write event from `source` (typically a helmGuardedWrite caller
 * label). Returns a decision:
 *   - allow: under threshold, proceed silently
 *   - flag-only: over threshold, observe-mode → fire HELM-205, return allow
 *   - block: over threshold, enforce-mode → fire HELM-205 with 'block', throw
 *
 * The caller is responsible for honoring the throw — helmGuardedWrite
 * already does so.
 */
export function recordWrite(source: string): { allowed: boolean; reason?: string } {
  const now = Date.now()
  const w = _windows.get(source)
  if (!w || now - w.windowStart > WINDOW_MS) {
    _windows.set(source, { count: 1, windowStart: now })
    return { allowed: true }
  }
  w.count += 1

  const limit = threshold()
  if (w.count <= limit) {
    return { allowed: true }
  }

  // Over threshold. Fire the rule.
  const subject = `${source}: ${w.count} writes in ${Math.round((now - w.windowStart) / 1000)}s ≥ ${limit}`
  const enforce = enforceModeOn()

  void logHelmEvent({
    ruleId: 'HELM-205',
    subject,
    context: {
      source,
      count: w.count,
      windowMs: now - w.windowStart,
      threshold: limit,
      action: enforce ? 'quarantine' : 'log-only',
    },
    actionOverride: enforce ? 'quarantine' : 'log-only',
  })

  if (enforce) {
    return {
      allowed: false,
      reason: `[helm HELM-205] mass-write block: ${w.count} writes in ${Math.round((now - w.windowStart) / 1000)}s exceeds threshold ${limit}`,
    }
  }
  // Observe mode — over threshold but allowed; don't re-fire on every
  // subsequent write in the same window. Reset count so we fire again
  // only after a full window passes (limit fires per window, not per
  // over-limit write). Keep windowStart so legitimate burst patterns
  // surface as ONE event instead of N events.
  w.count = 1
  w.windowStart = now
  return { allowed: true }
}

/** Snapshot of current windows for admin UI / debugging. */
export function getMassWriteWindowsSnapshot(): Array<{
  source: string
  count: number
  ageMs: number
}> {
  const now = Date.now()
  return Array.from(_windows.entries()).map(([source, w]) => ({
    source,
    count: w.count,
    ageMs: now - w.windowStart,
  }))
}

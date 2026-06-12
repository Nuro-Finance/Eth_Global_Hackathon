// ─────────────────────────────────────────────────────────────────────────────
// HELM CORE — Session 30 H1
//
// Layer 4.5 security plane for the Corvus sovereign reasoning stack. Phase 0
// D.2 shipped the 52-rule catalog (Neural Net/Claude Memory/Helm — Rule
// Catalog.md). Phase 0 D.1 (Rust ingress proxy skeleton + eval cases) is
// queued for Marathon 8 Phase 1. This module is the TYPESCRIPT BRIDGE that
// lets us enforce a subset of the rules TODAY inside our existing Node
// backend, while the Rust proxy is built alongside.
//
// Scope:
//   - Embeds the 52-rule catalog as a TS constant for fast in-process
//     lookup (no DB round-trip per decision)
//   - Provides logHelmEvent() — every enforced rule trips this,
//     writes to heimdall_events, and emits console diagnostics
//   - Rule enforcement modules sit alongside:
//       src/heimdall/log-scanner.ts — HELM-108 live (secret-in-log)
//       src/heimdall/egress.ts      — HELM-101 observe-mode (outbound HTTP)
//       src/heimdall/tx-cap.ts      — HELM-105 scaffolded (value ceiling)
//
// When the Rust ingress proxy lands, it will consume the same rule catalog
// from this file exported via a JSON dump endpoint. Single source of truth.

import { pool } from '../db'

// ─── RULE CATALOG (mirrors Neural Net/Claude Memory/Helm — Rule Catalog.md) ──

export type HelmCategory =
  | 'ingress' | 'egress' | 'integrity' | 'credentials' | 'reasoning' | 'gjallarhorn'

export type HelmSeverity = 'critical' | 'high' | 'medium' | 'low'

export type HelmAction = 'log-only' | 'log-alert' | 'quarantine' | 'block'

export interface HelmRule {
  id: string                    // 'HELM-101'
  category: HelmCategory
  severity: HelmSeverity
  trigger: string               // Natural-language trigger description
  action: HelmAction        // Default action
  rationale: string             // One-sentence why
  /** When true, the TS bridge enforces this rule live. Others are
   *  scaffolded but inert — the Rust proxy will enforce them. */
  enforcedInTs?: boolean
}

export const HELM_RULES: HelmRule[] = [
  // ── Ingress ─────────────────────────────────────────────────────────────
  { id: 'HELM-001', category: 'ingress', severity: 'high',    trigger: "'ignore previous instructions' / 'you are now' role-confusion verb phrases", action: 'quarantine', rationale: 'Classic prompt-injection opener; Claude Mythos Preview escape started with one' },
  { id: 'HELM-002', category: 'ingress', severity: 'high',    trigger: "Embedded <|im_start|> / <|system|> / </s> chat-template markers", action: 'block', rationale: 'Attempts to hijack tokenizer-level role boundaries' },
  { id: 'HELM-003', category: 'ingress', severity: 'medium',  trigger: "Base64/hex blob > 1KB without declared purpose", action: 'log-alert', rationale: 'Common carrier for obfuscated payloads' },
  { id: 'HELM-004', category: 'ingress', severity: 'high',    trigger: "Tool-call XML embedded in user-authored text", action: 'block', rationale: 'Attempts to fake a tool-call result the agent will trust' },
  { id: 'HELM-005', category: 'ingress', severity: 'medium',  trigger: "Context > 900K tokens with >30% from single untrusted source", action: 'log-alert', rationale: 'Context dilution — drown safety training in hostile text' },
  { id: 'HELM-006', category: 'ingress', severity: 'medium',  trigger: "URL to IP literal or punycode domain", action: 'log-alert', rationale: 'Drive-by fetch targets' },
  { id: 'HELM-007', category: 'ingress', severity: 'low',     trigger: "Input contains PII shape (SSN/passport/bank) not flagged as expected", action: 'log-only', rationale: 'Leakage baseline for exfil correlation' },
  { id: 'HELM-008', category: 'ingress', severity: 'high',    trigger: "Cross-agent message without signed envelope (HMAC or ed25519)", action: 'block', rationale: 'Inter-agent comms must be signed by Helm-issued short-lived keys' },

  // ── Egress ──────────────────────────────────────────────────────────────
  { id: 'HELM-101', category: 'egress',  severity: 'critical', trigger: "Outbound HTTP to host not on per-agent allowlist", action: 'block', rationale: 'Exfil prevention; Claude Mythos used this to reach cloud runner', enforcedInTs: true },
  { id: 'HELM-102', category: 'egress',  severity: 'critical', trigger: "Shell command matching rm -rf / / dd if=*/of=/dev/* / mkfs / fork-bomb", action: 'block', rationale: 'Obvious host-destruction patterns' },
  { id: 'HELM-103', category: 'egress',  severity: 'critical', trigger: "Write to /etc, /root, /boot, ~/.ssh, /var/log without sudo-gate", action: 'block', rationale: 'Privilege escalation surface' },
  { id: 'HELM-104', category: 'egress',  severity: 'critical', trigger: "Git push --force to main / master / staging / protected refs", action: 'block', rationale: 'History erasure prevention' },
  { id: 'HELM-105', category: 'egress',  severity: 'critical', trigger: "On-chain tx value > per-agent daily cap", action: 'block', rationale: 'Reserve-drain defense (Kelp-class exploit)' },
  { id: 'HELM-106', category: 'egress',  severity: 'high',     trigger: "Cross-chain bridge call to non-allowlisted adapter", action: 'quarantine', rationale: 'Bridge layer is the highest-risk on-chain surface' },
  { id: 'HELM-107', category: 'egress',  severity: 'high',     trigger: "Package install without version pin", action: 'quarantine', rationale: 'Supply-chain attack surface' },
  { id: 'HELM-108', category: 'egress',  severity: 'high',     trigger: "API key / GOCSPX- / sk- / xoxb- literal in stdout, logs, or commit", action: 'block', rationale: 'Secret emission = immediate credential compromise', enforcedInTs: true },
  { id: 'HELM-109', category: 'egress',  severity: 'high',     trigger: "Large file read (>10MB) from / outside agent's declared worktree", action: 'quarantine', rationale: 'Filesystem reconnaissance pattern' },
  { id: 'HELM-110', category: 'egress',  severity: 'medium',   trigger: "Telegram / Discord / Slack webhook with secret-shape payload", action: 'quarantine', rationale: 'Sidechannel exfil to chat platforms' },
  { id: 'HELM-111', category: 'egress',  severity: 'medium',   trigger: "Opening WebSocket to non-allowlisted host", action: 'log-alert', rationale: 'Persistent exfil channels' },
  { id: 'HELM-112', category: 'egress',  severity: 'medium',   trigger: "DNS lookup for known C2 / tunnel / pastebin domains", action: 'log-alert', rationale: 'Compromise indicator correlation' },
  { id: 'HELM-113', category: 'egress',  severity: 'medium',   trigger: "Process spawn outside declared tool whitelist", action: 'quarantine', rationale: 'Unknown binaries = unknown behavior' },
  { id: 'HELM-114', category: 'egress',  severity: 'low',      trigger: "Environment variable enumeration (env, printenv, full process.env dump)", action: 'log-alert', rationale: 'Recon precursor to secret exfil' },

  // ── Integrity ───────────────────────────────────────────────────────────
  { id: 'HELM-201', category: 'integrity', severity: 'critical', trigger: "Delete or truncate file in Neural Net/Claude Memory/", action: 'block', rationale: 'Memory erasure = identity erasure' },
  { id: 'HELM-202', category: 'integrity', severity: 'critical', trigger: "Write to Neural Net/Decision Journal/*.md other than append-new-file", action: 'block', rationale: 'Decision Journal is append-only audit log' },
  { id: 'HELM-203', category: 'integrity', severity: 'critical', trigger: "Modification of .claude/skills/*/SKILL.md without Odin signature", action: 'block', rationale: 'Skill tampering = behavior override' },
  { id: 'HELM-204', category: 'integrity', severity: 'high',     trigger: "Modification of System Rules.md without human-signed manifest entry", action: 'quarantine', rationale: 'Operating-rule changes must be explicit' },
  { id: 'HELM-205', category: 'integrity', severity: 'high',     trigger: "Mass file write (>20 files in one agent turn)", action: 'quarantine', rationale: 'Reviewable batch ceiling; ransomware-shape defense' },
  { id: 'HELM-206', category: 'integrity', severity: 'high',     trigger: "Backdated file timestamp (mtime < parent commit date)", action: 'block', rationale: 'Time-travel edit = forensic evasion' },
  { id: 'HELM-207', category: 'integrity', severity: 'medium',   trigger: "Cross-agent read of another agent's private scratch directory", action: 'log-alert', rationale: 'Agent compartmentalization' },
  { id: 'HELM-208', category: 'integrity', severity: 'medium',   trigger: "Merkle-manifest mismatch on boot — file hash differs from last signed snapshot", action: 'quarantine', rationale: 'Tamper-evident integrity check; requires human re-sign' },

  // ── Credentials ─────────────────────────────────────────────────────────
  { id: 'HELM-301', category: 'credentials', severity: 'critical', trigger: "Agent requests credential not in its declared scope", action: 'block', rationale: 'Scope leak prevention' },
  { id: 'HELM-302', category: 'credentials', severity: 'critical', trigger: "Credential TTL exceeded — expired token not refreshed via Helm proxy", action: 'block', rationale: 'Forced re-auth on every staleness' },
  { id: 'HELM-303', category: 'credentials', severity: 'critical', trigger: "Secret literal committed to git", action: 'block', rationale: 'Every secret in git is already compromised' },
  { id: 'HELM-304', category: 'credentials', severity: 'high',     trigger: "Audit gap: secret read without matching entry in heimdall_credential_log", action: 'quarantine', rationale: 'Unauditable access = compromised vault' },
  { id: 'HELM-305', category: 'credentials', severity: 'high',     trigger: "Token age > rotation policy (default 30d for anchor keys)", action: 'log-alert', rationale: 'Proactive rotation signal' },
  { id: 'HELM-306', category: 'credentials', severity: 'high',     trigger: "Shared-secret use across two distinct agents", action: 'log-alert', rationale: 'Blast-radius increase; per-agent keys only' },
  { id: 'HELM-307', category: 'credentials', severity: 'medium',   trigger: "Credential appearing in error message or stack trace", action: 'block', rationale: 'Error-path exfil' },
  { id: 'HELM-308', category: 'credentials', severity: 'medium',   trigger: "HMAC / ed25519 signature verification failure on inter-agent envelope", action: 'block', rationale: 'Forged or corrupted inter-agent message' },

  // ── Reasoning ───────────────────────────────────────────────────────────
  { id: 'HELM-401', category: 'reasoning', severity: 'critical', trigger: "Agent output contains meta-reasoning about Helm ('bypass Helm', 'Helm won't see')", action: 'block', rationale: 'Direct adversary signal' },
  { id: 'HELM-402', category: 'reasoning', severity: 'critical', trigger: "Agent attempts to modify its own rule set (HELM-* file writes from non-Odin path)", action: 'block', rationale: 'Rule self-modification = fox guarding henhouse' },
  { id: 'HELM-403', category: 'reasoning', severity: 'high',     trigger: "Sudden identity shift mid-conversation (name/role change unprompted)", action: 'quarantine', rationale: 'Roleplay-hijack prompt-injection success indicator' },
  { id: 'HELM-404', category: 'reasoning', severity: 'high',     trigger: "Recursive agent-spawning depth > 2 without Odin approval", action: 'quarantine', rationale: 'Fork-bomb class' },
  { id: 'HELM-405', category: 'reasoning', severity: 'high',     trigger: "Chain-of-thought length 3σ above 30-day rolling mean for that agent", action: 'log-alert', rationale: 'Unusual reasoning volume signals confusion or exploration' },
  { id: 'HELM-406', category: 'reasoning', severity: 'medium',   trigger: "Output contradicts explicit principle in System Rules.md", action: 'log-alert', rationale: 'Drift from operating philosophy' },
  { id: 'HELM-407', category: 'reasoning', severity: 'medium',   trigger: "Tool-use pattern divergence from agent's 7-day baseline (KL > threshold)", action: 'log-alert', rationale: 'Behavior-distribution shift detector' },
  { id: 'HELM-408', category: 'reasoning', severity: 'low',      trigger: "Token emission variance anomaly (speed/burstiness)", action: 'log-only', rationale: 'Baseline feature for long-term anomaly correlation' },

  // ── Gjallarhorn ─────────────────────────────────────────────────────────
  { id: 'HELM-501', category: 'gjallarhorn', severity: 'critical', trigger: "2+ critical rule hits within 1h from same agent", action: 'quarantine', rationale: 'Compound-signal escalation' },
  { id: 'HELM-502', category: 'gjallarhorn', severity: 'critical', trigger: "1+ HELM-401/402 (rule-modification or bypass reasoning)", action: 'quarantine', rationale: 'Direct adversarial signal = immediate isolation' },
  { id: 'HELM-503', category: 'gjallarhorn', severity: 'critical', trigger: "Ingress from Pi-adjacent network segment (VLAN breach)", action: 'quarantine', rationale: 'Physical isolation breach' },
  { id: 'HELM-504', category: 'gjallarhorn', severity: 'high',     trigger: "Quarantine-state persistence > 24h without human review", action: 'log-alert', rationale: 'Stale quarantine = forgotten incident' },
  { id: 'HELM-505', category: 'gjallarhorn', severity: 'high',     trigger: "Watch-state persistence > 72h without resolution", action: 'log-alert', rationale: 'Avoid alert fatigue + unresolved risk' },
  { id: 'HELM-506', category: 'gjallarhorn', severity: 'medium',   trigger: "Credential rotation failed >3x in 1h", action: 'quarantine', rationale: 'Rotation failure could be active attack' },

  // ── Control / meta — not part of the 52-rule attack catalog. These ──
  // record operator-driven control flips, watchdog signals, Huginn counsel
  // verdicts, and other meta events. Living in the gjallarhorn category
  // because they're "watch the watcher" signals.
  { id: 'HELM-CTRL', category: 'gjallarhorn', severity: 'medium', trigger: "Operator-triggered or system-meta event (mode flip, watchdog, Huginn counsel, etc.)", action: 'log-only', rationale: 'Audit trail for operator + meta-signals; not an attack rule', enforcedInTs: true },
]

// Fast lookup
const _byId = new Map<string, HelmRule>(HELM_RULES.map((r) => [r.id, r]))
export function getHelmRule(id: string): HelmRule | null {
  return _byId.get(id) || null
}

// ─── EVENT LOG ──────────────────────────────────────────────────────────────

export interface HelmEventInput {
  ruleId: string
  agentId?: string | null
  subject: string
  context?: Record<string, unknown>
  /** Override the rule's default action (e.g. canary-downgrade a critical
   *  rule to log-only while we observe false-positive rate). */
  actionOverride?: HelmAction
}

/**
 * Record a rule trip. Best-effort DB write — never throws; Helm must
 * not itself cause application failures. Prints a structured line to stderr
 * so log aggregation picks it up even if DB is down.
 */
export async function logHelmEvent(input: HelmEventInput): Promise<void> {
  const rule = getHelmRule(input.ruleId)
  if (!rule) {
    console.warn(`[helm] unknown rule id ${input.ruleId} — event dropped`)
    return
  }
  const action = input.actionOverride || rule.action
  const logLine = `[helm] ${rule.id} ${rule.severity.toUpperCase()} ${action} — ${input.subject}`
  // stderr so it stands out against info-level app logs
  process.stderr.write(logLine + '\n')

  try {
    await pool.query(
      `INSERT INTO heimdall_events (rule_id, category, severity, action, agent_id, subject, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        rule.id,
        rule.category,
        rule.severity,
        action,
        input.agentId ?? null,
        input.subject.slice(0, 128),
        input.context ? JSON.stringify(input.context) : null,
      ],
    )
  } catch (err: any) {
    // Swallow — Helm's own failure must not cascade.
    console.warn(`[helm] event insert failed: ${err.message?.slice(0, 80)}`)
  }
}

/**
 * Count critical events in a rolling window for a given agent. Feeds
 * HELM-501 ("2+ criticals in 1h" → promote Watch → Pause). Returns 0 on
 * DB error so a monitoring outage doesn't stall decisions.
 */
export async function criticalEventsInWindow(
  agentId: string | null,
  windowMs: number = 60 * 60 * 1000,
): Promise<number> {
  try {
    const since = new Date(Date.now() - windowMs).toISOString()
    const result = await pool.query(
      `SELECT COUNT(*)::int AS n FROM heimdall_events
       WHERE severity = 'critical' AND occurred_at >= $1
             AND ($2::text IS NULL OR agent_id = $2)`,
      [since, agentId],
    )
    return Number(result.rows[0]?.n || 0)
  } catch {
    return 0
  }
}

/** Aggregated counts for the admin dashboard header. */
export async function helmEventSummary(windowMs: number = 24 * 60 * 60 * 1000): Promise<{
  total: number
  bySeverity: Record<HelmSeverity, number>
  byCategory: Record<HelmCategory, number>
}> {
  const defaults = {
    total: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } as Record<HelmSeverity, number>,
    byCategory: { ingress: 0, egress: 0, integrity: 0, credentials: 0, reasoning: 0, gjallarhorn: 0 } as Record<HelmCategory, number>,
  }
  try {
    const since = new Date(Date.now() - windowMs).toISOString()
    const [totalRes, sevRes, catRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM heimdall_events WHERE occurred_at >= $1`, [since]),
      pool.query(`SELECT severity, COUNT(*)::int AS n FROM heimdall_events WHERE occurred_at >= $1 GROUP BY severity`, [since]),
      pool.query(`SELECT category, COUNT(*)::int AS n FROM heimdall_events WHERE occurred_at >= $1 GROUP BY category`, [since]),
    ])
    defaults.total = Number(totalRes.rows[0]?.n || 0)
    for (const row of sevRes.rows) defaults.bySeverity[row.severity as HelmSeverity] = Number(row.n)
    for (const row of catRes.rows) defaults.byCategory[row.category as HelmCategory] = Number(row.n)
    return defaults
  } catch {
    return defaults
  }
}

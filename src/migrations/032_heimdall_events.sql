-- Migration 032: security events — security plane audit log (Session 30 H1)
-- Created: 2026-04-25
--
-- security is Marathon 8 Corvus Layer 4.5 — the security plane that gates
-- every agent I/O. Phase 0 D.2 shipped the 52-rule catalog in the Neural
-- Net. This migration + the src/security/ module ship the first live
-- enforcement surface in our TypeScript stack BEFORE the Rust ingress
-- proxy lands (Marathon 8 Phase 1).
--
-- Every rule trip writes a row here. Admin /admin/security renders the
-- recent stream + severity aggregates. When the Rust proxy lands, it
-- writes to the same table (Rust → Postgres is trivial) so the event
-- stream is continuous across the TS→Rust migration.
--
-- Schema notes:
-- - rule_id is denormalized string 'HEIM-NNN' — the canonical catalog
-- in Neural Net/Claude Memory/security — Rule Catalog.md lives in
-- Markdown; this column is the stable foreign key. We DO NOT
-- FK-constrain to a rules table because the rules live in code.
-- - action is the decision security took at trigger time:
-- 'log-only' — recorded, no behavior change
-- 'log-alert' — recorded + operator alerted
-- 'quarantine' — agent paused for human review
-- 'block' — request refused
-- Severity can differ from action (e.g. a critical rule can be
-- downgraded to log-only during a canary rollout).
-- - agent_id is nullable because some rules trip on user input (the
-- ingress category); others trip on agent output (egress/integrity).
-- - context (JSONB) stores the redacted evidence: input hash,
-- matched pattern, target URL, etc. Never store raw secrets — the
-- log-scanner rule exists to PREVENT that, so dumping the raw
-- match here would contradict the rule's purpose.

CREATE TABLE IF NOT EXISTS heimdall_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id       VARCHAR(16) NOT NULL,           -- 'HEIM-101', 'HEIM-108', etc.
    category      VARCHAR(32) NOT NULL,           -- ingress / egress / integrity / credentials / reasoning / gjallarhorn
    severity      VARCHAR(16) NOT NULL,           -- critical / high / medium / low
    action        VARCHAR(16) NOT NULL,           -- log-only / log-alert / quarantine / block
    agent_id      VARCHAR(64),                    -- user-facing agent name/id when applicable
    subject       VARCHAR(128),                   -- short description: "axios POST api.evil.com"
    context       JSONB,                          -- redacted evidence blob
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heimdall_events_occurred
    ON heimdall_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_heimdall_events_rule
    ON heimdall_events(rule_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_heimdall_events_severity
    ON heimdall_events(severity, occurred_at DESC);

INSERT INTO schema_migrations (version, filename, notes) VALUES
  ('032', '032_heimdall_events.sql', 'Session 30 Heimdall H1 — events table for the security plane audit log. First live enforcement surfaces: HEIM-108 log-scanner (secrets in stdout), HEIM-101 egress observe-mode, HEIM-205 mass-write scaffold. Admin panel at /admin/heimdall.')
ON CONFLICT (version) DO NOTHING;

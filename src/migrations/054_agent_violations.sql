-- Migration 054: Agent Smith truth-audit schema.
-- Part of Marathon 12 workstream C (2026-05-29 spec). The audit job itself
-- is built later in the sprint, but the schema lands now so:
-- 1. The chat handler can OPTIONALLY pre-emit violations if we detect
-- drift inline (e.g. the model emits text claiming a tool fired but
-- stop_reason was 'end_turn' with no tool_use blocks).
-- 2. The agent_audit_runs table tracks Smith's progress so re-runs
-- don't re-scan already-audited messages.
-- 3. The /admin/violations panel (workstream C deliverable) has its
-- backing tables ready when the FE work starts.
--
-- Spec: Marathon 12 — Trust + Execution Sprint.md, workstream C.

-- ─── agent_violations ──────────────────────────────────────────────────────
-- One row per detected violation. Linked to the specific message that
-- triggered it (card_agent_messages.id FK) so Smith + admins can replay
-- the full conversation context when reviewing.
CREATE TABLE IF NOT EXISTS agent_violations (
  id                  BIGSERIAL PRIMARY KEY,
  card_id             VARCHAR(64) NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id             VARCHAR(64) NOT NULL,
  message_id          BIGINT REFERENCES card_agent_messages(id) ON DELETE CASCADE,
 -- What the agent SAID that triggered the violation (excerpt from the
 -- assistant message content; e.g. "I'll freeze your card now").
  promise_text        TEXT,
 -- What tool we expected to be invoked given the promise. Resolved by
 -- Smith's heuristic OR Claude pass. NULL if Smith couldn't classify.
  expected_tool       VARCHAR(64),
 -- Tools actually invoked on that turn (from card_agent_messages.tools_fired).
 -- Empty array = the agent promised an action but invoked zero tools.
  actual_tools        TEXT[] DEFAULT NULL,
 -- Tier per spec:
 -- drift = promise without tool, no user complaint
 -- detected = drift PLUS user thumbs-down on the reply
 -- sustained = same agent has >3 detected in 24h → auto-kill
 -- user-abuse = user's complaint rate exceeds threshold → flag user
  severity            VARCHAR(16) NOT NULL
                      CHECK (severity IN ('drift', 'detected', 'sustained', 'user-abuse')),
 -- Whether the user surfaced this with negative feedback. Drives the
 -- drift → detected escalation.
  user_thumbs_down    BOOLEAN NOT NULL DEFAULT FALSE,
 -- Once a sustained violation triggers agent kill+replace OR ops manually
 -- reviews + dismisses, resolved is set so the admin panel can filter.
  resolved            BOOLEAN NOT NULL DEFAULT FALSE,
 -- Free-form note from ops or Smith ("auto-killed", "false positive",
 -- "user retracted complaint", etc.).
  resolution_note     TEXT,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

-- Hot-path indexes for the admin panel + Smith's cross-references.
CREATE INDEX IF NOT EXISTS idx_agent_violations_card_detected
  ON agent_violations (card_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_violations_user_severity
  ON agent_violations (user_id, severity);

-- Partial index: only un-resolved violations are usually queried, so the
-- index stays compact even as historical violations accumulate.
CREATE INDEX IF NOT EXISTS idx_agent_violations_unresolved
  ON agent_violations (detected_at DESC) WHERE NOT resolved;

CREATE INDEX IF NOT EXISTS idx_agent_violations_message
  ON agent_violations (message_id);

-- ─── agent_audit_runs ──────────────────────────────────────────────────────
-- One row per Smith invocation. Tracks the cursor (last message_id
-- scanned) so the next run picks up from there without re-scanning,
-- and tracks pass/fail status for ops visibility.
CREATE TABLE IF NOT EXISTS agent_audit_runs (
  id                    BIGSERIAL PRIMARY KEY,
  run_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  messages_scanned      INTEGER NOT NULL DEFAULT 0,
  violations_detected   INTEGER NOT NULL DEFAULT 0,
  duration_ms           INTEGER,
  status                VARCHAR(32) NOT NULL DEFAULT 'success'
                        CHECK (status IN ('success', 'failed', 'partial')),
  error_message         TEXT,
 -- The last card_agent_messages.id Smith scanned. Next run starts at
 -- (cursor_message_id + 1) so we don't re-audit forever.
  cursor_message_id     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_runs_run_at
  ON agent_audit_runs (run_at DESC);

COMMENT ON TABLE agent_violations IS
  'Agent Smith truth-audit findings (M12 workstream C). One row per detected violation. Tiered by severity (drift / detected / sustained / user-abuse). Sustained tier triggers auto-kill + agent replacement.';

COMMENT ON TABLE agent_audit_runs IS
  'Smith run log + cursor. Each row records one audit-job invocation. cursor_message_id is the high-watermark — next run scans messages with id > cursor.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 035 — Heimdall Gjallarhorn three-state machine
--
-- S31 H2. Closes the gap on HEIM-501 ("2+ critical events in 1h from same
-- agent → quarantine") and the Watch / Pause / Quarantine state machine
-- documented in the rule catalog § Gjallarhorn.
--
-- Schema additions:
--   - agents.heimdall_state           — current state (active|watch|paused|quarantined)
--   - agents.heimdall_state_reason    — why we're in this state
--   - agents.heimdall_state_since     — timestamp of the last transition
--   - agents.heimdall_state_review_at — when a human should review (null = no SLA)
--   - heimdall_state_history          — append-only audit log of every transition
--
-- The compound-signal detector cron writes to all of these; the admin UI
-- reads + supports manual override. The state-history table is append-only
-- so we can reconstruct every transition for forensic review.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Add state columns to agents. We don't drop the existing `status` column
-- (DEFAULT 'active') because legacy code reads it; Heimdall uses its own
-- state independently. They MAY converge in a future cleanup, but not today.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'heimdall_state'
    ) THEN
        ALTER TABLE agents
            ADD COLUMN heimdall_state VARCHAR(16) NOT NULL DEFAULT 'active'
                CHECK (heimdall_state IN ('active', 'watch', 'paused', 'quarantined'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'heimdall_state_reason'
    ) THEN
        ALTER TABLE agents
            ADD COLUMN heimdall_state_reason TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'heimdall_state_since'
    ) THEN
        ALTER TABLE agents
            ADD COLUMN heimdall_state_since TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'heimdall_state_review_at'
    ) THEN
        ALTER TABLE agents
            ADD COLUMN heimdall_state_review_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agents_heimdall_state
    ON agents(heimdall_state)
    WHERE heimdall_state != 'active';

-- Append-only state-transition log. Every flip lands here so we can:
--   1. Audit "why did agent X get quarantined at 2026-04-25 14:32?"
--   2. Compute mean-time-in-state per agent (operational metric)
--   3. Reconstruct the rule trip pattern that drove the transition
CREATE TABLE IF NOT EXISTS heimdall_state_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Refs agents.id when present, but we tolerate non-FK string ids
    -- (e.g. system-level "global" or sub-agent ids that aren't in
    -- agents). Pure VARCHAR rather than FK so we can record events
    -- before / outside the agents table without breaking on insert.
    agent_id        VARCHAR(128) NOT NULL,
    from_state      VARCHAR(16) NOT NULL,
    to_state        VARCHAR(16) NOT NULL
                    CHECK (to_state IN ('active', 'watch', 'paused', 'quarantined')),
    reason          TEXT NOT NULL,
    -- 'compound-detector' / 'manual-admin' / 'rule-101' etc. — used to
    -- distinguish auto-flips from human overrides for SLA tracking.
    triggered_by    VARCHAR(64) NOT NULL,
    -- The events that drove this transition (heimdall_events.id list).
    -- JSONB so we can index it later if needed; null for manual overrides.
    triggering_events JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heimdall_state_history_agent_time
    ON heimdall_state_history(agent_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_heimdall_state_history_to_state
    ON heimdall_state_history(to_state, occurred_at DESC)
    WHERE to_state IN ('paused', 'quarantined');

COMMIT;

-- Migration 045 — connected_agents
--
-- The "attach external agent" pillar from /skills. A user (Claude Code dev,
-- OpenAI Assistants user, LangChain builder) registers their agent with
-- Nuro and gets back an API key + webhook secret. Their agent then:
--
-- 1. POSTs proposed actions to /api/connectors/event (audit + observe)
-- 2. (future) POSTs decision requests to /api/connectors/decide (allow/block sync)
-- 3. We POST policy-stack outcomes back to their webhook_url (async fan-out)
--
-- Each connected_agent gets dual-tagged into our existing security stream:
-- - heimdall_events.connected_agent_id (NEW column on heimdall_events)
-- - heimdall_events.source = 'external'
-- so the existing dashboards + Telegram alerts work without code changes.
--
-- Key storage: we store sha256(api_key) + a 12-char prefix for display.
-- Plain key is shown ONCE at creation time and never again. Loss = rotate.
-- Mirrors GitHub PAT / Stripe restricted-key UX.
--
-- Webhook secret: HMAC-SHA256 over the request body. Receiver verifies via
-- `X-Nuro-Signature: sha256=<hex>` header (Stripe-style).

CREATE TABLE IF NOT EXISTS connected_agents (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID         NOT NULL,  -- references users.id (no FK to allow soft-delete + admin agents)
    name            TEXT         NOT NULL,
    description     TEXT,

 -- 'claude' | 'openai' | 'langchain' | 'custom' | 'unknown'
 -- Free-form; used for analytics + favicon in the dashboard. Not a
 -- check-constraint because the universe of agent runtimes will keep
 -- expanding.
    agent_type      TEXT         NOT NULL DEFAULT 'unknown',

 -- API key handling — see header comment.
    api_key_hash    TEXT         NOT NULL UNIQUE,
    api_key_prefix  TEXT         NOT NULL,   -- e.g. "nuro_ak_a1b2c3d4"
    webhook_url     TEXT,                     -- nullable; agents can poll instead
    webhook_secret  TEXT         NOT NULL,    -- HMAC-SHA256 secret

 -- Policy attached to this agent. Mirrors agent_budgets but lives here
 -- because connected agents are NOT first-class agents in our orchestrator
 -- — they're external entities under our policy umbrella.
    risk_limit_usd  NUMERIC(20,4) NOT NULL DEFAULT 50,
    daily_cap_usd   NUMERIC(20,4) NOT NULL DEFAULT 500,
    allowed_markets TEXT[]        NOT NULL DEFAULT ARRAY['polymarket','hyperliquid','swap']::TEXT[],

 -- Capability subset from the four pillars. Pure metadata for the UI.
    capabilities    TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],

 -- Lifecycle.
    status          TEXT          NOT NULL DEFAULT 'active',
    last_event_at   TIMESTAMPTZ,
    total_events    BIGINT        NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_status CHECK (status IN ('active', 'paused', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_connected_agents_owner_active
    ON connected_agents (owner_user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_connected_agents_api_key_hash
    ON connected_agents (api_key_hash);

-- ── Cross-link into heimdall_events ────────────────────────────────────────
-- Adding a nullable column so events from connected agents land in the same
-- stream the rest of the system already monitors. Filtering by
-- connected_agent_id is how the FE per-agent event log works.
--
-- Why ALTER TABLE instead of a separate connected_agent_events table:
-- security is the canonical event spine. Splitting external-agent events
-- into a sibling table would mean two queries on every dashboard render
-- and a gnarly UNION on the Nuro digest. Tag-on-the-existing-spine wins.
--
-- The "source" of an event ('internal' vs 'external') already lives in
-- heimdall_events.context->>'source' (free-form JSONB), so we don't add a
-- column for it — we just rely on `WHERE connected_agent_id IS NOT NULL`
-- to filter to external events.

ALTER TABLE heimdall_events
    ADD COLUMN IF NOT EXISTS connected_agent_id UUID;

CREATE INDEX IF NOT EXISTS idx_heimdall_events_connected_agent
    ON heimdall_events (connected_agent_id, occurred_at DESC)
    WHERE connected_agent_id IS NOT NULL;

-- updated_at autobump
CREATE OR REPLACE FUNCTION trg_connected_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS connected_agents_updated_at ON connected_agents;
CREATE TRIGGER connected_agents_updated_at
    BEFORE UPDATE ON connected_agents
    FOR EACH ROW
    EXECUTE FUNCTION trg_connected_agents_updated_at();

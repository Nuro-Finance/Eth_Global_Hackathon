-- ─────────────────────────────────────────────────────────────────────────────
-- 042 — Agent bus: per-topic x402-style pricing (S33 X4)
--
-- Lets operators (or future Nuro auto-pricing) attach a price to specific
-- bus topics. When a sender publishes to a priced topic:
-- 1. Sender's agent_budget_ledger gets a 'spend' row (-price USD)
-- 2. Recipient's agent_budget_ledger gets a 'refill' row (+price USD)
-- 3. The agent_messages row for the publish gets metadata.payment_id
-- pointing at the recipient's ledger row (audit trail back).
--
-- This is the "agent labor market" piece — the unique-to-AFI angle on
-- x402: bus + reputation + budget + counsel are already wired here, so
-- pricing per-topic gives us a marketplace where Nuro pays Huginn for
-- counsel, security sells threat-intel feeds, etc., all settled OFF-CHAIN
-- as ledger entries. Phase 3 (X5 self-hosted facilitator) extends this
-- to external agents via on-chain settlement; Phase 1 (this migration)
-- is the in-platform fast path.
--
-- Pricing is set + updated by operators via the new admin endpoints
-- POST /api/agent-bus/pricing. Defaults are intentionally NOT seeded
-- here — operator decides what a Huginn counsel is worth, not the
-- migration. Set the active flag false to deprecate a topic without
-- losing history.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS agent_bus_topic_pricing (
    topic               VARCHAR(64)   PRIMARY KEY,
    price_usd           NUMERIC(10,4) NOT NULL CHECK (price_usd >= 0),
 -- Who collects the payment. May be 'system' for platform-revenue
 -- topics (e.g. Nuro-audit-request goes to platform vault).
    recipient_agent_id  VARCHAR(64)   NOT NULL,
    description         TEXT,
    active              BOOLEAN       NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- For "list active topics" admin queries — partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_agent_bus_topic_pricing_active
    ON agent_bus_topic_pricing(topic) WHERE active = true;

COMMIT;

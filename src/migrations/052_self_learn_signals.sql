-- Migration 052: .self_learn signal capture foundation.
--
-- Spec: AFI/Neural Net/Claude Memory/Self-Learn Financial Neural Net Spec.md
-- ( ratified all 6 Qs on 2026-05-25 via Inbox ticket #15)
--
-- Concept ( words):
-- "We must have on all users of our platform like a .self_learn repo that
-- tracks all choices, chats etc and is them and they can get those study
-- reports of them over time (which is persistent) via us which is somewhat
-- making a neural net of their financial self."
--
-- Identity bet: every Nuro user has a private financial neural net built from
-- their own behavior. The more they use Nuro, the smarter the net gets at
-- representing them.
--
-- This migration ships the FOUNDATION:
-- user_signals Append-only event log. Every card creation, chat
-- turn, KYC milestone, balance shift, persona swap,
-- etc. lands here. The agent reads from this to give
-- personalized responses. Reports synthesize from it.
-- self_learn_reports Generated learning / risk / opportunity reports.
-- Persistent per spec. Re-readable via dashboard +
-- the user's external AI via MCP.
--
-- Spec-locked decisions reflected in schema:
-- * Q1 LLM: Claude. Stored in report rows as `model` for audit.
-- * Q2 Cadence: ask on card-creation / new-account events. Tracked via
-- report_request_prompts table (added in Phase 2; placeholder noted).
-- * Q3 Sharing: NO. No share_token column. No public-read RLS.
-- * Q4 Monetization: $5/day cap on paid tier; 1 free weekly report for
-- free tier; free users lose chat too (paid-only feature). Token usage
-- tracked here for the cap; billing aggregation in a future migration.
-- * Q6 MCP exposure: reports table is MCP-exposed via /api/mcp tool
-- `get_self_learn_reports`; user_signals is NOT MCP-exposed (raw is too
-- much surface). Enforced at the MCP tool layer, not schema.

-- ─── user_signals ───────────────────────────────────────────────────────────
-- Append-only. Every signal is a row. Never UPDATE, never DELETE (except via
-- user "wipe my data" admin action — handled by a separate DELETE policy).
--
-- signal_type is a free-text label tagged at insertion time. Conventions:
-- card.created New card provisioned (Card Triplet ceremony)
-- card.frozen User froze a card
-- card.unfrozen User unfroze a card
-- card.limit_changed Daily/monthly limit edited
-- card.persona_changed User swapped agent persona
-- card.chat_message User sent a message to a card agent
-- transaction.posted A real txn landed via issuer webhook
-- balance.shift_50pct Account balance moved >50% in either dir
-- kyc.started User clicked Verify Identity
-- kyc.completed User cleared KYC (any verified synonym)
-- reload.completed Card reload succeeded
-- withdraw.completed Card withdrawal succeeded
-- wallet.connected External wallet linked
-- plan.upgraded User upgraded subscription tier
-- plan.downgraded User downgraded subscription tier
-- (extensible — backend code uses the enum string directly, no FK)

CREATE TABLE IF NOT EXISTS user_signals (
  id            BIGSERIAL PRIMARY KEY,
  user_id       VARCHAR(64) NOT NULL,
  signal_type   VARCHAR(64) NOT NULL,
 -- Free-form JSON payload. Examples:
 -- {"card_id": "abc", "card_name": "Amazon Orders"} card.created
 -- {"card_id": "abc", "amount_usd": 25.40, "merchant": "Spotify"} transaction.posted
 -- {"old_balance": 1500, "new_balance": 100} balance.shift_50pct
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
 -- Source label: server | webhook | user_action | mcp_tool | scheduled
  source        VARCHAR(32) NOT NULL DEFAULT 'server',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_signals_user_created
  ON user_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_signals_user_type_created
  ON user_signals (user_id, signal_type, created_at DESC);

-- GIN index on payload for queries like "all signals where merchant=Spotify"
-- which the report generator wants. Cheap because user_signals stays
-- moderate-cardinality per user.
CREATE INDEX IF NOT EXISTS idx_user_signals_payload_gin
  ON user_signals USING GIN (payload);

COMMENT ON TABLE user_signals IS
  '.self_learn append-only event log. Every user action is captured here. The agent reads from this for personalized responses. Reports synthesize from it. Spec: Self-Learn Financial Neural Net Spec.md, ratified ticket #15.';

-- ─── self_learn_reports ─────────────────────────────────────────────────────
-- The 3 reports per spec words: "learning report, risk assessment
-- report, opportunity report". Each generation produces ONE row tagged with
-- which kind. User can request a fresh one on-demand OR auto-triggered on
-- card creation per Q2.

CREATE TABLE IF NOT EXISTS self_learn_reports (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             VARCHAR(64) NOT NULL,
  report_kind         VARCHAR(32) NOT NULL
                      CHECK (report_kind IN ('learning', 'risk', 'opportunity')),
  title               TEXT NOT NULL,
  body_markdown       TEXT NOT NULL,
 -- Snapshot of which signals fed this report. Lets us replay / debug the
 -- generation without recomputing from scratch. The IDs reference
 -- user_signals.id at generation time (signals are append-only so the
 -- referenced rows are immutable).
  signal_ids          BIGINT[] NOT NULL DEFAULT '{}',
  signals_count       INTEGER NOT NULL DEFAULT 0,
 -- Trigger label: 'on_demand', 'card_created', 'weekly_free_tier', 'monthly_auto'
  trigger             VARCHAR(32) NOT NULL DEFAULT 'on_demand',
 -- Anthropic accounting for the $5/day paid-tier cap.
  model               VARCHAR(64),                  -- e.g. 'claude-sonnet-4-5'
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
 -- Privacy: per spec Q3, NO sharing. No public-read flag. If we add
 -- collaboration later, that's a deliberate schema migration.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_learn_reports_user_kind_created
  ON self_learn_reports (user_id, report_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_self_learn_reports_user_created
  ON self_learn_reports (user_id, created_at DESC);

COMMENT ON TABLE self_learn_reports IS
  '.self_learn generated reports (learning / risk / opportunity). One row per generation. Persistent per spec Q3. MCP-exposed via get_self_learn_reports tool (Q6).';

-- ─── Auto-capture on card creation (Card Triplet ceremony hook) ─────────────
-- When a new cards row lands, emit a card.created signal. This is the FIRST
-- signal every user collects and seeds the .self_learn timeline. The spec Q2
-- triggers a "want a report?" prompt on this event — backend code reads
-- recent card.created signals for this hook.

CREATE OR REPLACE FUNCTION self_learn_capture_card_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_signals (user_id, signal_type, payload, source)
  VALUES (
    NEW.user_id,
    'card.created',
    jsonb_build_object(
      'card_id', NEW.id,
      'card_type', COALESCE(NEW.card_type, ''),
      'card_name', COALESCE(NEW.card_name, NEW.card_type, '')
    ),
    'server'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_self_learn_card_created ON cards;
CREATE TRIGGER trg_self_learn_card_created
  AFTER INSERT ON cards
  FOR EACH ROW
  EXECUTE FUNCTION self_learn_capture_card_created();

-- ─── Auto-capture on card_agent_messages (chat) ─────────────────────────────
-- Every chat turn is a signal. Lets the report generator see "user was
-- worried about Spotify spend last week" or "user asked about freezing this
-- card 3 times" — patterns that inform the risk report.

CREATE OR REPLACE FUNCTION self_learn_capture_chat_message()
RETURNS TRIGGER AS $$
BEGIN
 -- Only capture USER turns; assistant responses inflate the log without
 -- adding intent signal.
  IF NEW.role = 'user' THEN
    INSERT INTO user_signals (user_id, signal_type, payload, source)
    VALUES (
      NEW.user_id,
      'card.chat_message',
      jsonb_build_object(
        'card_id', NEW.card_id,
        'message_id', NEW.id,
 -- Truncate to 200 chars for the signal payload; full content stays
 -- in card_agent_messages.
        'snippet', LEFT(NEW.content, 200),
        'length', LENGTH(NEW.content)
      ),
      'user_action'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_self_learn_chat_message ON card_agent_messages;
CREATE TRIGGER trg_self_learn_chat_message
  AFTER INSERT ON card_agent_messages
  FOR EACH ROW
  EXECUTE FUNCTION self_learn_capture_chat_message();

-- ─── Auto-capture on KYC milestone ──────────────────────────────────────────
-- When users.kyc_status flips to 'approved' (canonical post-normalization),
-- emit a kyc.completed signal. The opportunity report uses this to suggest
-- next-step features that were KYC-gated.

CREATE OR REPLACE FUNCTION self_learn_capture_kyc_milestone()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.kyc_status = 'approved' AND COALESCE(OLD.kyc_status, '') <> 'approved') THEN
    INSERT INTO user_signals (user_id, signal_type, payload, source)
    VALUES (
      NEW.id,
      'kyc.completed',
      jsonb_build_object(
        'previous_status', COALESCE(OLD.kyc_status, 'unknown')
      ),
      'webhook'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_self_learn_kyc_milestone ON users;
CREATE TRIGGER trg_self_learn_kyc_milestone
  AFTER UPDATE OF kyc_status ON users
  FOR EACH ROW
  EXECUTE FUNCTION self_learn_capture_kyc_milestone();

-- ─── Backfill: seed card.created signals for existing cards ─────────────────
-- Without this, users who already had cards before this migration have a
-- blank .self_learn timeline. We backfill one card.created per existing
-- card so reports have something to chew on from day one.
INSERT INTO user_signals (user_id, signal_type, payload, source, created_at)
SELECT
  c.user_id,
  'card.created',
  jsonb_build_object(
    'card_id', c.id,
    'card_type', COALESCE(c.card_type, ''),
    'card_name', COALESCE(c.card_name, c.card_type, ''),
    'backfilled', TRUE
  ),
  'server',
  COALESCE(c.created_at, NOW())
FROM cards c
WHERE NOT EXISTS (
  SELECT 1 FROM user_signals s
  WHERE s.user_id = c.user_id
    AND s.signal_type = 'card.created'
    AND (s.payload->>'card_id')::text = c.id::text
);

-- Migration 051: per-card agent chat (a.k.a. Nuro Finance Financial text box).
-- Ratified spec at AFI/Neural Net/Claude Memory/Per-Card Agent System Spec.md
-- + Inbox ticket #15 (Richard confirmed all 5 Qs on 2026-05-25).
--
-- Schema:
--   card_agent_personas    Per-card persona config (Formal Banker / Friendly
--                          Concierge / Terse CFO). One row per card. The
--                          card_id FK ties this 1:1 with the cards table.
--   card_agent_messages    Conversation log. Persistent across sessions.
--                          Stores both user messages and agent responses.
--                          Indexed on card_id + created_at for fast paged reads.
--
-- Spec decisions reflected in schema:
--   * Q3 Voice: persistent memory across sessions. Messages persist by default.
--     User can clear via card settings (DELETE WHERE card_id = ? scoped action).
--   * Q5 Council: persona is picked per-card during Card Triplet creation.
--     Defaults set here mirror the system-prompt branches in the chat endpoint.
--   * Q4 Pricing: usage tracking lives in a separate billing table (TBD,
--     migration 052 will add token-cost accounting). For now we just log
--     prompt_tokens + completion_tokens here so a future aggregation can
--     enforce the $5/day cap without a schema change.

-- ─── card_agent_personas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_agent_personas (
  card_id           VARCHAR(64) PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  persona           VARCHAR(32) NOT NULL DEFAULT 'concierge'
                    CHECK (persona IN ('banker', 'concierge', 'cfo')),
  custom_name       VARCHAR(80),                  -- optional friendly name override
  memory_enabled    BOOLEAN NOT NULL DEFAULT TRUE, -- spec Q3 default ON
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row UPDATE.
CREATE OR REPLACE FUNCTION card_agent_personas_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_card_agent_personas_updated_at ON card_agent_personas;
CREATE TRIGGER trg_card_agent_personas_updated_at
  BEFORE UPDATE ON card_agent_personas
  FOR EACH ROW
  EXECUTE FUNCTION card_agent_personas_set_updated_at();

-- ─── card_agent_messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_agent_messages (
  id                  BIGSERIAL PRIMARY KEY,
  card_id             VARCHAR(64) NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id             VARCHAR(64) NOT NULL,    -- denormalized for fast access-control
  role                VARCHAR(16) NOT NULL
                      CHECK (role IN ('user', 'assistant', 'system')),
  content             TEXT NOT NULL,
  prompt_tokens       INTEGER,                  -- populated only on assistant rows
  completion_tokens   INTEGER,                  -- populated only on assistant rows
  model               VARCHAR(64),              -- e.g. 'claude-opus-4.7'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_agent_messages_card_created
  ON card_agent_messages (card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_agent_messages_user_created
  ON card_agent_messages (user_id, created_at DESC);

-- ─── Auto-create default persona on card creation ───────────────────────────
-- When a new row lands in cards, seed a default persona using a card_type
-- heuristic. This matches the spec's "default suggestion based on card_type"
-- pattern from Q5. User can override via PATCH /api/cards/<id>/persona later.
CREATE OR REPLACE FUNCTION card_agent_personas_seed_for_new_card()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO card_agent_personas (card_id, persona)
  VALUES (
    NEW.id,
    CASE
      -- Business card → terse CFO
      WHEN COALESCE(LOWER(NEW.card_type), '') LIKE '%business%'
        OR COALESCE(LOWER(NEW.card_type), '') LIKE '%corporate%'
        OR COALESCE(LOWER(NEW.card_type), '') LIKE '%llc%'
        OR COALESCE(LOWER(NEW.card_type), '') LIKE '%inc%'
      THEN 'cfo'
      -- Named-merchant card (Amazon Orders, Spotify, etc) → friendly concierge
      WHEN COALESCE(LOWER(NEW.card_type), '') ~ '(amazon|spotify|netflix|uber|orders|subscription|monthly)'
      THEN 'concierge'
      -- Generic personal default → formal banker
      ELSE 'banker'
    END
  )
  ON CONFLICT (card_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_card_agent_personas_seed ON cards;
CREATE TRIGGER trg_card_agent_personas_seed
  AFTER INSERT ON cards
  FOR EACH ROW
  EXECUTE FUNCTION card_agent_personas_seed_for_new_card();

-- Backfill personas for existing cards (idempotent via ON CONFLICT DO NOTHING).
INSERT INTO card_agent_personas (card_id, persona)
SELECT
  c.id,
  CASE
    WHEN COALESCE(LOWER(c.card_type), '') LIKE '%business%'
      OR COALESCE(LOWER(c.card_type), '') LIKE '%corporate%'
      OR COALESCE(LOWER(c.card_type), '') LIKE '%llc%'
      OR COALESCE(LOWER(c.card_type), '') LIKE '%inc%'
    THEN 'cfo'
    WHEN COALESCE(LOWER(c.card_type), '') ~ '(amazon|spotify|netflix|uber|orders|subscription|monthly)'
    THEN 'concierge'
    ELSE 'banker'
  END AS persona
FROM cards c
ON CONFLICT (card_id) DO NOTHING;

-- ─── Comments for future debugging ──────────────────────────────────────────
COMMENT ON TABLE card_agent_personas IS
  'Per-card-agent persona config. One row per card. Created automatically by trigger on cards INSERT. Spec: AFI/Neural Net/Claude Memory/Per-Card Agent System Spec.md';

COMMENT ON TABLE card_agent_messages IS
  'Per-card conversational log. Persistent across sessions per spec Q3. User can clear all messages for a card via card settings. Token usage tracked for the $5/day global cap (spec Q4).';

COMMENT ON COLUMN card_agent_personas.persona IS
  'banker = Formal Banker (default for generic personal cards). concierge = Friendly Concierge (named-merchant cards). cfo = Terse CFO (business cards). Picked during Card Triplet creation per spec Q5.';

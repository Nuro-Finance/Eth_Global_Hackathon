-- ============================================================================
-- 050_nuro_mcp_keys.sql
-- ============================================================================
-- Nuro MCP (Model Context Protocol) API keys.
--
-- Each row is one user-generated API key that authenticates an external AI
-- client (Claude Desktop, Claude Code, Cursor, ChatGPT custom GPT, etc.) to
-- call Nuro's MCP server endpoints.
--
-- The raw key is shown to the user ONCE at generation and only its SHA-256
-- hash is stored. Key format: `nuro_mcp_<32-char-hex>` — the prefix lets us
-- show a friendly label ("nuro_mcp_a3f9…") in the dashboard list view
-- without revealing the secret.
--
-- BYOK pattern ( 2026-05-25 epiphany): users plug Nuro MCP into
-- their own AI agent. Their agent talks to ours via these tools, scoped
-- strictly to the user's own data via the bearer-token → user_id resolution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nuro_mcp_keys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash       TEXT NOT NULL UNIQUE,           -- SHA-256 of the raw key
  key_prefix     TEXT NOT NULL,                  -- first 8 chars of raw key after "nuro_mcp_"
  name           TEXT NOT NULL DEFAULT 'Default Key',
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ,
  scopes         TEXT[] NOT NULL DEFAULT ARRAY['read', 'write']::TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_nuro_mcp_keys_user ON nuro_mcp_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_nuro_mcp_keys_hash ON nuro_mcp_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nuro_mcp_keys_active ON nuro_mcp_keys(user_id, revoked_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- Write-confirmation tokens for destructive MCP tools.
-- ============================================================================
-- Tools like set_card_limit + freeze_card are gated behind a two-call dance:
-- 1. First call → returns { requires_confirmation, confirmation_code, expires_in_seconds }
-- 2. User confirms with their AI → AI calls again with confirmation_code
-- 3. Server verifies code matches + not expired + not yet used, then fires
--
-- This is the prompt-injection defense layer. A malicious page can't trick a
-- user's AI into freezing their card by just sending one tool call — the AI
-- has to surface the confirmation_code to the user and the user must
-- explicitly say "yes confirm with code 7842" back in their AI chat.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nuro_mcp_write_confirmations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_key_id        UUID NOT NULL REFERENCES nuro_mcp_keys(id) ON DELETE CASCADE,
  user_id           VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name         TEXT NOT NULL,
  tool_args         JSONB NOT NULL,
  confirmation_code TEXT NOT NULL,                 -- 6-digit numeric, shown to user via AI
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,          -- now() + 5 minutes
  used_at           TIMESTAMPTZ,                   -- set when confirmation is consumed
  result            JSONB                          -- stored after successful exec for audit
);

CREATE INDEX IF NOT EXISTS idx_mcp_confirms_user ON nuro_mcp_write_confirmations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_confirms_code_active ON nuro_mcp_write_confirmations(confirmation_code) WHERE used_at IS NULL;

-- Cleanup job recommendation: DELETE FROM nuro_mcp_write_confirmations WHERE expires_at < now - interval '1 day';

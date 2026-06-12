-- Migration 053: per-message tool-use trace on card_agent_messages.
-- Part of Marathon 12 Day 2 (Trust + Execution Sprint, 2026-05-29).
--
-- Triggered by the trust-signal pill UX added in Day 2 batch 1: when an
-- assistant turn invokes a tool (freeze_card, get_balance, etc.) the chat
-- renders a "✓ Froze the card" chip under the bubble. Without persisting
-- the tool names per-message, the chip only shows on FRESH messages this
-- session — closing the chat and reopening loses the receipt.
--
-- Fix: add a tools_fired text[] column to card_agent_messages so the names
-- persist across history reload. Chat handler writes the array; GET
-- /api/cards/:id/messages includes it; chat UI rehydrates the pill.
--
-- Agent Smith (workstream C, week-of-Jun-2) will ALSO use this column —
-- cross-referencing the agent's text content against the actual tools
-- invoked on that turn is the core lie-detection signal. Promise-without-
-- tool-call = severity:drift violation. The schema gates Smith's work.

ALTER TABLE card_agent_messages
  ADD COLUMN IF NOT EXISTS tools_fired TEXT[] DEFAULT NULL;

COMMENT ON COLUMN card_agent_messages.tools_fired IS
  'Array of tool names the assistant invoked on this turn (M12 Day 2 / 2026-05-29). NULL or empty array = no tools fired (vanilla reply). Populated only on role=assistant rows. Used by the chat UI trust-signal pill AND by Agent Smith (workstream C) to detect promise-without-tool-call lying behavior.';

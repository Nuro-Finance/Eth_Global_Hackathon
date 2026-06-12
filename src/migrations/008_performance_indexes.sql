-- ─── PERFORMANCE INDEXES ───────────────────────────────────────────────────
-- Added 2026-04-11 — fixes DB slowdown from growth_agent_memory + execution_log bloat
-- Run on VPS: psql nuro < src/migrations/008_performance_indexes.sql

-- execution_log: queried constantly by admin console (entity_type + created_at + status)
CREATE INDEX IF NOT EXISTS idx_execution_log_entity_created
  ON execution_log (entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_log_status_created
  ON execution_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_log_created
  ON execution_log (created_at DESC);

-- growth_agent_memory: queried by key prefix (LIKE 'pending_post_%') and category
CREATE INDEX IF NOT EXISTS idx_growth_agent_memory_key
  ON growth_agent_memory (key);
CREATE INDEX IF NOT EXISTS idx_growth_agent_memory_category
  ON growth_agent_memory (category);
CREATE INDEX IF NOT EXISTS idx_growth_agent_memory_updated
  ON growth_agent_memory (updated_at DESC);

-- growth_agent_posts: queried by posted_at DESC for admin console
CREATE INDEX IF NOT EXISTS idx_growth_agent_posts_posted
  ON growth_agent_posts (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_agent_posts_platform
  ON growth_agent_posts (platform);

-- market_feed_cache: queried every 60s for crypto prices, movers, etc.
CREATE INDEX IF NOT EXISTS idx_market_feed_cache_source_synced
  ON market_feed_cache (feed_source, last_synced_at DESC);

-- card_transactions: queried every 60s by execution-dispatch
CREATE INDEX IF NOT EXISTS idx_card_transactions_status
  ON card_transactions (status);

-- market_positions: queried every 60s for pending + won
CREATE INDEX IF NOT EXISTS idx_market_positions_status
  ON market_positions (status);

-- Cleanup stale data (one-time) — remove execution_log older than 30 days
DELETE FROM execution_log WHERE created_at < now() - interval '30 days';

-- Cleanup old approval entries from growth_agent_memory
DELETE FROM growth_agent_memory
WHERE key LIKE 'pending_post_%' AND category = 'approval'
AND updated_at < now() - interval '7 days';

-- VACUUM to reclaim space after deletes
VACUUM ANALYZE execution_log;
VACUUM ANALYZE growth_agent_memory;
VACUUM ANALYZE market_feed_cache;

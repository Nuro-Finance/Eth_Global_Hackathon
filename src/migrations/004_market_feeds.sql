-- ─── MARKET FEEDS: DB Schema ─────────────────────────────────────────────────
-- Run: psql postgresql://nuro:nuro@localhost:5432/nuro < src/migrations/004_market_feeds.sql

-- 1. market_feed_cache — stores latest prices/events from external feeds
CREATE TABLE IF NOT EXISTS market_feed_cache (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    feed_source     VARCHAR(30) NOT NULL,    -- coingecko | sports | polymarket | news
    external_id     VARCHAR(100) NOT NULL,   -- coin ID, event ID, etc.
    symbol          VARCHAR(20),             -- BTC, ETH, NBA, etc.
    name            VARCHAR(255),            -- Bitcoin, Lakers vs Celtics, etc.
    price_usd       NUMERIC(20,6),           -- current price (for crypto)
    price_change_24h NUMERIC(10,2),          -- % change (for crypto)
    volume_24h      NUMERIC(20,2),           -- 24h volume
    metadata        JSONB,                   -- full payload from API
    last_synced_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(feed_source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_cache_source ON market_feed_cache(feed_source);
CREATE INDEX IF NOT EXISTS idx_feed_cache_symbol ON market_feed_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_feed_cache_synced ON market_feed_cache(last_synced_at DESC);

-- 2. markets: add polymarket_id for dedup + resolution_source for oracle routing
ALTER TABLE markets ADD COLUMN IF NOT EXISTS polymarket_id VARCHAR(200);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolution_source VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_polymarket_id ON markets(polymarket_id) WHERE polymarket_id IS NOT NULL;

-- 3. market_price_history — for price charts per market
CREATE TABLE IF NOT EXISTS market_price_history (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    market_id   UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    yes_price   NUMERIC(5,3) NOT NULL,   -- 0.000 to 1.000
    no_price    NUMERIC(5,3) NOT NULL,
    volume      NUMERIC(20,2) DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_market ON market_price_history(market_id, recorded_at DESC);

-- Done
SELECT 'Migration 004_market_feeds complete' as result;

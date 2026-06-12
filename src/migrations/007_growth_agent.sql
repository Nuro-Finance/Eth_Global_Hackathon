-- ─── GROWTH AGENT: Memory + Post Tracking ────────────────────────────────────
-- Run: psql postgresql://nuro:nuro@localhost:5432/nuro < src/migrations/007_growth_agent.sql

-- Agent memory — stores learned insights, performance data, audience patterns
CREATE TABLE IF NOT EXISTS growth_agent_memory (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       JSONB NOT NULL,
    category    VARCHAR(30) NOT NULL,   -- performance | audience | schedule | conversations | trends
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Post tracking — every post the agent publishes across all platforms
CREATE TABLE IF NOT EXISTS growth_agent_posts (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    platform        VARCHAR(20) NOT NULL,   -- moltbook | twitter | telegram | tiktok | youtube
    post_id         VARCHAR(200),           -- platform-specific post ID
    post_url        VARCHAR(500),           -- link to the post
    content         TEXT NOT NULL,           -- what was posted
    content_type    VARCHAR(30),            -- alert | prediction | educational | resolution | sports
    hashtags        TEXT[],                 -- array of hashtags used
    engagement      JSONB,                 -- { views, likes, shares, clicks, signups }
    posted_at       TIMESTAMPTZ DEFAULT now(),
    reviewed        BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_agent_posts_platform ON growth_agent_posts(platform);
CREATE INDEX IF NOT EXISTS idx_agent_posts_posted ON growth_agent_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON growth_agent_memory(category);

SELECT 'Migration 007_growth_agent complete' as result;

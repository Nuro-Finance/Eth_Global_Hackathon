-- Migration 024: post_engagement time-series tracking (Session 23 Thread C1)
-- Created: 2026-04-18
--
-- Why this table exists:
-- Nuro growth-agent posts content to moltbook / twitter / telegram every
-- day, but we never closed the feedback loop — there was no reward signal
-- from actual engagement (likes, retweets, replies, clicks, impressions).
-- The agent "learned" only by accumulating content in its knowledge base;
-- it had no way to weight formats/tones/topics by what actually landed.
--
-- This table is the ingestion target. A cron fetches metrics hourly from
-- each platform's API, inserts a new snapshot row per post, and the
-- learning engine (Session 24 scope) reads the latest snapshot per post
-- to compute performance percentiles.
--
-- Design:
-- - Time-series: every sample creates a new row, so we can see
-- engagement grow/flatten over time post-publish.
-- - Cheap to query: indexed on (post_uuid, sampled_at DESC) for
-- "latest metrics per post" and (platform, sampled_at DESC) for
-- "trending posts this week".
-- - Denormalized category/tone/format alongside metrics — avoids a
-- join with growth_agent_posts on hot queries.

CREATE TABLE IF NOT EXISTS post_engagement (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 -- Link back to growth_agent_posts.id (the canonical published record).
 -- Nullable because not every platform returns a UUID we recorded; in
 -- those cases we still track via (platform, external_post_id).
    post_uuid          UUID,
    platform           VARCHAR(32) NOT NULL,   -- 'moltbook', 'twitter', 'telegram', etc.
    external_post_id   VARCHAR(200),           -- platform-side id (tweet id, message id)
 -- Denormalized metadata — snapshotted at post time so later reads don't
 -- have to join growth_agent_posts (which may not have these fields yet).
    category           VARCHAR(64),            -- 'crypto', 'market_alert', etc.
    tone               VARCHAR(64),            -- 'analytical', 'enthusiastic', etc.
    post_format        VARCHAR(64),            -- 'price_alert', 'commentary', 'thread'
 -- Engagement metrics (all default 0 — unmeasured is distinct from zero
 -- only via "no row exists at all", enforced by the NOT NULL sampled_at).
    likes              INTEGER NOT NULL DEFAULT 0,
    retweets           INTEGER NOT NULL DEFAULT 0,
    replies            INTEGER NOT NULL DEFAULT 0,
    impressions        INTEGER NOT NULL DEFAULT 0,
    clicks             INTEGER NOT NULL DEFAULT 0,
 -- Derived: (likes + retweets + replies) / max(impressions, 1).
 -- Computed at insert time by the sampler (not a generated column
 -- because we may want to tweak the formula without a schema change).
    engagement_rate    NUMERIC(8, 4),
 -- When this metrics snapshot was taken. posted_at is on growth_agent_posts.
    sampled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_engagement_post_sampled
    ON post_engagement(post_uuid, sampled_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_engagement_platform_sampled
    ON post_engagement(platform, sampled_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_engagement_external
    ON post_engagement(platform, external_post_id);

-- Seed: record the creation. Every future cron insert adds one row per post per sample.

INSERT INTO schema_migrations (version, filename, notes) VALUES
  ('024', '024_post_engagement_tracking.sql', 'Session 23 Thread C1 — time-series engagement metrics for agent posts. Learning-loop reward signal lands here.')
ON CONFLICT (version) DO NOTHING;

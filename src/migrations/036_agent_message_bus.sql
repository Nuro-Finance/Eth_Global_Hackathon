-- ─────────────────────────────────────────────────────────────────────────────
-- 036 — Inter-agent message bus (signed envelopes)
--
-- S31 H2. Per Mythos design + Richard's "OH HELL YES" priority bump. Lays
-- the foundation for agent-to-agent coordination without human mediation.
--
-- Architectural choices:
--   - Postgres-backed (no Redis) — the existing infra. LISTEN/NOTIFY for
--     real-time delivery; the table itself is the durable record.
--   - Signed envelopes mandatory (HEIM-008): every message has signature +
--     signature_alg + sender_key_id. Heimdall verifies before delivery.
--   - HMAC-SHA256 in v1 (symmetric); ed25519 layered in Phase 1 alongside
--     the credential vault. v1 keys + v2 keys can coexist via signature_alg
--     so we don't break in-flight messages during the migration.
--   - Per-agent key rotation: agent_keys.prev_hmac_key carries the previous
--     key for a configurable grace window so messages signed with the old
--     key still verify during rotation.
--   - Append-only: messages are NEVER updated except for delivered_at /
--     read_at flags. Forensic replay is the point.
--   - TTL: optional; if a message hasn't been delivered+read by ttl, the
--     reaper sweeps it.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS agent_keys (
    -- Stable agent identifier — VARCHAR to match agents.id (which is VARCHAR
    -- on prod, verified via information_schema).
    agent_id              VARCHAR(128) PRIMARY KEY,
    -- v1 symmetric key for HMAC-SHA256 envelopes. Encrypted at rest with
    -- AGENT_BUS_MASTER_KEY (env). Rotation overwrites this column; prev
    -- migrates to prev_hmac_key for the grace window.
    hmac_key_enc          BYTEA NOT NULL,
    -- Previous key during rotation grace window. Null when rotation has
    -- aged out (24h grace by default).
    prev_hmac_key_enc     BYTEA,
    prev_key_expires_at   TIMESTAMPTZ,
    -- v2 ed25519 public key (PEM-encoded). Null until per-agent key
    -- generation lands in Marathon 8 Phase 1.
    public_key_pem        TEXT,
    -- Key versioning: bumps on rotation. Senders include this on each
    -- envelope so verifiers know which key to use.
    key_version           INTEGER NOT NULL DEFAULT 1,
    rotated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_messages (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_agent_id       VARCHAR(128) NOT NULL,
    -- Null = broadcast to a topic. Subscribers filter by topic.
    recipient_agent_id    VARCHAR(128),
    topic                 VARCHAR(128) NOT NULL,
    payload               JSONB NOT NULL,
    -- Signature primitives. signature is the hex-encoded HMAC or ed25519
    -- signature; signature_alg distinguishes algorithm; sender_key_version
    -- ties to agent_keys.key_version for verification.
    signature             TEXT NOT NULL,
    signature_alg         VARCHAR(32) NOT NULL DEFAULT 'hmac-sha256',
    sender_key_version    INTEGER NOT NULL DEFAULT 1,
    -- Threaded conversations: replies set this to the parent message id.
    -- NOT a hard FK so we can delete root messages without cascade
    -- complications during forensic cleanup.
    reply_to              UUID,
    -- Optional TTL: NULL = persists indefinitely.
    ttl_seconds           INTEGER,
    sent_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Set when the bus delivers via LISTEN/NOTIFY OR when read() polls.
    delivered_at          TIMESTAMPTZ,
    -- Set when the recipient (agent or human consumer) explicitly acks.
    read_at               TIMESTAMPTZ,
    -- Verification result captured at delivery time. NULL = not yet
    -- verified (very fresh row); TRUE = good sig; FALSE = bad sig (also
    -- fires HEIM-308 / HEIM-008 events).
    signature_verified    BOOLEAN
);

-- Topic subscribers. Lets agents declare what they care about; the bus
-- only NOTIFY-es agents who are subscribed to the topic. Subscriptions
-- are stable across restarts (DB-backed) so an agent that boots after a
-- message was sent still sees it on next read().
CREATE TABLE IF NOT EXISTS agent_subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id              VARCHAR(128) NOT NULL,
    -- Topic pattern. Exact-match for v1; future expansion can support
    -- glob ('lz-*') or regex via a separate column.
    topic                 VARCHAR(128) NOT NULL,
    -- Optional filter: if set, only deliver messages where the payload
    -- jsonpath produces a non-null result. Null = no filter.
    payload_jsonpath      TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_recipient_undelivered
    ON agent_messages(recipient_agent_id, sent_at DESC)
    WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_topic_recent
    ON agent_messages(topic, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_unread_per_recipient
    ON agent_messages(recipient_agent_id, read_at, sent_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_reply_to
    ON agent_messages(reply_to)
    WHERE reply_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_subscriptions_topic
    ON agent_subscriptions(topic);

-- Bus-level metrics view. Lets the admin UI show throughput.
CREATE OR REPLACE VIEW agent_bus_recent_stats AS
SELECT
    COUNT(*) FILTER (WHERE sent_at >= now() - interval '1 hour') AS sent_1h,
    COUNT(*) FILTER (WHERE sent_at >= now() - interval '24 hours') AS sent_24h,
    COUNT(*) FILTER (WHERE signature_verified = false) AS bad_sigs_total,
    COUNT(*) FILTER (WHERE signature_verified = false
                     AND sent_at >= now() - interval '24 hours') AS bad_sigs_24h,
    COUNT(DISTINCT topic) FILTER (WHERE sent_at >= now() - interval '24 hours') AS topics_24h,
    COUNT(DISTINCT sender_agent_id) FILTER (WHERE sent_at >= now() - interval '24 hours') AS senders_24h
FROM agent_messages;

COMMIT;

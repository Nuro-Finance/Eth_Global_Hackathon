-- ─────────────────────────────────────────────────────────────────────────────
-- 040 — Sandbox sessions (S32 Phase 1.2+: safe-to-fail mainnet-fork harness)
--
-- Per Sandbox Design v2 (Neural Net/Claude Memory/Sandbox Design.md).
-- Each row tracks a live or recently-torn-down sandbox session: an Anvil
-- fork process + a Postgres scratch schema + per-session pinned clock /
-- prices.
--
-- Why persist instead of in-memory only: middleware crash + restart would
-- leak Anvil child processes and orphan scratch schemas. On boot, the
-- orchestrator scans this table for status='ready' rows whose PIDs are
-- dead and reaps them. Hard-stop teardown writes 'torn_down' so reconciliation
-- knows the row is already done.
--
-- Hard-cap enforcement: SELECT COUNT(*) WHERE status IN ('spawning','ready')
-- runs before every spawn — at 10 active rows we 429 the spawn caller.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS sandbox_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Lifecycle: spawning → ready → torn_down (or → errored on spawn fail).
    -- Cleanup cron only acts on 'ready' rows; 'torn_down' is terminal.
    status             VARCHAR(16) NOT NULL DEFAULT 'spawning'
                       CHECK (status IN ('spawning','ready','torn_down','errored')),
    -- Operator who spawned the session. 'admin' / 'mythos' / agent_id.
    -- Useful for audit + per-operator quotas (future).
    created_by         VARCHAR(64) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Hard expiry. Cleanup cron tears down any 'ready' session past this.
    -- Default 4h via app code; overridable per-spawn via ttlSeconds.
    expires_at         TIMESTAMPTZ NOT NULL,
    -- Idle TTL — when last_active_at is older than ttl_idle_seconds, the
    -- session is treated as abandoned and torn down even if expires_at
    -- hasn't hit. Default 50% of TTL.
    last_active_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ttl_idle_seconds   INTEGER NOT NULL DEFAULT 7200,
    -- Anvil fork process — port + PID for orchestrator to manage.
    -- pid IS NULL during 'spawning'; populated on 'ready'.
    anvil_port         INTEGER,
    anvil_pid          INTEGER,
    -- Fork target — defaults Base mainnet at latest block.
    fork_chain_id      INTEGER NOT NULL DEFAULT 8453,
    fork_block         BIGINT,  -- NULL = latest block at spawn time
    -- DB scratch schema name. Always 'sandbox_<id-without-dashes>' to keep
    -- naming predictable for ops debugging.
    db_schema_name     VARCHAR(80) NOT NULL,
    -- Pinned wall-clock time (ms since epoch). NULL = use real Date.now().
    -- Advance via POST /api/sandbox/:id/advance.
    pinned_time_ms     BIGINT,
    -- Pinned native-token prices, stored as { coinId: usdPrice }. NULL or
    -- empty {} means defer to live nativeUsdPrice() cache.
    pinned_prices      JSONB DEFAULT '{}'::jsonb,
    -- Free-form note from the operator at spawn time. Helps "which sandbox
    -- was the deposit-flow test in?" forensics.
    note               TEXT,
    -- Set to the diagnostic message on 'errored' status (spawn failed,
    -- anvil bin missing, port collision, etc.). NULL otherwise.
    error_message      TEXT,
    -- When status flipped to 'torn_down'. NULL while alive.
    torn_down_at       TIMESTAMPTZ
);

-- Active-session lookups (cron sweep, hard-cap check, list endpoint).
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_active
    ON sandbox_sessions(status, expires_at)
    WHERE status IN ('spawning','ready');

-- Operator's session list — recent across statuses.
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_creator
    ON sandbox_sessions(created_by, created_at DESC);

-- Anvil port allocation — fast lookup of "which ports are in use right now"
-- for the port-picker. Partial because torn_down rows shouldn't gate
-- new ports.
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_port
    ON sandbox_sessions(anvil_port)
    WHERE status IN ('spawning','ready') AND anvil_port IS NOT NULL;

COMMIT;

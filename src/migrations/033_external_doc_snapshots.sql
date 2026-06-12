-- ─────────────────────────────────────────────────────────────────────────────
-- 033 — external doc snapshots for daily LZ + CCTP scanner crons
--
-- Stores the latest fetched copy of each external policy/doc URL we care
-- about (LayerZero hardening checklist, DVN registry, Circle CCTP supported-
-- chains, attestation-API spec, etc.). The scanner cron compares each new
-- fetch against the previous snapshot for the same source+url; on diff,
-- writes a new row, fires a Telegram alert, AND drops a markdown file into
-- Neural Net via heimdallGuardedWrite (HEIM-201 path) for human review.
--
-- Thinking: doc drift = silent breakage. Kelp showed how a quiet hardening
-- recommendation in upstream LZ docs, missed by us, would have been the
-- difference between "we patched on day 0" and "we lost reserves." This
-- table is the audit log for "what did the upstream say last week vs.
-- today, and did we react?"
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS external_doc_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       VARCHAR(64) NOT NULL,        -- 'layerzero', 'circle-cctp'
    url             TEXT NOT NULL,
    content_hash    VARCHAR(64) NOT NULL,        -- sha256 of normalized content
    content         TEXT NOT NULL,               -- normalized text (no whitespace noise)
    content_bytes   INTEGER NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
 -- Diff from immediately-previous snapshot for this (source_id, url).
 -- Null on first-ever fetch. Stored unified-diff style for human review.
    diff_from_prev  TEXT,
 -- Severity is set by the scanner's classify heuristic. Drives alert
 -- routing (breaking → admin Telegram immediately, notable → daily digest,
 -- cosmetic → recorded but no alert).
    severity        VARCHAR(16) NOT NULL DEFAULT 'cosmetic',
 -- True once a Telegram alert was fired for this row. Lets us re-run the
 -- scanner safely without re-alerting the same change.
    alerted         BOOLEAN NOT NULL DEFAULT false,
 -- HTTP fetch metadata (so we can debug a "scanner stopped working" outage)
    http_status     INTEGER,
    fetch_error     TEXT,
 -- Notes from the scanner — e.g. "DVN list shrunk from 12 → 11", or the
 -- pattern that classify matched.
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_external_doc_snapshots_source_url
    ON external_doc_snapshots(source_id, url, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_doc_snapshots_severity_alerted
    ON external_doc_snapshots(severity, alerted)
    WHERE severity IN ('breaking', 'notable') AND alerted = false;

CREATE INDEX IF NOT EXISTS idx_external_doc_snapshots_fetched_at
    ON external_doc_snapshots(fetched_at DESC);

-- Convenience view: latest snapshot per (source, url).
CREATE OR REPLACE VIEW external_doc_latest AS
SELECT DISTINCT ON (source_id, url)
    id,
    source_id,
    url,
    content_hash,
    content_bytes,
    severity,
    alerted,
    fetched_at,
    notes
FROM external_doc_snapshots
ORDER BY source_id, url, fetched_at DESC;

COMMIT;

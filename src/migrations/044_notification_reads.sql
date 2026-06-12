-- Migration 044 — notification_reads tracker
--
-- Synthetic notification rows in GET /notifications come from event-source
-- tables (heimdall_events, card_alerts, card_settlements). Pre-044 those
-- rows had no read-state persistence — calling PATCH /notifications/:id/read
-- on them returned 404, and they reappeared on every fetch until
-- acknowledged at the source. Acceptable MVP behavior, not acceptable now.
--
-- This table tracks per-user (read, dismissed) state for ANY notification
-- key — both source UUIDs (synthetic rows from heimdall_events.id etc.)
-- AND ids that happen to live in the manual `notifications` table.
--
-- Storage cost: ~80 bytes per row, dismissed rows can be GC'd after ~30d
-- since synthetic rows naturally fall off the 14-30d query windows.
--
-- Composite PK on (user_id, notification_key) — same user reading the same
-- event twice is a no-op upsert. notification_key is TEXT (not UUID) so it
-- can hold prefixed synthetic ids in the future if we go that route.

CREATE TABLE IF NOT EXISTS notification_reads (
    user_id          UUID         NOT NULL,
    notification_key TEXT         NOT NULL,
    read_at          TIMESTAMPTZ,
    dismissed_at     TIMESTAMPTZ,
    PRIMARY KEY (user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_dismissed
    ON notification_reads (user_id, dismissed_at)
    WHERE dismissed_at IS NOT NULL;

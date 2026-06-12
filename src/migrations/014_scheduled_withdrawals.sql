-- Migration 014: Scheduled withdrawals support
-- Session 20 — Sprint 2.6 Scheduled Transfers & Withdrawals dispatcher

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_withdrawals_scheduled ON withdrawals(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_transfers_scheduled ON transfers(scheduled_at) WHERE status = 'scheduled';

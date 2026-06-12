-- Migration 015: Security Hardening — account lockout + webhook signatures
-- Session 20 — Sprint 4.1

-- Account lockout tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- Webhook signature verification log (HMAC-SHA256 verification trail)
CREATE TABLE IF NOT EXISTS webhook_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_source VARCHAR(50) NOT NULL,    -- 'issuer', 'circle', 'polymarket'
  endpoint VARCHAR(200) NOT NULL,
  signature_provided TEXT,
  signature_verified BOOLEAN NOT NULL,
  request_body_hash TEXT,
  source_ip VARCHAR(45),
  received_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_verifications_source ON webhook_verifications(webhook_source, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_verifications_failed ON webhook_verifications(signature_verified, received_at DESC) WHERE signature_verified = false;

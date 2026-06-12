-- Migration 049 — email verification (OTP) for signup + unverified login
--
-- Day-7 demo-critical fix: existing /auth/register issued a JWT immediately
-- with no email verification step. Add `email_verified` to users and a
-- per-email OTP store. Existing users are grandfathered to verified=TRUE
-- so this change doesn't break already-authenticated sessions.
--
-- Applied: 2026-05-11 (T-3 days to capital event).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Grandfather every account that existed before this migration.
-- New accounts created via /auth/register will be inserted with the column
-- default (FALSE) and only flip to TRUE after the user enters a valid OTP.
UPDATE users
   SET email_verified = TRUE
 WHERE email_verified = FALSE;

CREATE TABLE IF NOT EXISTS email_otps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  code        TEXT        NOT NULL,                   -- 6-digit string
  purpose     TEXT        NOT NULL DEFAULT 'signup',  -- 'signup' | 'login' | 'recovery'
  attempts    INTEGER     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup of the most-recent unconsumed code for a given email+purpose.
CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose
  ON email_otps(email, purpose, consumed_at, created_at DESC);

-- Lets a janitor job sweep expired rows.
CREATE INDEX IF NOT EXISTS idx_email_otps_expires
  ON email_otps(expires_at);

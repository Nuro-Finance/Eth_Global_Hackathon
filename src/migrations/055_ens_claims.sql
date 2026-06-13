-- Migration 055 — ENS business + agent subdomain claims (PG source of truth)
--
-- Stores off-chain ENS identity claims before D1/CCIP sync.
-- user_id is intentionally not FK'd: design-mode uses demo-user without a users row.

CREATE TABLE IF NOT EXISTS ens_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR(36) NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('business', 'agent')),
  slug            TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  parent_domain   TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  address         VARCHAR(42) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ens_claims_full_name_unique UNIQUE (full_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ens_claims_one_business_per_user
  ON ens_claims (user_id)
  WHERE kind = 'business';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ens_claims_user_agent_slug
  ON ens_claims (user_id, slug)
  WHERE kind = 'agent';

CREATE INDEX IF NOT EXISTS idx_ens_claims_user_id
  ON ens_claims (user_id);

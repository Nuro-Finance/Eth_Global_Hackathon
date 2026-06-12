-- 000_bootstrap_core.sql — base tables that predate numbered migrations (local + fresh deploy).
-- Safe to re-run: CREATE TABLE IF NOT EXISTS only.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email               VARCHAR(255) UNIQUE,
  name                VARCHAR(255),
  password_hash       VARCHAR(255),
  issuer_user_id      TEXT,
  kyc_status          VARCHAR(50) DEFAULT 'pending',
  phone               VARCHAR(50),
  notification_prefs  JSONB DEFAULT '{"transactions":true,"security":true,"promotions":false,"weeklyReport":true}',
  payout_destination  VARCHAR(255),
  solana_deposit_address VARCHAR(255),
  stripe_customer_id  VARCHAR(255),
  email_verified      BOOLEAN DEFAULT FALSE,
  onft_tier           VARCHAR(20) DEFAULT 'default',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
  card_number     VARCHAR(19),
  card_holder     VARCHAR(255),
  expiry_date     VARCHAR(7),
  card_type       VARCHAR(50) DEFAULT 'VIRA',
  card_name       VARCHAR(255),
  gradient        TEXT,
  balance         NUMERIC(18,2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  is_locked       BOOLEAN DEFAULT FALSE,
  is_frozen       BOOLEAN DEFAULT FALSE,
  status          VARCHAR(50),
  issuer_card_id  VARCHAR(100),
  last_4          VARCHAR(4),
  balance_synced_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                    VARCHAR(100) PRIMARY KEY,
  user_id               VARCHAR(100),
  user_wallet           VARCHAR(100),
  base_deposit_address  VARCHAR(100),
  source_chain          INTEGER,
  dest_chain            INTEGER,
  token                 VARCHAR(20),
  amount                NUMERIC(18,6),
  fee                   NUMERIC(18,6),
  forwarded             NUMERIC(18,6),
  route                 VARCHAR(50),
  tx_hash               VARCHAR(100),
  source_tx_hash        VARCHAR(100),
  status                VARCHAR(20),
  timestamp             BIGINT,
  transaction_type      VARCHAR(30),
  confirmed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS card_transactions (
  id                    VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  card_id               VARCHAR(36),
  user_id               VARCHAR(36),
  name                  VARCHAR(255),
  type                  VARCHAR(50),
  amount                NUMERIC(18,2),
  category              VARCHAR(50),
  status                VARCHAR(50),
  merchant              VARCHAR(255),
  merchant_category_raw VARCHAR(100),
  mcc                   VARCHAR(20),
  transaction_type      VARCHAR(30),
  fee_amount            NUMERIC(12,4) DEFAULT 0,
  fee_tier              VARCHAR(20) DEFAULT 'default',
  execution_tx_hash     VARCHAR(100),
  date                  TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfers (
  id                  VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sender_user_id      VARCHAR(36),
  sender_card_id      VARCHAR(36),
  recipient_user_id   VARCHAR(36),
  recipient_name      VARCHAR(255),
  recipient_email     VARCHAR(255),
  recipient_account   VARCHAR(255),
  amount              NUMERIC(18,2),
  currency            VARCHAR(10) DEFAULT 'USD',
  description         TEXT,
  destination         VARCHAR(50),
  transfer_type       VARCHAR(20) DEFAULT 'p2p',
  status              VARCHAR(50),
  execution_tx_hash   VARCHAR(100),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
  card_id             VARCHAR(36),
  destination_address VARCHAR(100) NOT NULL,
  amount              NUMERIC(18,6) NOT NULL,
  token               VARCHAR(20) DEFAULT 'USDC',
  status              VARCHAR(30) DEFAULT 'pending',
  tx_hash             VARCHAR(100),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS markets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question              TEXT NOT NULL,
  description           TEXT DEFAULT '',
  category              VARCHAR(50) DEFAULT 'general',
  resolution_source     TEXT DEFAULT '',
  resolution_date       TIMESTAMPTZ,
  image_url             TEXT,
  creator_id            VARCHAR(36),
  escrow_address        VARCHAR(42),
  escrow_tx_hash        VARCHAR(100),
  creator_stake         NUMERIC(18,2) DEFAULT 0,
  creator_stake_tx_hash VARCHAR(100),
  yes_pool              NUMERIC(18,6) DEFAULT 0,
  no_pool               NUMERIC(18,6) DEFAULT 0,
  total_volume          NUMERIC(18,6) DEFAULT 0,
  status                VARCHAR(30) DEFAULT 'open',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_positions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id           UUID REFERENCES markets(id) ON DELETE CASCADE,
  user_id             VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
  side                VARCHAR(10),
  shares              NUMERIC(18,6) DEFAULT 0,
  cost_basis          NUMERIC(18,6) DEFAULT 0,
  source_chain        INTEGER DEFAULT 8453,
  status              VARCHAR(30) DEFAULT 'pending',
  execution_tx_hash   VARCHAR(100),
  payout_tx_hash      VARCHAR(100),
  executed_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  pnl                 NUMERIC(18,6),
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id                 INTEGER REFERENCES plans(id),
  status                  VARCHAR(30) DEFAULT 'inactive',
  stripe_subscription_id  VARCHAR(255),
  started_at              TIMESTAMPTZ,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  message     TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plans (name, price, is_active)
SELECT 'Free', 0, TRUE
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Free');

SELECT 'Migration 000_bootstrap_core complete' AS result;

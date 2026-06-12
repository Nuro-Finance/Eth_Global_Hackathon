CREATE TABLE IF NOT EXISTS deposit_addresses (
  user_id       TEXT        NOT NULL,
  chain         TEXT        NOT NULL,
  address       TEXT        NOT NULL,
  private_key   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chain)
);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_address ON deposit_addresses(address);

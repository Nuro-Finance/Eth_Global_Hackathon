-- Migration 019: Creator Staking + Rewards
-- Marathon Sprint C — market creators stake $5 USDC and earn 0.5% of total volume.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS creator_stake NUMERIC(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_stake_tx_hash VARCHAR(100),
  ADD COLUMN IF NOT EXISTS creator_stake_refund_tx_hash VARCHAR(100),
  ADD COLUMN IF NOT EXISTS creator_reward_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_reward_tx_hash VARCHAR(100),
  ADD COLUMN IF NOT EXISTS creator_paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_markets_creator_unpaid
  ON markets (status, creator_paid_at)
  WHERE status = 'resolved' AND creator_paid_at IS NULL;

SELECT 'Migration 019_creator_staking complete' as result;

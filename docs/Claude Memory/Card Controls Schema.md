# 💳 Card Controls — Backend Schema & API Design
> Created: 2026-03-26
> Status: NOT YET IMPLEMENTED — frontend is static in Chris's my-card-1

---

## What Chris Built (Frontend, my-card-1)

The Card Controls panel has three tabs: **Limits**, **Details**, **Settings**

### Limits Tab
- **SPEND CONTROLS**
  - Daily Spend Limit: input + checkmark (shown: $1,000 / $5,000 max)
  - Monthly Spend Limit: input + checkmark (shown: $50,000)
- **AGENTIC SECURITY LIMITS**
  - Per-Transaction Limit: input + checkmark (shown: $10,000)
  - Transaction Velocity Limit: (max tx per hour)

All of these are currently **hardcoded** in Chris's React components. We need to wire them to real API endpoints.

---

## DB Migration (run next session)

```sql
-- Card controls table: one row per card
CREATE TABLE IF NOT EXISTS card_controls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         VARCHAR(36) NOT NULL,
  user_id         VARCHAR(36) NOT NULL,

  -- Spend limits
  daily_limit     NUMERIC(20,2) NOT NULL DEFAULT 5000.00,
  daily_used      NUMERIC(20,2) NOT NULL DEFAULT 0.00,
  monthly_limit   NUMERIC(20,2) NOT NULL DEFAULT 50000.00,
  monthly_used    NUMERIC(20,2) NOT NULL DEFAULT 0.00,
  daily_reset_at  TIMESTAMP,
  monthly_reset_at TIMESTAMP,

  -- Agentic / security limits
  per_tx_limit    NUMERIC(20,2) NOT NULL DEFAULT 10000.00,
  velocity_per_hr INTEGER       NOT NULL DEFAULT 10,

  -- Abnormality alerts
  alert_threshold NUMERIC(20,2)          DEFAULT 500.00,
  alert_enabled   BOOLEAN       NOT NULL DEFAULT true,

  -- Feature toggles (Details tab)
  intl_enabled    BOOLEAN       NOT NULL DEFAULT true,
  online_enabled  BOOLEAN       NOT NULL DEFAULT true,
  atm_enabled     BOOLEAN       NOT NULL DEFAULT true,
  contactless_enabled BOOLEAN   NOT NULL DEFAULT true,

  created_at      TIMESTAMP     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP     NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_controls_card_id_idx ON card_controls(card_id);

-- Abnormality alert events log
CREATE TABLE IF NOT EXISTS card_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id      VARCHAR(36)  NOT NULL,
  user_id      VARCHAR(36)  NOT NULL,
  alert_type   VARCHAR(30)  NOT NULL,  -- 'abnormal_amount', 'velocity', 'blocked_merchant'
  amount       NUMERIC(20,2),
  description  TEXT,
  resolved     BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMP    NOT NULL DEFAULT now()
);
```

---

## API Routes to Add in `nuro-routes.ts`

### GET /cards/:id/controls
Returns current limits + live usage for the card.
```typescript
// Response shape:
{
  daily_limit: 5000,
  daily_used: 1250,         // live from card_transactions sum
  monthly_limit: 50000,
  monthly_used: 18400,
  per_tx_limit: 10000,
  velocity_per_hr: 10,
  alert_threshold: 500,
  alert_enabled: true,
  intl_enabled: true,
  online_enabled: true,
  atm_enabled: true,
  contactless_enabled: true
}
```

### PATCH /cards/:id/controls
Updates one or more limit fields. Validates: daily ≤ monthly, per_tx ≤ daily.
```typescript
// Request body (any subset):
{
  daily_limit?: number,
  monthly_limit?: number,
  per_tx_limit?: number,
  velocity_per_hr?: number,
  alert_threshold?: number,
  alert_enabled?: boolean,
  intl_enabled?: boolean,
  online_enabled?: boolean,
  atm_enabled?: boolean
}
```

### GET /cards/:id/controls/alerts
Returns abnormality alert history.

---

## Enforcement Logic (add to `nuro-routes.ts` POST /card-transactions)

When a card transaction is logged, check controls before accepting:
```typescript
// 1. Fetch controls for card
// 2. Check per_tx_limit: if amount > per_tx_limit → reject + fire alert
// 3. Check daily_used + amount > daily_limit → reject
// 4. Check monthly_used + amount > monthly_limit → reject
// 5. Check velocity: count transactions in last hour → if > velocity_per_hr → reject
// 6. Check alert_threshold: if amount > threshold → log to card_alerts (don't reject)
// 7. If all pass: INSERT card_transaction + UPDATE daily_used/monthly_used
```

---

## Wire to Chris's Frontend

The Card Controls panel currently hardcodes values. We needs to:

1. On panel open: `GET /cards/{cardId}/controls` → populate input fields
2. On each checkmark click: `PATCH /cards/{cardId}/controls` with the updated field
3. The progress bars (e.g., $1,250 / $5,000 for daily) come from `daily_used / daily_limit`

Share this endpoint spec with Chris so he can wire it up independently.

---

## Auto-Reset Logic (optional — can add to monitor.ts or a cron job)

Daily used resets at midnight UTC:
```sql
UPDATE card_controls
SET daily_used = 0, daily_reset_at = now()
WHERE daily_reset_at < date_trunc('day', now());
```

Monthly used resets on the 1st:
```sql
UPDATE card_controls
SET monthly_used = 0, monthly_reset_at = now()
WHERE monthly_reset_at < date_trunc('month', now());
```

---
*Related: [[Neural Net/Claude Memory/Database]] · [[Neural Net/Claude Memory/API Endpoints]] · [[Neural Net/Claude Memory/Modal Library]] · [[card_controls]] · [[cards]] · [[card_alerts]]*

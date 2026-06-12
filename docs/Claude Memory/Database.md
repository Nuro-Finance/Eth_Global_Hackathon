> ⚠️ SANITIZED FOR GIT — DB password replaced with [REDACTED]. See .env on VPS for connection string.

# 🗄️ Database — Cashly / Nuro Finance

## Connection
```
postgresql://cashly:[REDACTED_DB_PASSWORD]@localhost:5432/cashly
psql postgresql://cashly:[REDACTED_DB_PASSWORD]@localhost:5432/cashly
```

---

## ⚠️ Known Type Quirks

- `cards.id` → `character varying(36)` — NOT a native UUID type
- `cards.user_id` → `character varying(36)` — FK to `users(id)` but stored as text
- **PL/pgSQL: Do NOT declare variables as UUID when querying these columns — use TEXT**
- `deposit_addresses.user_id` → stores Owen/SD3 user UUID (NOT internal user UUID)

---

## Table Schemas

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Internal user ID (primary key) |
| email | varchar | Login email |
| name | varchar | Display name |
| password_hash | varchar | bcrypt |
| sd3_user_id | varchar | Owen/SD3 user UUID — same as owen_user_id |
| owen_user_id | varchar | Owen/SD3 user UUID — same as sd3_user_id |
| kyc_status | varchar | 'pending' \| 'approved' \| 'rejected' |
| phone | varchar | Added 2026-03-22 |
| notification_prefs | jsonb | `{"transactions":true,"security":true,"promotions":false,"weeklyReport":true}` |

### `cards`
| Column | Type | Notes |
|--------|------|-------|
| id | character varying(36) | gen_random_uuid() default |
| user_id | character varying(36) | FK → users(id) ON DELETE CASCADE |
| card_number | character varying(19) | Generated locally |
| card_holder | character varying(255) | From users.name |
| expiry_date | character varying(7) | MM/YY format |
| card_type | character varying(50) | Default 'VIRA' |
| gradient | text | CSS gradient string |
| balance | numeric(18,2) | Default 0 |
| is_active | boolean | Default true |
| is_locked | boolean | Default false |
| created_at | timestamptz | Default now() |
| owen_card_id | character varying(100) | Owen's card ID for freeze/unfreeze — may be null |

### `deposit_addresses`
| Column | Type | Notes |
|--------|------|-------|
| user_id | varchar | Owen/SD3 user UUID (NOT internal user UUID) |
| chain | varchar | 'evm' \| 'solana' |
| address | varchar | Deposit address |
| private_key | varchar | Private key for the deposit wallet |

**⚠️ To query by internal user: must JOIN through users table**
```sql
SELECT da.chain, da.address
FROM deposit_addresses da
JOIN users u ON (u.sd3_user_id = da.user_id OR u.owen_user_id = da.user_id)
WHERE u.id = '<internal-user-uuid>';
```

### `transactions`
| Column | Notes |
|--------|-------|
| id | UUID |
| user_id | Owen/SD3 user UUID |
| user_wallet | Source deposit address |
| base_deposit_address | Owen Base contract address |
| source_chain | Chain ID integer |
| dest_chain | 8453 (Base) |
| token | 'USDC' |
| amount | Decimal |
| fee | amount * FEE_PERCENT / 100 |
| forwarded | amount * (1 - FEE_PERCENT/100) |
| route | 'circle-cctp' |
| tx_hash | Bridge tx hash |
| status | 'pending' \| 'confirmed' \| 'failed' |
| timestamp | Unix ms |

---

## Key User Records

### Richard Wayne (richardthebrucewayne@gmail.com)
```
internal id:  db01a59c-a418-4da0-a4aa-fb032d500b04
owen_user_id: 72459d0e-8705-4b5d-bb40-904e4ae8a3a1
sd3_user_id:  72459d0e-8705-4b5d-bb40-904e4ae8a3a1
kyc_status:   approved
card id:      b2e45dbc-898e-4881-9ff1-27e3640bb759  (created 2026-03-26)
card number:  2214 8394 9218 9587
EVM deposit:  0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC
Solana:       5FnaNauWeWbgJCF2qxYCyesX3KZLRUecvy7AXmrS47mZ
Base:         0x34e81c59B814874611C7FB66661B57E599b4857D (Owen contract)
```

### richard@nuro.finance (Chris/Our tester account)
```
internal id:  92c7b62d-90ea-4cf3-9f52-fd113be0dccf
owen_user_id: 49418fc8-23ab-49c3-96c9-9a64b4583c11
EVM deposit:  0xaBcc89d0aD4Cf75eB4e8d3729B25c8B26eB1f0F4
cards:        4 cards with balances 0/0/0/21.93
              — the $21.93 card is 77d9fb1e-bdf7-461b-a8fe-e73954120dd9
```

### Chris (syncyourcode@gmail.com) — frontend dev tester
```
password: [REDACTED_PASSWORD]
```

---

## Useful Diagnostic Queries

```sql
-- All users and their cards
SELECT u.id, u.email, u.sd3_user_id, c.id as card_id, c.balance, c.owen_card_id
FROM users u LEFT JOIN cards c ON c.user_id = u.id::text
ORDER BY u.email;

-- Deposit addresses with owner emails
SELECT u.email, da.chain, da.address
FROM deposit_addresses da
JOIN users u ON (u.sd3_user_id = da.user_id OR u.owen_user_id = da.user_id)
ORDER BY u.email;

-- Recent transactions
SELECT id, user_id, amount, status, source_chain, timestamp
FROM transactions ORDER BY timestamp DESC LIMIT 20;

-- Check card for specific user
SELECT * FROM cards WHERE user_id = '<internal-user-id>';
```

---

## Migrations Applied

```sql
-- 2026-03-22
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB
  DEFAULT '{"transactions":true,"security":true,"promotions":false,"weeklyReport":true}'::jsonb;

-- 2026-03-24
ALTER TABLE cards ADD COLUMN IF NOT EXISTS owen_card_id VARCHAR(100);
```

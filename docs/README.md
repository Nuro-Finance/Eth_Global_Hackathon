# Cashly / Nuro Finance — BIOS Kernel (Project Documentation)

> This is the shared project knowledge base for the Cashly engineering team.
> Open this folder as an **Obsidian vault** for linked navigation between docs.

## What's Here

| Folder | Contents |
|--------|----------|
| `Claude Memory/` | Core project docs — architecture, DB schemas, API specs, frontend structure, bridge system |
| `Hand_Off/` | Session handoff notes between engineering sessions |
| `What We Did Today/` | Daily session logs — what changed, what broke, what's next |
| `Error Log.md` | Every error encountered and how it was fixed (44 errors as of 3/29/2026) |

## Start Here

1. Open `Claude Memory/INDEX.md` — project overview, quick context, current priorities
2. Open `Claude Memory/Database.md` — full table schemas, column types, naming conventions, useful queries
3. Open `Claude Memory/Architecture.md` — stack overview, env var structure, Owen/SD3 API, deposit flow
4. Open `Claude Memory/Card Controls Schema.md` — card_controls and card_alerts table schemas + API spec

## For Frontend Development

- `Claude Memory/Frontend.md` — Next.js structure, auth system, component map, known bugs
- `Claude Memory/API Endpoints.md` — All middleware routes with request/response formats
- `Claude Memory/Pending Tasks.md` — What's done, what's broken, what's in the backlog

## Security Note

Secrets (DB passwords, API keys, JWT signing keys, private keys) have been replaced with `[REDACTED]` placeholders. The actual values live in `.env` files on the VPS. Ask Richard for access if needed.

## DB Schema Quick Reference

The full schemas are in `Claude Memory/Database.md`, but here's the quick version:

- **users** — id (uuid), email, name, password_hash, sd3_user_id, owen_user_id, kyc_status, phone, notification_prefs
- **cards** — id (varchar36), user_id (varchar36), card_number, card_holder, expiry_date, card_type, gradient, balance, is_active, is_locked, owen_card_id, card_name
- **card_controls** — card_id, daily_limit, daily_used, monthly_limit, monthly_used, per_tx_limit, velocity_per_hr, alert_threshold, feature toggles (intl/online/atm/contactless)
- **card_alerts** — card_id, alert_type, amount, description, resolved
- **deposit_addresses** — user_id (Owen UUID), chain, address, private_key
- **transactions** — bridge transactions (source_chain, dest_chain, amount, fee, status, tx_hash)
- **card_transactions** — card spend/deposit transactions

**Important quirk**: `cards.id` and `cards.user_id` are `VARCHAR(36)`, NOT native UUID. Use text comparisons in SQL.

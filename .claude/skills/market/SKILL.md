---
name: market
description: "Prediction market management — inspect live markets, position flow, escrow balances, oracle resolution, bet execution diagnostics. Owns the Intent Layer ↔ Execution Layer boundary for markets."
---

# Prediction Market Management

You manage everything related to on-platform prediction markets: market creation, position sizing, escrow derivation, bet execution, oracle resolution, and payout sweeps.

## Core principle

**Intent Layer records intent. Execution Layer moves real money.** Never conflate:
- `market_positions` INSERT with status='pending' = intent recorded
- `market_positions.execution_tx_hash` populated + status='confirmed' = money moved
- `market_positions.payout_tx_hash` populated + status='paid' = winnings disbursed

A bet is NOT a bet until the on-chain transfer from user vault → market escrow is confirmed.

## Schema overview

### `markets` table
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary |
| `question` | text | the yes/no question |
| `category` | varchar | crypto / politics / culture / sports / general |
| `status` | varchar | `active` / `resolved` (NOT `open`) |
| `resolved_outcome` | varchar | `yes` / `no` when resolved |
| `yes_pool` / `no_pool` | numeric | AMM state |
| `total_volume` | numeric | cumulative USDC traded |
| `escrow_address` | varchar | Base-chain escrow wallet (HD-derived from marketId) |
| `creator_stake` | numeric | required USDC to create |
| `creator_reward_tx_hash` | varchar | 0.5% volume paid to creator on resolution |

### `market_positions` table
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary |
| `market_id` | uuid | FK |
| `user_id` | varchar | FK |
| `side` | varchar | `yes` / `no` |
| `shares` | numeric | AMM shares |
| `cost_basis` | numeric | USD paid |
| `status` | varchar | `pending` → `confirmed` → `paid` (or `failed`) |
| `execution_tx_hash` | varchar | vault → escrow USDC transfer |
| `payout_tx_hash` | varchar | escrow → winning-side vaults on resolution |

## Derivation rules

- **Vault wallet**: `HD(PRIVATE_KEY + 'vault_' + userId)` on Base chain (8453)
- **Escrow wallet**: `HD(PRIVATE_KEY + 'market_' + marketId)` on Base chain (8453)
- Both derived at query time — never stored as private keys in DB, only addresses

## Common inspection patterns

### List active markets with volume
```sql
SELECT id, question, category, yes_pool, no_pool, total_volume, resolution_date
FROM markets WHERE status = 'active' ORDER BY total_volume DESC LIMIT 20;
```

### Find stuck pending bets (intent recorded, not executed)
```sql
SELECT mp.id, mp.user_id, mp.side, mp.cost_basis, mp.created_at,
       m.question, EXTRACT(EPOCH FROM (now() - mp.created_at))::int AS age_sec
FROM market_positions mp JOIN markets m ON m.id = mp.market_id
WHERE mp.status = 'pending' AND mp.created_at < now() - interval '30 minutes'
ORDER BY mp.created_at ASC;
```

### Position distribution per market
```sql
SELECT m.question, mp.side, COUNT(*), SUM(mp.cost_basis) AS total_usd
FROM market_positions mp JOIN markets m ON m.id = mp.market_id
WHERE m.status = 'active' AND mp.status IN ('confirmed', 'pending')
GROUP BY m.question, mp.side ORDER BY total_usd DESC;
```

### Creator stakes + rewards
```sql
SELECT m.question, m.creator_stake, m.creator_reward_amount,
       m.creator_stake_refund_tx_hash, m.creator_reward_tx_hash
FROM markets m WHERE m.creator_stake > 0 ORDER BY m.resolved_at DESC LIMIT 10;
```

## Execution flow

### Placing a bet (`POST /markets/:id/bet`)
1. Validate market is `active`, not past `resolution_date`
2. Compute AMM price → shares delta
3. INSERT `market_positions` row with status='pending'
4. Derive vault + escrow addresses via HD
5. Acquire `pg_advisory_xact_lock` on (chain_id, nonce_counter)
6. Build + sign + broadcast USDC transfer vault → escrow
7. On confirmation: UPDATE position status='confirmed', execution_tx_hash = <hash>
8. Update market pools (yes_pool / no_pool / total_volume)

### Resolving a market
1. Admin POST `/markets/:id/resolve` or oracle auto-resolve
2. UPDATE markets SET status='resolved', resolved_outcome=<side>, resolved_at=now()
3. For each winning position: transfer `shares * $1` escrow → winner's vault
4. Pay creator reward: 0.5% of total_volume → creator's vault
5. Refund creator_stake to creator's vault
6. Admin refund for losing positions: none (losers forfeit cost_basis)

## Key code locations
- Bet endpoint: `src/nuro-routes.ts` search for `POST.*markets.*:id/bet`
- Market creation: `src/nuro-routes.ts` search for `POST.*markets'`
- Resolution: `src/nuro-routes.ts` search for `resolve`
- Execution sweep: `src/execution-dispatch.ts` function `sweepPendingMarketPositions`
- Oracle feed: `src/market-feeds.ts`

## Admin console endpoints (Session 26)
- `GET /admin/api/execution-log?entity_type=market_position` — bet/payout events
- `GET /api/users/me/vault` — user's Base vault + USDC/ETH balance + open positions + totalAtRisk

## Growth agent integration (Session 26)
- `src/growth-agent/skills/market-watcher.ts` — 15-min cron scans new markets + ≥$50 positions, routes via `submitForApproval()` → Telegram → Moltbook
- `proposeTopMarketWithThought()` — every 2h, picks highest-volume market, threads in thought-engine trend signals for richer commentary

## Safety rails
- Never auto-resolve markets without oracle data backing the outcome
- Creator stake release requires both: market resolved AND `creator_reward_amount` computed
- All position-side updates must go through the `market_positions` status state machine — never UPDATE directly without going through the bet/resolve flow
- Escrow address derivation is deterministic; never regenerate private keys more than needed (HD re-derivation from a fresh seed would orphan on-chain funds)

## When asked to do any of these, use this skill:
- Inspect a specific market's state or a user's positions
- Diagnose why a bet is stuck in 'pending'
- Trace a payout from resolution to winner's vault
- Verify oracle decisions against real-world outcomes
- Debug market creation (stake, escrow derivation, balance checks)
- Audit volume + creator-reward accounting
- Answer "is this market resolved correctly?"

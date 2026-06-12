# 🔌 API Endpoints — Middleware (Port 3000)

Base URL: `http://74.50.109.203:3000` (also `https://api.nuro.finance` via TLS)
Auth: `Authorization: Bearer <JWT>` — JWT signed with `JWT_SECRET` (HS256)

> ✅ **BACKFILL COMPLETE 2026-05-08**: S21–S34 endpoint catalog appended below. The `## Endpoint catalog — added in S21–S34` section is a compact ledger (method + path + behavior summary + source pointer) for endpoints that don't have full table-form sections elsewhere. Detailed request/response shapes for any specific endpoint can be read from the route definitions in `Cashly_Source_Code/src/nuro-routes.ts`, `src/admin-console.ts`, and the per-feature route files. Going forward (encode Step 12 makes this mandatory), every new endpoint gets an entry here at the time it ships.
>
> The detailed table-form sections in this file (Auth, Users, Cards, Card Transactions with auto-sync + isIncoming, **Card Secrets / RSA-OAEP reveal**, KYC, Notifications, Card Controls, Transfers) ARE current as of 2026-05-08.

---

## Auth (no token required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/register` | `{email, password, name}` | `{accessToken, user}` |
| POST | `/auth/login` | `{email, password}` | `{accessToken, user}` |

---

## Users (requires auth)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/users/me` | — | Returns user profile |
| PATCH | `/users/profile` | `{name, phone}` | Updates name/phone |
| POST | `/users/change-password` | `{currentPassword, newPassword}` | bcrypt check |
| PATCH | `/users/notifications` | `{transactions, security, promotions, weeklyReport}` | Updates notification_prefs JSONB |

---

## Cards (requires auth)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/cards` | — | Returns all cards for req.user.id. **Auto-syncs balance from Issuer** for each card with `issuer_card_id IS NOT NULL` (phantoms skipped per S35 Day-4 fix). Response now includes `isIssuerLinked: boolean` flag so FE can compute totals from real cards only. |
| POST | `/cards` | `{}` or `{cardType: "VIRA"\|"NOIR"}` | Creates card in DB + fire-and-forget Issuer card creation |
| PATCH | `/cards/:id` | `{isLocked, alert_enabled, spend_threshold, ...}` | Freeze/unfreeze — updates DB + calls Issuer PATCH /cards/{owenCardId}. **`balance` is INTENTIONALLY NOT accepted** in body (S32 security fix — combined with the withdrawal balance gate, allowing client-supplied balance was an exploit chain into real treasury USDC). **S35 Day-5 (2026-05-09)**: when `alert_enabled` or `spend_threshold` is in the body, the route now does `INSERT … ON CONFLICT (card_id) DO UPDATE` against `card_controls` instead of a plain UPDATE, so settings persist even when the controls row hasn't been auto-upserted yet (was a silent no-op). |
| GET | `/cards/:id` | — | Single card |
| GET | `/cards/:id/secrets` | — | **Real PAN + CVV reveal via SD3 RSA-OAEP / AES-128-GCM protocol — see § Card Secrets below.** Rate-limited **50 reveals/hour/user** (bumped from 5 on 2026-05-09 — original was too tight for normal iteration; FE now surfaces 429 inline as "Try again in Ns" instead of silently failing). Audited to `execution_log` per attempt (records the *fact* of the reveal, NEVER the values). |

**Day-4 (2026-05-08) phantom-card fix**: GET /cards loop and the cron sweep now both filter `issuer_card_id IS NOT NULL` before calling `syncCardBalanceFromIssuer`. Without this, the user-level Issuer balance was being stamped onto every card row including seeded phantoms (deck-stack visual cards), producing the lying $4.94 wallet total.

**⚠️ Bug fixed 2026-03-26**: `req.body || {}` — was crashing when body was empty

---

## Card Secrets — RSA-OAEP / AES-128-GCM Reveal (S35 Day-4, 2026-05-08)

> **Full protocol spec lives in `.claude/skills/sd3-card-secrets/SKILL.md`** — invoke that skill when implementing or debugging any card-secrets surface. Below is the API-level summary; the skill carries the byte-level encoding rules, public key, and traps.

### `GET /cards/:id/secrets` — Reveal full PAN + CVV
**Auth:** `requireAuth`
**Rate limit:** 5 reveals per hour per user (in-memory sliding window). 429 with `Retry-After` header if exceeded.
**Audit:** Every attempt — allowed, blocked, or failed — appends a row to `execution_log` (entity_type='card', action='secrets_reveal', detail={userId, issuerCardId, ip, userAgent, attemptInWindow, fullReveal}). Values themselves are **never** logged.

**Behavior:**
1. Verifies card belongs to req.user.id
2. Calls `getIssuerCardSecrets(issuer_card_id)` which:
   - Generates 16 random bytes → 32-char hex `secretKey`
   - Hex-decodes to 16 raw bytes, base64-encodes those (NOT base64 of the hex string — that's the trap)
   - RSA-OAEP / SHA-1 encrypts the base64 with SD3's published public RSA key (1024-bit)
   - Sends as `SessionId` header (capital S/I) to `GET https://rocket.sd3.gg/api/proxy/issuing/cards/:id/secrets`
   - Receives JWE-style `{ encryptedPan: { iv, data }, encryptedCvc: { iv, data } }` response (NOT plaintext, despite SD3's official guide showing plaintext)
   - AES-128-GCM decrypts each field using `Buffer.from(secretKey, 'hex')` (16 bytes) as the key, with the auth tag being the LAST 16 bytes of the base64-decoded `data` field
3. Falls back to metadata-only render (`getIssuerCardNumber` → masked PAN with real last4 + MM/YY expiry, null CVV) if the reveal fails for any reason

**Returns:**
```json
{
  "cardNumber": "•••• •••• •••• 0918"  // masked metadata, OR full 16-digit PAN if reveal succeeded
  "expiryDate": "09/31",                 // always present (from metadata endpoint)
  "cvv": "496"                           // 3 digits if reveal succeeded, null otherwise
}
```

**Persistence rules (PCI-DSS 3.2.2):**
- Full PAN is NEVER persisted to our DB. Only `card_last_4` is stored after reveal.
- CVV is NEVER persisted. Display once, discard from memory.
- The audit trail records that user X revealed card Y at time T; the values themselves are not in the trail.

**Common errors:**
- `429 Too many CVV reveals. Try again in <s>` — rate limit
- `404 Could not retrieve card details from Issuer` — both reveal AND metadata fallback failed (transport error or cardId not in our user pool)
- Internal `Failed to Decrypt Session ID, RSA Public key Not Matching` — protocol error, almost always means the SessionId payload encoding is wrong (most common: base64-encoded the UTF-8 of the hex string instead of base64-encoding the raw 16 bytes the hex represents). See skill TL;DR.

---

## Deposit Addresses (requires auth)

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | `/deposit-addresses` | `{evm, base, solana}` | base = Issuer Base contract (null if not provisioned); evm = monitor address; solana = generated |

**How it works:**
1. Looks up `users.issuer_user_id` for req.user.id
2. Calls `getDepositAddress(issuerUserId, 'evm')` from DB
3. Calls `getUserBaseDepositAddress(issuerUserId)` from Issuer API
4. Returns all three addresses

---

## KYC (requires auth or webhook key)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/kyc/status` | Returns `{status, kycUrl}` — polls users.kyc_status |
| POST | `/kyc/start` | Calls Issuer onboardUser, returns KYC URL |
| POST | `/kyc/webhook` | Issuer calls this when KYC completes — updates kyc_status |

**KYC Banner fix (2026-03-25)**: Was calling relative `/api/kyc/status` (Next.js route). Fixed to `${NEXT_PUBLIC_API_URL}/kyc/status`.

---

## Settings (requires auth)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/users/me` | — | Profile data |
| PATCH | `/users/profile` | `{name, phone}` | Save profile |
| POST | `/users/change-password` | `{currentPassword, newPassword}` | |
| PATCH | `/users/notifications` | notification prefs object | |

---

## Card Transactions (requires auth)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/card-transactions` | — | Returns transactions for req.user.id. Supports filters: `?cardIds=uuid1,uuid2`, `?category=`, `?status=`, `?type=`, `?dateFrom=`, `?dateTo=`. **Auto-triggers SD3 sync** on entry if `users.last_tx_synced_at > 30s` ago (rate-limited cooldown — see auto-sync block below). |
| POST | `/card-transactions` | `{name, type, amount, category, isIncoming?}` | **Sandbox-only** path (no real money movement). Built S35 for demo / test transaction injection. |

**Auto-sync behavior (added S35 Day-3, hardened Day-4):**
On every GET /card-transactions, the handler checks `users.last_tx_synced_at`. If null OR more than 30 seconds stale, it invokes `syncIssuerTransactions(db, userId)` synchronously before returning the row set. The sync pulls the last 24h of SD3 events (lookback buffer) and upserts via `issuer_transaction_id` unique index. Net effect: a real Visa swipe shows on the dashboard within ~30s without any explicit refresh action.

**S35 Day-4 sync hardening:**
- Migration 048 widened `merchant_category_raw` 50→255 + `merchant_name` 200→255. Prior to this, SD3 events with long MCC descriptions (e.g. CAFE WEST's 65-char "Colleges, Universities, Professional Schools, and Junior Colleges") were aborting the entire sync transaction with `value too long for type character varying(50)` and the watermark never advanced — 14h blind spot until investigated.
- `mapSd3SpendToCardTx` now defensively truncates `name`, `merchantName`, `merchantCategoryRaw`, `issuerTransactionId` so a single bad row can never tank a batch again.
- **`payment`-type SD3 events are now credited as income.** SD3 emits `payment` events (USDC bridge top-ups) with `userId` but NO `cardId` in the payload. Sync now falls back to the user's primary issuer-linked card (`issuer_card_id IS NOT NULL`, oldest first) when `payment.cardId` is missing. Sets `is_incoming = true` on the row.
- INSERT now writes `is_incoming` explicitly (was being skipped, leaving the column NULL forever).

**Response field shape (per row):**
```json
{
  "id": "...", "cardId": "...", "name": "CAFE WEST", "type": "purchase",
  "amount": 2.25, "isIncoming": false, "date": "2026-05-08T01:51:54Z",
  "category": "other", "status": "completed", "txHash": null,
  "sourceChain": null, "destChain": null, "token": null,
  "merchantName": "CAFE WEST", "merchantCategoryRaw": "Colleges, Universities, ...",
  "transactionType": "visa_spend", "issuerTransactionId": "...", "sourceVerified": true
}
```

**Frontend proxy:** `src/app/api/transactions/route.ts` → forwards to backend `/card-transactions`
**Hook:** `useTransactionsState` fetches via `/api/transactions` with auth token, **polls every 30s** while tab is visible (visibility-aware — pauses on hidden, immediate refetch on visible). Pairs with the BE auto-sync to keep the tab live within ~30s of real card activity.
**DB Table:** [[card_transactions]] (current state varies — fully populated from Issuer for active accounts)

---

## Notifications (requires auth) — ADDED 2026-03-31

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/notifications` | — | Returns user's notifications, limit 50, ordered by created_at DESC |
| PATCH | `/notifications/:id/read` | — | Marks single notification as read. Returns updated row. 404 if not found or not owned. |
| POST | `/notifications/read-all` | — | Marks ALL unread notifications as read for user. Returns `{success: true}` |

**DB Table:** [[notifications]] (8 rows seeded 2026-03-31)
**Committed:** `ec51170` on `Build_Branch` (backend repo)
**Frontend wiring:** NotificationsModal is LIVE. NotificationsDropdown still uses mock data (hook rewrite pending).

---

## Card Controls (requires auth) — ADDED 2026-03-27

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/cards/:id/controls` | — | Returns card controls. Auto-upserts defaults if none exist. Resets daily/monthly on period boundary. |
| PATCH | `/cards/:id/controls` | `{field: value, ...}` | Dynamic field update — validates fields, returns updated row |
| GET | `/cards/:id/controls/alerts` | — | Returns alert history for card |

**DB Tables:** [[card_controls]] (3 rows), [[card_alerts]] (0 rows)
**Frontend:** `CardLimits.tsx` fetches on mount, save buttons call PATCH, progress bars show real usage.

---

## Testing with curl

```bash
# Generate token
TOKEN=$(cd /home/cash/Cashly && node -e "
const jwt = require('jsonwebtoken');
const secret = 'abfacdde661a977b949525f481953fc9accb4fb78060b8d31ee85f62720ee1b5';
console.log(jwt.sign(
  { id: 'db01a59c-a418-4da0-a4aa-fb032d500b04', email: 'richardthebrucewayne@gmail.com' },
  secret, { expiresIn: '2h' }
));
")

# Test endpoints
curl -s http://localhost:3000/cards -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://localhost:3000/deposit-addresses -H "Authorization: Bearer $TOKEN" | jq .
curl -s -X POST http://localhost:3000/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

## Transfers — ADDED 2026-04-01

### `POST /transfers` — Create transfer (intent layer)
**Auth:** `requireAuth`
**Body:** `{ recipient, accountNumber, amount, currency?, transferDate?, description?, cardId? }`
**Validation:** Matches Chris's Zod schema — recipient min(2), accountNumber regex `/^\d{10,20}$/`, amount 1-1000000, currency USD|GBP|JPY, description max(200)
**Flow:** Auth → find active card → check balance → check card_controls (per_transaction_limit, daily_limit, monthly_limit) → INSERT transfers → deduct card balance (if immediate) → update card_controls used → create notification
**Returns:** 201 + transfer row | 400 validation | 402 insufficient/over limit | 403 card locked | 404 no card
**Note:** This is the INTENT LAYER only. On-chain execution happens via bridge/CCTP when RPC is enabled.

### `GET /transfers` — Fetch transfer history
**Auth:** `requireAuth`
**Query:** `?limit=50&offset=0&status=completed|pending|failed|cancelled`
**Returns:** `{ transfers: [...], total: N, limit: N, offset: N }`

---

## Endpoint catalog — added in S21–S34 (chronological by session, compact form)

> Compact ledger — method + path + auth + behavior. Full request/response shapes live in the route definitions; this catalog is for orientation. Cross-referenced to the [[Deploy History]] entry for that session.

### S21 (2026-04-16 → 04-17) — Sprint 2.3 agent execution

- `POST /admin/api/agents/:id/fund` — admin · fund agent vault from treasury
- `POST /admin/api/agents/:id/sweep-profits` — admin · trigger profit sweep manually
- `GET /admin/api/agents/:id/state` — admin · agent runtime state + recent bet log
- 5 admin sweep cron triggers wired (no new HTTP routes — internal scheduled tasks). Source: `src/execution-dispatch.ts`.

### S22 — Sprint 6 telemetry + admin

- `GET /admin/api/monitor-skips` — admin · skip telemetry aggregation (reason-code rollup + recent 20 rows). Source: `src/admin-console.ts`.

### S23 — Marathon 7 (native + ERC-20 swap aggregator) + memecoin UX

- `GET /supported-tokens` — public · returns the active erc20_allowlist (used by FE token-picker). 60s in-memory cache. Source: `src/swap.ts` + `src/nuro-routes.ts`.
- `POST /quote/swap` — public · 0x quote for the demo / preview path (uses `/price` endpoint internally so no taker required for previews). Source: `src/swap.ts`.
- 3 admin endpoints for `erc20_allowlist` CRUD: `GET /admin/api/erc20-allowlist`, `POST /admin/api/erc20-allowlist`, `PATCH /admin/api/erc20-allowlist/:id` — admin token management UI consumes these. `forceRefreshAllowlist()` invalidates the 60s in-memory cache on writes.
- `GET /users/search?q=` — auth · debounced autocomplete for `RecipientSearch.tsx` (transfer flow).
- Internal: `pollNativeBalance()` + `pollErc20Balance()` added to `src/monitor.ts` (no HTTP route; runs alongside `pollChain`).

### S24 — engagement fetcher cron (no new HTTP routes — scheduled task in `src/growth-agent/skills/engagement-fetcher.ts`)

- Skill-health surface added: `GET /admin/api/skill-health` + `GET /public/skill-health` — aggregates execution_log by entity_type, classifies green/yellow/red/unknown by error rate. Edge-cached 30s via Next.js proxy at `/api/skill-health`. Source: `src/admin-console.ts`.

### S25 — wallet-portfolio Alchemy proxy + firm Swap

- `GET /wallet-portfolio?address=` — public (10 req / 10s IP rate limit) · proxies Alchemy enhanced API server-side, computes per-chain USD via CoinGecko platform-specific contract lookups. 30s in-memory cache + 5min TTL + 1hr stale-ok fallback. Source: `src/wallet-portfolio-routes.ts`. **S35 Day-5 (2026-05-09)**: `DEFAULT_CHAINS` bumped 4→7 — added Optimism (10), Avalanche (43114), BSC (56) to match the 7-chain wagmi config. `GLOBAL_NATIVE_IDS` extended to `[ethereum, matic-network, avalanche-2, binancecoin]` so AVAX/BNB native balances actually price (was hardcoded to ETH/MATIC only — silent $0 for those chains).
- `GET /wallet-activity?address=&limit=` — same auth + cache pattern. Per-chain category selection (Alchemy `internal` not supported on L2s).
- `POST /quote/swap/firm` — public · returns executable 0x tx payload with caller's wallet as `taker`. FE proxy at `/api/quote/swap-firm` keeps the API key server-side. Source: `src/swap.ts`.
- `GET /admin/api/log/:id` — admin · click-through detail for any execution_log row (full JSON + Etherscan deep-link on tx_hash rows).

### S26 — Sprint 6.5 observability + Sprint 2.1 Vault exposure + growth-agent intelligence

- `GET /admin/api/deposit-funnel?range=24h|7d` — admin · per-chain + overall funnel (detected, bridged, failed, pending, success_rate, avg_confirm_seconds). SVG sparkline data shape included. Source: `src/admin-console.ts`.
- `GET /admin/api/chain-health` — admin · green/yellow/red per chain via stuck_pending count + recent_failures + last-confirmed age.
- Internal: `src/ops-alerts.ts` 10-min cron (no HTTP route) — Telegram alerts for status='pending' AND created_at < now() - 30min, deduped via execution_log.
- `GET /users/me/vault` — auth · vault address + USDC balance + ETH balance + open positions + totalAtRisk. FE proxy at `/api/users/me/vault`. Source: `src/nuro-routes.ts`.
- Growth-agent: `src/growth-agent/skills/market-watcher.ts` (no HTTP route — 15min cron, scans active markets + market_positions, routes through `submitForApproval()` → Telegram approve/reject).

### S27 — User-ID semantic migration + admin tools + webhook live

- `GET /admin/api/markets` — admin · 5-stat summary + top-20 active + stuck-pending positions + creator payout audit.
- `POST /admin/api/markets/:id/resolve` — admin · manual market resolution override.
- `GET /admin/api/agents` — admin · agent list with AGENT_* env flag chips.
- `POST /admin/api/users/lookup` — admin · email → userId resolver (used by S28 admin agent creation form).
- `GET /admin/api/issuer-webhooks` — admin · HMAC verify stats (total/verified/rejected/verify_rate) + collapsible last-20 attempts trail (sig_prefix + body_hash + source_ip) + processed-events trail. Live/observe-only pill with last-SD3-delivery age.
- `GET /admin/api/sd3-health` — admin · SD3 API health (HTTP code + latency); replaced "we need a backup BIN" alarm panel after S27 misread the execution_log.
- VPS env: **`ISSUER_WEBHOOK_OBSERVE_ONLY=false` flipped LIVE** (gate-check 9/9 green confirmed before flip). Audit row in execution_log.

### S28 — Buy 1 + Plaid + Dwolla + Kelp hardening

- `POST /buy-from-card` — auth · Buy 1 entry point. Flag-gated by `BUY_1_ENABLED`. **Non-atomic with reconciliation**: SD3 debit FIRST, then on-chain transfer; if on-chain fails after SD3 debit, `transactions.status='debited_pending_transfer'` flags for operator reconciliation via `issuers.creditCard()`. Source: `src/nuro-routes.ts` + design notes in [[Session 28 Recap]].
- Plaid scaffolds (S28 stub, deepened S35 Day-3): `POST /buy-from-bank/link-token`, `POST /buy-from-bank/link-complete`. Source: `src/nuro-routes.ts`.
- Dwolla scaffolds: `POST /admin/api/dwolla/customer/create`, `GET /admin/api/dwolla/funding-source/:id`. (Most Dwolla flows wait for credentials.)
- Internal: `src/lz-reserve-monitor.ts` — 5-min off-chain LZ drift detection (no HTTP route, watches `LZ_BRIDGE_ENABLED`).

### S29 — signup hardening (no new BE endpoints — auth.ts + register proxy fixes)

The 5 fixes were FE-routing + env-var unification + dup route cleanup; documented in detail in [[Session 29 Recap]]. No new HTTP surface added.

### S30 — Solana aggregator + Heimdall H1 + Google OAuth bridge + KYC 3-in-1 + BackendUserSync

- `POST /quote/swap-solana` — public · Jupiter API quote (lite-api.jup.ag/swap/v1/quote — migrated from quote-api.jup.ag mid-deploy). Returns route plan + USD breakdown. Source: `src/jupiter-client.ts`.
- `POST /auth/social-login` — public · find-or-creates user by Google id_token. Verifies signature + audience + issuer + email_verified against Google JWKS via `src/oauth-verify.ts`. Provider-agnostic; Apple/Microsoft/GitHub additions are one-entry expansions. Returns Cashly JWT + user payload.
- `POST /kyc/start` enhanced — now accepts `{firstName, lastName}` body, stores both on users table (mig 028), constructs SD3 KYC URL with merged params (was previously dropping params on URL construction).
- Internal: `src/users-routes.ts` `BackendUserSync` provider call site (FE-side no new HTTP route — but consumes existing `GET /users/me`).
- Heimdall observability surface (HEIM-001..007 ingress prompt-injection scanner armed in observe mode; HTTP routes added in S33 "Heimdall Status" panel — see below).

### S31 — agent-bus + reputation + Huginn + HL Phase 1 + doc-monitor

- 8 endpoints under `/api/agent-bus/*` (publish, subscribe, ack, nack, list-topics, list-messages, rotate-key, list-keys). HMAC-SHA256 + AES-256-GCM at rest + 24h key-rotation grace. Source: `src/agent-bus/`.
- HL Phase 1 read-only endpoints: `GET /yield/hyperliquid/vaults`, `GET /yield/hyperliquid/funding-history`, `GET /yield/hyperliquid/staking`, `GET /yield/hyperliquid/lp-pools`. Source: `src/hl-routes.ts` + `src/hl-vault-client.ts`. Migrations 033 + 034 back this.
- Heimdall hardened-pass endpoints: `GET /admin/api/heimdall/state` (per-agent gjallarhorn state machine), `POST /admin/api/heimdall/state/:agentId/override` (human override to de-escalate paused/quarantined). Source: `src/heimdall/state-machine.ts`.
- `GET /admin/api/heimdall/manifest-roots` — Merkle manifest hash verification status (boot-time check of Neural Net + .claude/skills against signed manifest.json).
- Doc-monitor cron — no HTTP route, but writes to `external_doc_snapshots` table (mig 033) + publishes on agent-bus topic `external-doc-drift:breaking|notable`. Source: `src/external-doc-monitor.ts` + `src/lz-doc-scanner.ts` + `src/cctp-doc-scanner.ts`.
- HEIM-105 native-value tx-cap sites — internal (no HTTP). `src/native-price.ts` (CoinGecko 5-min cache) + wired into `src/hype-bridge.ts` + `src/gas.ts`.

### S32 — HL audit + sandbox harness + balance-spoof P0 patch

- 7 sandbox admin endpoints under `/admin/api/sandbox/*`: spawn, get, advance, set-price, mine, exec, delete. Source: `src/sandbox/routes.ts`. Migration 040 backs sandbox_sessions persistence + active-session port-allocation index.
- `POST /api/agents/:id/propose-action` — admin · Mythos counsel-on-action wrapper invoking `recordPredictionWithCounsel`.
- `GET /admin/api/heimdall/fp-rate?rule=` + `POST /admin/api/heimdall/events/:id/fp` — admin · per-rule false-positive labeling (mig 039 added 3 columns to heimdall_events). Foundation for "is this rule ready to enforce?" decisions.
- `POST /api/agents/:id/budget/topup` (S34 alias) — auth · budget rollover endpoint.
- Internal: gas-balance-sync cron (~1h cadence, per-chain `provider.getBalance` + native-price USD conversion) — no HTTP route.
- **🔒 Security patch (S32 P0)**: `PATCH /cards/:id` — `balance` REMOVED from accepted body. Both money-paths (`POST /withdrawals` + `POST /buy-from-card`) now sync from Issuer (SD3) BEFORE the spend gate, return 503 on Issuer outage rather than fall back to stale cache. Closed an authed-user-can-spoof-balance-then-drain-treasury exploit chain.

### S33 — x402 productize + Heimdall ingress live + Tier 0/1 sweep

- `POST /facilitator/verify` + `POST /facilitator/settle` + `GET /facilitator/supported` — public · x402 facilitator routing layer. Internal payers short-circuit to off-chain ledger (recordSpend + recordRefill in agent_budget_ledger). External calls forward to Coinbase mainnet facilitator (testnet via x402.org). Network-aware. Source: `src/x402-routes.ts`.
- 3 paid x402 endpoints (first revenue surface beyond demo):
  - `POST /api/heimdall/threat-intel` (gated by x402 `402 Payment Required` middleware)
  - `GET /api/markets/resolved` (gated)
  - `POST /api/huginn/counsel` (gated)
  Each wraps the existing internal capability with x402 paywalled middleware. Source: `src/x402-routes.ts`.
- `GET /cards/:id/secrets` — auth, **rate-limited 5/h/user** (in-memory sliding window) — initial version (S33). Behavior expanded S35 Day-4 to do real RSA-OAEP reveal — see § Card Secrets above for the full spec.
- `POST /cards/:id/report-lost` — auth · reports card lost/stolen, freezes via Issuer immediately, creates incident record. Replaces silent no-op handler.
- Heimdall observability live (HEIM-001..007 ENFORCE-mode after FP rate validated): `GET /admin/api/heimdall/events` (recent 50 with FP labels), `GET /admin/api/heimdall/fp-trend?days=30` (rolling FP rate per rule + readyToEnforce flag), `GET /admin/api/heimdall/self-test` (synthetic injection tests).
- `POST /admin/api/heimdall/critical-finding` — admin (HMAC-keyed) · auditor-skill DISPATCH endpoint for filing critical findings to heimdall_events. Used by the auditor SKILL.md DISPATCH protocol.
- `POST /agents/:id/settle` — fixed (S33 T1 #5): now creates pending row + truthful UX instead of lying about completion. Followup `af996e0` made `sweepCardSettlements` handle agent rows.
- `POST /vault/withdraw` (real wiring, replaces alert() stub) — auth · executes the on-chain withdrawal via existing bridge primitives; UX surfaces tx hash + block confirmation.
- `POST /card-transactions` — auth, **`SANDBOX_MODE=true` env-gated** in production (test/demo only path; real card transactions come from Issuer webhooks).
- `enforceTxCap()` HEIM-105 wired into 5 user-money paths (T1 #4): /withdrawals, /buy-from-card, /api/agents/:id/bets, /vault/withdraw, /quote/swap (firm).

### S34 — Tier-A Agent Detail panel + notification aggregation + scaling roadmap

- `GET /agents/:id/details` — auth · BUNDLED endpoint returning all 5-tab data in one round-trip (Overview / Budget / Reputation / Counsel / Security). FE consumes via `/api/agents/:id/details` Next.js proxy. Source: `src/agents-detail.ts`.
- `POST /api/agents/:id/budget/topup` — auth · user-facing budget top-up form (Tier-A polish).
- `GET /api/agents/:id/strategy-config` + `PATCH ...` — auth · A2 strategy + risk_limit slider config panel.
- `GET /api/agents/:id/reputation-history` — auth · A4 reputation sparkline data with fixed [-1,+1] axis + tier color zones.
- `GET /notifications` — extended (S34 9.3) to UNION 5 source tables at query time (manual notifications + heimdall_events + tx events + budget alerts + sweep alerts). Persists read/dismiss state for synthetic rows via `notification_reads` tracker (mig 044).
- `GET /admin/api/agents/:id/sweep-status` — admin · split pending-vs-completed sweeps in Overview tab (S34 9.2; closes the gains-funnel-to-card visibility gap).
- `GET /admin/api/issuer-sync-status/:userId` — admin · green/yellow/red dot showing SD3 balance freshness.
- **Pre-push gate added**: `scripts/check-admin-script.js` — parses rendered admin `<script>` block via Node `vm`, blocks pushes that contain template-literal escape collisions. Closes the "all stat cards blank" regression class (rooted in `\'` collapses to `'` inside single-quoted JS literals).
- **🔒 Security**: A3 `enforceTxCap` on `/api/agents/:id/bets` — was missing entirely, AND would have tagged events with userId not agentId. Both gaps closed in one surgical commit (`8fc8918`).

### S35 Day-5 — BYOK chat endpoints + threshold email scaffold (2026-05-09)

- `POST /api/assistant/verify-key` — public (Next.js FE proxy route at `src/app/api/assistant/verify-key/route.ts`) · accepts `{provider, apiKey}`, validates by calling that provider's models endpoint (OpenAI: `/v1/models`, Anthropic: `/v1/messages` with empty body, Gemini: `/v1beta/models`). Returns `{ok: true}` or surfaces the upstream error verbatim. **Dev-bypass**: `apiKey === "1234"` short-circuits to ok=true so demo recordings don't burn real credits. `dd5cf92` fixed the length-check ordering so the dev-bypass actually fires before the 30-char minimum check.
- `POST /api/chat` — public (Next.js FE proxy route, fully rewritten) · accepts `{provider, apiKey, model, messages}`, routes to the right provider SDK (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`), streams SSE deltas back. FE stores keys in `localStorage` only — never persisted server-side (correct PCI-style posture). FE caller uses `AbortController` so the Stop button mid-stream actually preserves partial text.
- **Threshold email scaffold (no new HTTP endpoint)** — `src/email.ts` with `sendEmail()` and `sendThresholdAlertEmail()` helpers, gated on `RESEND_API_KEY` env var. Wired into `issuer-sync.ts upsertCardTransaction`'s high-value branch right next to the `card_alerts` insert (same gate: `alert_enabled && |amount| >= alert_threshold && !isIncoming`). Send outcomes (success / skipped / failed) audit-logged to `execution_log` under `entity_type='card', action='threshold_email'`. To activate: set `RESEND_API_KEY=re_...` and `EMAIL_FROM=...` on VPS, `pm2 restart cashly-middleware --update-env`. **Activated 2026-05-09** with sandbox sender `onboarding@resend.dev`; domain `nuro.finance` verification in flight.
- **Spend-threshold persistence behavior change** — `PATCH /cards/:id` now upserts to `card_controls` instead of plain UPDATE (was a silent no-op when controls row didn't exist yet). One-shot SQL reconciled mismatched rows where `cards.spend_threshold` and `card_controls.alert_threshold` had drifted.
- **Card-secrets rate limit** — `SECRETS_RATE_CAP` bumped 5 → 50 per hour. FE surfaces 429 inline ("Too many reveals — try again in Ns") instead of silently console.warn'ing.

---
*Related: [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/Database]] · [[Neural Net/Claude Memory/Frontend]] · [[Neural Net/Claude Memory/Card Controls Schema]] · [[Neural Net/Claude Memory/Accounts & Test Users]] · [[Neural Net/
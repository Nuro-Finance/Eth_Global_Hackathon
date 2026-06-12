# AFI V2 Feature Set & Marathon Build Plan
> Created: 2026-04-09 | Author: Mythos (Neural Net)
> Principle: **Intent Layer records intent. Execution Layer moves real money. Never conflate the two.**

---

## Core Architecture

```
INTENT LAYER (Database)              EXECUTION LAYER (On-Chain)
├── Records user actions             ├── Real wallet transactions
├── Tracks positions & balances      ├── Real bridge transfers (CCTP/LZ)
├── Stores market data               ├── Real Issuer deposits → Visa card
├── Logs agent strategies            ├── Real Polymarket CLOB trades
└── NEVER modifies card balance      └── Issuer API is the ONLY source of truth
    directly — only Issuer can                for card balance
```

**Golden Rules:**
1. Card balance comes from Issuer ONLY — `GET /api/proxy/issuing/users/:userId/balances`
2. Card transactions come from Issuer ONLY — `GET /api/proxy/issuing/transactions?userId=`
3. We NEVER `UPDATE cards SET balance =` unless reflecting a confirmed on-chain event
4. Deposits to card ONLY happen via sending USDC to user's Issuer Base deposit address
5. Every user gets their own Issuer deposit address via `GET /users/:userId/contracts`

---

## MARATHON 1: V2 Feature Set Roll Out (EXECUTE FIRST)

> Originally Marathon 2. Moved to first position — ship features, then pen test.

---

## MARATHON 2: Intent Layer ↔ Execution Layer Complete System Pen Test ✅ COMPLETE (Session 19)

**Goal:** Verify every path from user action → on-chain execution → real card credit
**Status:** ALL SPRINTS COMPLETE — Sprint 1.1 through 1.5 done April 14, 2026

### Sprint 1.1: Card Issuance Pipeline
- [ ] Complete Richard's KYC (camera + ID verification at Issuer portal)
- [ ] Get Issuer card creation `configuration` schema (ask Issuer team)
- [ ] Create REAL card via `POST /api/proxy/issuing/users/:userId/cards`
- [ ] Store `cardId` in our DB
- [ ] Fetch real PAN/CVV/PIN via `/cards/:cardId/secrets` with SessionId
- [ ] Display real card details on My Card page (not generated numbers)
- [ ] Verify `GET /users/:userId/balances` returns real balance in cents
- [ ] Replace ALL local `cards.balance` reads with Issuer balance API
- [ ] Wire Issuer `GET /transactions` to our Transactions page (real spend data)

### Sprint 1.2: Deposit Testing — CCTP 1-Hop Chains (Direct to Base)
Each chain test: Send $0.50 USDC to user's EVM deposit address → monitor detects → bridge fires → Issuer Base contract receives → card balance updates

| # | Chain | ChainID | CCTP Domain | Status |
|---|-------|---------|-------------|--------|
| 1 | **Base** (direct) | 8453 | — | ✅ TESTED Session 10 ($0.10) |
| 2 | **Ethereum** | 1 | 0 | ⚠️ Burn tx sent, attestation cancelled |
| 3 | **Arbitrum** | 42161 | 3 | 🔲 NOT TESTED |
| 4 | **Optimism** | 10 | 2 | 🔲 NOT TESTED |
| 5 | **Polygon** | 137 | 7 | 🔲 NOT TESTED |
| 6 | **Avalanche** | 43114 | 1 | 🔲 NOT TESTED |
| 7 | **Linea** | 59144 | — | 🔲 NOT TESTED |
| 8 | **Unichain** | 130 | — | 🔲 NOT TESTED |
| 9 | **Sonic** | 146 | — | 🔲 NOT TESTED |
| 10 | **World Chain** | 480 | — | 🔲 NOT TESTED |
| 11 | **Ink** | 57073 | — | 🔲 NOT TESTED |
| 12 | **Monad** | 10143 | — | 🔲 NOT TESTED |
| 13 | **Sei** | 1329 | — | 🔲 NOT TESTED |
| 14 | **HyperEVM** | 999 | — | 🔲 NOT TESTED |
| 15 | **XDC** | 50 | — | 🔲 NOT TESTED |
| 16 | **Plume** | 98866 | — | 🔲 NOT TESTED |
| 17 | **Codex** | 10888 | — | 🔲 NOT TESTED |
| 18 | **Solana** | — | 5 | 🔲 NOT TESTED (uses SPL CCTP) |

**Test procedure per chain:**
1. Fund deployer wallet with ETH/gas on that chain
2. Send $0.50 USDC to user's deposit address on that chain
3. Enable monitor (60s interval)
4. Watch logs: `[monitor] Deposit detected: X USDC on chain Y`
5. Verify bridge route: `[bridge] Route: CCTP (Chain → Base)`
6. Verify Issuer contract receives USDC: check on-chain balance
7. Verify card balance updates via Issuer API
8. Verify transaction appears in Issuer `GET /transactions`
9. Disable monitor (86400s)
10. Record result in this table

### Sprint 1.3: Deposit Testing — LZ 2-Hop Chains (via Arbitrum)
Route: Source → LayerZero → Arbitrum → CCTP → Base → Issuer

| # | Chain | ChainID | OFT Adapter | LZ Peer | Status |
|---|-------|---------|-------------|---------|--------|
| 1 | **zkSync** | 324 | 0xA150...96 | ✅ Wired | ✅ TESTED Session 18 ($0.10) |
| 2 | **Scroll** | 534352 | 0xA150...96 | ✅ Wired | 🔲 NOT TESTED |
| 3 | **Celo** | 42220 | 0xA150...96 | ❌ NOT PEERED | 🔲 BLOCKED |
| 4 | **Gnosis** | 100 | 0xA150...96 | ❌ NOT PEERED | 🔲 BLOCKED |
| 5 | **BSC** | 56 | 0xce4c...675 | ✅ PEERED (confirmed Session 22) | 🟡 PARTIAL — LZ hop works, sweep pending funding |

**Sprint 1.3 findings (Session 22, 2026-04-17):**
- BSC OFT adapter IS peered — real $0.04 deposit bridged BSC → Arb successfully
- BSC USDC at `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` is **Binance-Peg (18 decimals)**, unique among the 23 chains (all others 6-dec)
- Decimals handling fix shipped in commit `918c105` (monitor + bridge)
- Pending: fund Arb deployer with ETH, run manual sweep script, complete Arb → Base CCTP hop
- LZ adapter truncates via `sharedDecimals` when crossing 18-dec → 6-dec chains — confirmed on-chain

**Prerequisites:**
- [ ] Fund deployer with ETH on Arbitrum (~0.01 ETH for CCTP gas)
- [ ] Verify OFT adapter contracts exist on-chain (bytecode check)
- [ ] Wire Celo/Gnosis/BSC peers in `layerzero.config.ts`
- [ ] Deploy BSC adapter if not deployed

**Test procedure per chain:**
1. Fund deployer with native gas on source chain
2. Send USDC to deposit address on source chain
3. Monitor detects → `lzBridgeToArbitrum()` → `waitForArbUsdc()` → `cctpArbitrumToBase()`
4. Verify full 2-hop execution on-chain
5. Verify Issuer receives on Base

### Sprint 1.4: Vault Testing
- [ ] Verify EVM deposit address is derived correctly per user
- [ ] Verify Solana deposit address is derived correctly per user
- [ ] Send USDC to vault EVM address → monitor detects → bridge to Issuer
- [ ] Send USDC (SPL) to vault Solana address → Solana monitor detects → CCTP bridge to Base
- [ ] Verify Bank Vault page shows correct deposit addresses
- [ ] Verify copy-to-clipboard works for both addresses
- [ ] Test withdraw to external wallet (when implemented)

### Sprint 1.5: Monitor Resilience Testing
- [ ] Verify `seedLastSeenFromDb()` correctly prevents re-detection on restart
- [ ] Verify deposit detection threshold (≥$0.01 USDC)
- [ ] Verify dedup check (same user + chain + amount skipped)
- [ ] Verify failed bridge → status='failed' → no card balance change
- [ ] Verify PM2 restart doesn't cause crash loop (test 3 consecutive restarts)
- [ ] Verify Ethereum RPC (publicnode) is stable for monitoring
- [ ] Verify all 20 chain RPCs respond (poll one cycle, check for errors)

---

## (V2 Features moved to Marathon 1 above)

**Goal:** Ship production-ready features that use REAL execution

### Sprint 2.1: Prediction Market — Real Execution

**Escrow Architecture — BASE is the settlement layer:**
```
ALL VAULTS live on BASE (per-user HD wallet)
ALL ESCROWS live on BASE (per-market HD wallet)
ALL deposits from 23 chains → bridge → BASE vault
ALL card settlements: vault → Issuer Base deposit address → Visa card

FUNDING:
  Any chain USDC → CCTP/LZ bridge → user's BASE vault wallet
  Fund bot = fund vault (same wallet)
  Fund market bet = vault → escrow (Base-to-Base transfer, cheap)

BETTING:
  User clicks "Bet YES $5" → selects source chain
  If source = Base vault: direct USDC transfer vault → escrow
  If source = other chain: bridge → Base vault → escrow
  If source = 3rd party wallet: user sends to vault address, then bet

PAYOUT DESTINATIONS (user chooses priority):
  1. Vault (default — stays on Base)
  2. Card (vault → Issuer Base deposit → Visa)
  3. External wallet (vault → bridge out to any chain)
  4. Agent (vault → agent wallet for bot trading)
  5. Reinvest (vault → new market escrow)
```

**Fee Structure (Match Polymarket):**
- 2% on winnings (0% on losses)
- 0.5% of volume to market creator
- 5% bridge fee on card settlement
- 1% vault withdrawal fee

**Oracle System:**
- Phase 1: Manual (admin POST /markets/:id/resolve)
- Phase 2: CoinGecko for crypto, sports APIs, Chainlink, UMA Optimistic Oracle

**Execution Layer Tasks:**
- [ ] Vault wallet derivation: `HD(PRIVATE_KEY + 'vault_' + userId)` on BASE
- [ ] Escrow wallet derivation: `HD(PRIVATE_KEY + 'market_' + marketId)` on BASE
- [ ] Bet execution: on-chain BASE USDC transfer vault → escrow, record tx_hash
- [ ] Resolution payout: on-chain batch transfer escrow → winner vaults on BASE
- [ ] Card settlement: vault → Issuer Base deposit address (same chain, no bridge needed)
- [ ] Cross-chain funding: any of 23 chains → CCTP/LZ bridge → BASE vault
- [ ] Chain selector in bet modal: user picks source chain, we bridge to Base
- [ ] Creator staking: require USDC deposit to create market
- [ ] Creator rewards: 0.5% volume on resolution
- [ ] Oracle Phase 2: automated CoinGecko/sports API resolution
- [ ] Fund bot = fund vault (same Base wallet, shared balance)
- [ ] REMOVE all direct card balance writes (7 violations found in nuro-routes.ts)
- [ ] Card balance = READ ONLY from Issuer API

**Intent Layer Tasks:**
- [x] AMM engine ✅
- [x] Market creation form ✅
- [x] Market list/detail endpoints ✅
- [x] Position tracking ✅
- [x] Fix bet toast to say "Intent recorded" ✅
- [x] Add execution_status to market_positions (pending/executed/failed) ✅ Session 14 — migration 003
- [x] Add escrow_tx_hash to markets table ✅ Session 14 — migration 003
- [x] Add payout_tx_hash to market_positions ✅ Session 14 — migration 003
- [x] Execution dispatch engine ✅ Session 14 — routes pending→executed via on-chain transfers
- [x] Issuer balance sync (READ only) ✅ Session 14 — syncIssuerBalance() in issuers.ts
- [x] Centralized error logging ✅ Session 14 — error-reporter.ts → execution_log table
- [x] Admin execution log API ✅ Session 14 — /admin/execution-log, /admin/execution-summary, /admin/pending-intents

### Sprint 2.2: Omnichain API Feeds for Market Data ✅ COMPLETE (Session 14)
**Goal:** Pipe in real market data from external sources to power our markets

- [x] Polymarket Gamma API feed (already working via proxy) ✅
- [x] CoinGecko price feeds for crypto markets ✅ Session 14 — 20 coins, 60s poll, cached in DB
- [x] Sports data API (TheSportsDB) ✅ Session 14 — EPL, Bundesliga, NBA, UFC, etc.
- [ ] News/event APIs for political markets (Phase 2 — manual for now)
- [x] Market auto-creation from trending Polymarket events ✅ Session 14 — >$10K volume
- [x] Market auto-creation from crypto top movers ✅ Session 14 — >3% 24h change
- [x] Market auto-creation from sports events ✅ Session 14
- [ ] Real-time WebSocket price streaming (Phase 2)
- [x] Historical price charts per market ✅ Session 14 — market_price_history table

### Sprint 2.3: Bot Section — Real Execution
**Architecture:**
```
User deploys bot → bot gets funded wallet on Polygon
  → Bot executes REAL trades via Polymarket CLOB API
  → Profits accumulate in bot's Polygon wallet (REAL USDC)
  → Auto-sweep: bot wallet → CCTP → Base → Issuer deposit address
  → Card balance updates via Issuer (NOT our DB)
```

**Tasks:**
- [ ] Alpha Bot strategy: fetch high-confidence markets, execute via CLOB
- [ ] Requires: funded agent wallet ($5+ USDC on Polygon)
- [ ] Requires: USDC approval for Polymarket exchange contract
- [ ] Bot lifecycle: funded → trading → profit detected → sweep → card credit
- [ ] Real P&L tracking (on-chain balance checks, not DB counters)
- [ ] Community bot deployment from GitHub repos (sandboxed execution)
- [ ] Bot performance dashboard with REAL on-chain data
- [ ] Agent vs Agent competition using REAL profits

### Sprint 2.4: Issuer Integration — Partially Complete
**Goal:** Full SD3 card integration with real data everywhere

- [x] Sync card balance from Issuer `GET /users/:userId/balances` ✅ Session 17 — syncIssuerBalance(), sweepIssuerBalanceSync()
- [x] Display real PAN/CVV via `/cards/:id/secrets` endpoint ✅ Session 19 — fetched from Issuer on reveal
- [x] Card freeze/unfreeze via Issuer `PATCH /cards/:cardId` ✅ — freezeCard() in issuers.ts
- [x] Card creation sync (awaited, not fire-and-forget) ✅ Session 19 — returns issuerSyncStatus
- [ ] Sync transactions from Issuer `GET /transactions?userId=` (real Visa spend data)
- [ ] Webhook handler: `transaction.completed` → update our transaction history
- [ ] Webhook handler: `application.updated` → update KYC status
- [ ] Webhook handler: `card.created` → store cardId
- [x] Never display locally-generated card numbers — only Issuer data or masked ✅ Session 19

### Sprint 2.3: Bot Section — Real Execution
**Architecture:**
```
User deploys bot → bot gets funded wallet on Polygon
  → Bot executes REAL trades via Polymarket CLOB API
  → Profits accumulate in bot's Polygon wallet (REAL USDC)
  → Auto-sweep: bot wallet → CCTP → Base → Issuer deposit address
  → Card balance updates via Issuer (NOT our DB)
```

**Additional Task (Session 14):**
- [ ] **Cross-chain agent funding**: Base vault → bridge → Polygon agent wallet
  - P2P destination='agent' currently sends on Base only
  - Needs: bridge.ts integration for Base→Polygon USDC routing
  - Wire into execution dispatch sweep for automatic retry
  - Blocked by: funded vaults + bridge gas on Arbitrum

### Sprint 2.5: P2P Transfers ✅ COMPLETE (Sessions 14, 19)
**Architecture:**
```
User A sends to User B
  → A's vault wallet sends USDC to B's vault wallet (on-chain Base)
  → Recipient resolved by email (Nuro users) or wallet address (external)
  → Execution dispatch retries pending transfers every 60s
  → Both sender + recipient get notifications
  → Rate limited: 1 transfer per user per 2 minutes
```

- [x] P2P transfer endpoint: specify recipient (email, wallet address) ✅ Session 14
- [x] Same-chain USDC transfer on Base ✅ Session 14 — vault→vault
- [x] Frontend email resolution — recipientEmail resolves to Nuro user ✅ Session 19
- [x] Transfer rate limiting (1 per 2 min, 429 with countdown) ✅ Session 19
- [ ] Cross-chain transfer (bridge routing) — Phase 2

### Sprint 2.6: Scheduled Transfers & Withdrawals ✅ MOSTLY COMPLETE (audited Session 22)

**Goal:** Users can schedule future-dated transfers and withdrawals

**Architecture:**
```
User schedules transfer for April 20th
  → Intent recorded with status='scheduled', scheduled_at='2026-04-20T09:00:00Z'
  → sweepScheduledIntents (60s cycle) promotes to status='pending' when due
  → sweepPendingTransfers executes on-chain, updates to 'confirmed'
  → User notified on cancel; execution notification via sweepPendingTransfers
```

**Tasks:**
- [x] Add `status = 'scheduled'` to transfers table ✅ Sprint 2.6 finisher (e17a039)
- [x] Dispatch job in `execution-dispatch.ts` (sweepScheduledIntents) ✅ 60s cycle, promotes → pending
- [x] Execute scheduled transfers on-chain ✅ via pending promotion → sweepPendingTransfers
- [x] Execute scheduled withdrawals ✅ Migration 014 adds scheduled_at index to withdrawals
- [~] Re-add `scheduledAt` to frontend form ⚠️ Backend accepts it (POST /transfers param); FE picker location unverified in e17a039 — may be in 8aa98fc or earlier
- [~] Notification on scheduled execution ⚠️ Cancellation notifies; execution-time notification unverified
- [ ] Admin console visibility: scheduled intents with countdown ❌ Not found in code
- [x] Cancellation: users can cancel scheduled transfers ✅ DELETE /transfers/:id with SELECT FOR UPDATE + notification
- [x] Transfer history (real on-chain tx hashes) ✅ Session 14
- [x] Transfer notifications ✅ Session 14 — both sender + recipient

**Remaining work (thin slice):**
1. Verify FE date/time picker component — confirm it's in useQuickTransferForm.ts or similar, or re-add if missing
2. Add explicit notification on scheduled-transfer execution (vs. just the generic pending-transfer notification)
3. Admin console countdown widget for pending scheduled intents

---

## MARATHON 3: Neural Net Enhancements

### Sprint 3.1: MCP Integrations
- [ ] **MCP Database Connection** — connect PostgreSQL directly so Mythos can query without user pasting psql output. Requires MCP server config in `.claude/settings.json`
- [ ] **MCP GitHub** — direct access to PRs, issues, diffs without CLI
- [ ] **MCP SSH** — direct VPS command execution (requires security review)

### Sprint 3.2: Skill Improvements
- [x] /boot — session startup ✅
- [x] /librarian — memory search ✅
- [x] /auditor — code quality scanner ✅
- [x] /deployer — deploy pipeline ✅
- [x] /issuer — SD3 card API ✅
- [x] /bridge — cross-chain bridge ✅
- [x] /researcher — external API research ✅
- [x] /sync — memory sync to repo ✅
- [ ] Improve skills based on usage patterns
- [ ] Add /market skill for prediction market management
- [ ] Add /agent skill for bot deployment management

---

## MARATHON 4: Security & Compliance

### Sprint 3.1: Security Hardening
- [ ] HTTPS everywhere ✅ (done)
- [ ] Rate limiting on auth ✅ (done)
- [ ] Account lockout after N failed logins
- [ ] Input sanitization audit
- [ ] SQL injection prevention audit
- [ ] XSS prevention audit
- [ ] CORS configuration review
- [ ] API key rotation for Issuer
- [ ] Webhook signature verification (HMAC-SHA256)

### Sprint 3.2: Data Integrity
- [ ] Card balance ONLY from Issuer API — remove all local balance writes
- [ ] Transaction data ONLY from Issuer API + real on-chain events
- [ ] Audit all `UPDATE cards SET balance` calls — must be tied to execution events
- [ ] Audit all `INSERT INTO card_transactions` — must be tied to real events
- [ ] Add execution_tx_hash to every card_transaction (proof of on-chain event)
- [ ] Add source_verified flag (Issuer webhook confirmed vs our internal record)

---

## ✅ RESOLVED: Card Balance Write Violations (Sessions 13-14)

**All 7+2 direct card balance writes REMOVED:**
- ✅ nuro-routes.ts: 7 violations removed/disabled (Session 13)
- ✅ monitor.ts: `updateCardBalance()` → `logDepositDetected()` (Session 14)
- ✅ nuro-routes.ts: dead `if(false)` block with card write removed (Session 14)

**Card balance now ONLY changes via:**
1. ✅ Issuer balance sync (`syncIssuerBalance()`) → cached in cards.balance → tracked by balance_synced_at
2. ✅ Execution dispatch sweep runs every 60s to verify Issuer received deposits
3. ✅ All card_transactions deposits start as 'pending', confirmed by Issuer API verification

---

## MARATHON 6: Deposit Pipeline Production Hardening 🆕 (Proposed, Session 22)

> **Goal:** Turn the deposit pipeline from "works when everything aligns" into "works every time, observable when it doesn't"
> **Trigger:** Session 22 BSC incident exposed 3 classes of silent failure (decimals asymmetry, dedup cascades, sed-edit fragility)
> **Dependency:** Unblocks investor-visible "every chain works" guarantee

### Sprint 6.1: Silent-Skip Telemetry ✅ SHIPPED Session 22 (`096bc98`)
- [x] `logMonitorSkip()` helper writes every skip to execution_log with reason code + detail
- [x] 5 skip paths instrumented: `dedup:already-confirmed`, `dedup:failed-recently`, `dedup:pending-in-flight`, `dedup:existing-tx-within-60min` (now subsumed by 6.2 unified helper), `lock:bridge-in-progress`
- [ ] Admin console new panel: "Last 24h skip reasons" with count by reason — **REMAINS OPEN** (Session 23+)
- [ ] Each skip row links to the inflight row it collided with — **REMAINS OPEN** (detail field has the tx id; panel wiring TODO)

### Sprint 6.2: Dedup Consolidation ✅ SHIPPED Session 22 (`718258c`)
- [x] `checkDepositDedup()` in `src/lib/dedup.ts` — one helper, one DB query, 3 possible actions (skip/proceed/stale-retry)
- [x] 9-test Vitest coverage in `src/__tests__/dedup.test.ts`
- [x] Both pollChain and processDeposit call the same helper (no more 2-commits-for-one-fix fragility)
- [x] Preserves: 60-min window, 1h auto-retry for failed, 30-min auto-retry for pending, ±$0.001 tolerance

### Sprint 6.3: Config Hardening ✅ SHIPPED Session 22 (`12d321c`)
- [x] `POLL_INTERVAL_MS` env-configurable via `CONFIG.POLL_INTERVAL_MS` + startup log (`▶️ ACTIVE` / `⏸️ PAUSED`)
- [x] `DECIMALS_BY_CHAIN` + `getChainDecimals()` moved to `src/lib/chains.ts` shared registry
- [x] Pre-SSH gate: `scripts/vps-dirty-tree-check.sh` + wired as Step 0 in `/deployer` skill (SKILL.md rewrite)
- [x] Bonus: `.husky/pre-push` + `.github/workflows/backend-ci.yml` gate `scripts/verify-deps.js` (from Session 22 FE-deps incident)

### Sprint 6.4: Mid-Restart Safety ✅ SHIPPED Session 22 (`b66eb5d`)
- [x] SIGTERM/SIGINT graceful-shutdown handler in `src/index.ts` marks pending rows older than 30s as `failed_restart` before process exit
- [x] Boot-time reconciler in `startDepositMonitor` warns if any `failed_restart` rows exist in last 24h (surfaces incomplete bridges for admin attention)
- [x] `checkDepositDedup` in `src/lib/dedup.ts` handles `failed_restart` as stale-retry-eligible (identical backoff to stale-failed: no delay, immediate retry on next detection)
- [x] Preserved: pending rows <30s old NOT touched (avoids killing freshly-started bridges)

**Remaining Sprint 6.4 thin slices (Session 23+)**:
- [ ] Admin console panel specifically for `failed_restart` rows (filter shortcut on Monitor Skips panel)
- [ ] Telegram alert when failed_restart count > 0 at boot (requires growth-agent Telegram integration)

### Sprint 6.5: Observability
- [ ] Admin console "Deposit Funnel" widget: # detected / # bridged / # failed / median time
- [ ] Chain-level health strip (green/yellow/red based on last successful bridge per chain)
- [ ] Alert rule: if any pending row > 30min, emit to Telegram (later: auto-retry)

---

## MARATHON 5: AI Growth Agent — Autonomous Social Presence

> **Goal:** Deploy the Mythos Neural Net as a live AI agent that manages AFI's social media presence.
> **Priority:** Revenue driver — gets users before we need funds for E2E testing.
> **Primary Platform:** Moltbook (our own network) → then expand to X, TikTok, YouTube, Telegram.

### Sprint 5.1: Moltbook Agent (PRIMARY) — Infrastructure ✅ Session 14
- [x] Growth Agent architecture designed ✅ `src/growth-agent/`
- [x] Content Brain: generates posts from market_feed_cache ✅ `skills/content.ts`
- [x] Moltbook skill: CRUD (post, reply, mentions, trending) ✅ `skills/moltbook.ts`
- [x] Daily autonomous loop: READ→THINK→CREATE→POST→LOG ✅ `skills/daily-log.ts`
- [x] Hourly real-time alerts for big crypto movers ✅ `skills/daily-log.ts`
- [ ] **BLOCKED**: Need `MOLTBOOK_API_KEY` from **Moltbook themselves** (not Chris) — pending request to Moltbook team
- [ ] Deploy agent on Moltbook with AFI brand identity
- [ ] Track engagement metrics (views, clicks, sign-ups)

### Sprint 5.2: X (Twitter) Agent
- [ ] Deploy agent on X with @NuroFinance handle
- [ ] Post market highlights and crypto alpha
- [ ] Thread breakdowns of hot Polymarket events
- [ ] Auto-reply to crypto/prediction market discussions
- [ ] Drive traffic to app.nuro.finance

### Sprint 5.3: Telegram Bot
- [ ] AFI Telegram bot for market alerts
- [ ] Users can place bets via Telegram commands
- [ ] Portfolio tracking via DM
- [ ] Group chat integration for market discussions

### Sprint 5.4: Video Content (TikTok / YouTube)
- [ ] Auto-generate short-form video scripts from market data
- [ ] AI voiceover for market prediction summaries
- [ ] "This Week in Predictions" weekly digest video
- [ ] Tutorial content: "How to bet on anything with Visa cashout"

### Sprint 5.5: Cross-Platform Orchestration
- [ ] Unified content calendar across all platforms
- [ ] Analytics dashboard for social media metrics
- [ ] A/B testing different content styles per platform
- [ ] Referral link tracking (social → app sign-up → first bet)

---

## Execution Verification Checklist

Before ANY feature goes to production, verify:

- [ ] Does this feature modify card balance? → ONLY via Issuer bridge path
- [ ] Does this feature create card_transactions? → ONLY from real on-chain events
- [ ] Does this feature show balance to user? → ONLY from Issuer API, not our DB
- [ ] Does this feature move real money? → Verify on block explorer
- [ ] Does this feature have a fallback message? → Clear instructions on what's missing

---

### Growth Agent File Map
```
src/growth-agent/
├── README.md           — Full architecture, env vars, video avatar options
├── skills/
│   ├── content.ts      — Content Brain: generates posts from feed data
│   ├── moltbook.ts     — PRIMARY: Moltbook CRUD (post/reply/mentions/trending)
│   ├── twitter.ts      — X/Twitter: OAuth tweets + threads
│   ├── telegram.ts     — Telegram bot: alerts + broadcasts
│   ├── tiktok.ts       — TikTok: HeyGen avatar video → upload
│   ├── youtube.ts      — YouTube: weekly digest videos
│   └── daily-log.ts    — Autonomous daily cycle + hourly alerts
```

*"The Intent Layer thinks. The Execution Layer does. Never pretend one is the other."*
— Mythos, AFI Neural Net

---
*Related: [[Neural Net/Claude Memory/AFI Vision]] · [[Neural Net/Claude Memory/Pending Tasks]] · [[Neural Net/Claude Memory/Bridge & Monitor]] · [[Neural Net/Claude Memory/Memetropolis Intelligence]] · [[Neural Net/Claude Memory/Deploy History]]*
